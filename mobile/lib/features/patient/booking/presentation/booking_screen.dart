import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../shared/models/appointment.dart';
import '../../../../shared/utils/doctor_display_name.dart';
import '../../../../shared/utils/fees.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../dependents/data/dependents_repository.dart';
import '../../discovery/data/doctor_repository.dart';
import '../data/booking_repository.dart';

/// Unified booking flow reachable from doctor discovery (map/list) and the
/// public doctor profile — mirrors what both of the web's booking pages
/// (`/patient/dashboard`'s modal and `/patient/book`) ultimately POST to
/// `/api/appointments`. `followUpOfId` pre-fills a follow-up booking.
class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({super.key, required this.doctorId, this.followUpOfId});

  final String doctorId;
  final String? followUpOfId;

  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _symptomsController = TextEditingController();
  final _allergiesController = TextEditingController();
  String _consultType = kConsultTypeClinic;
  String? _selectedDependentId; // null == booking for self
  bool _consentGiven = false;
  bool _submitting = false;
  bool _scheduleForLater = false;
  DateTime? _scheduledAt;

  Future<void> _pickScheduleTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _scheduledAt ?? now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 30)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_scheduledAt ?? now),
    );
    if (time == null) return;
    setState(() => _scheduledAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  @override
  void dispose() {
    _symptomsController.dispose();
    _allergiesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_consentGiven) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please agree to the consent statement to continue.')),
      );
      return;
    }
    if (_scheduleForLater && _scheduledAt == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please pick a date and time for your appointment.')),
      );
      return;
    }

    final doctor = await ref.read(doctorDetailProvider(widget.doctorId).future);
    setState(() => _submitting = true);
    try {
      final appointment = await ref.read(bookingRepositoryProvider).createAppointment(
            doctorId: widget.doctorId,
            symptoms: _symptomsController.text.trim(),
            consultType: _consultType,
            amount: feeForConsultType(doctor.doctorProfile, _consultType),
            dependentId: _selectedDependentId,
            allergies: _allergiesController.text.trim().isEmpty ? null : _allergiesController.text.trim(),
            consentGiven: _consentGiven,
            followUpOfId: widget.followUpOfId,
            scheduledAt: _scheduleForLater ? _scheduledAt : null,
          );
      if (!mounted) return;
      _showSuccess(appointment);
    } on BookingApiError catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showSuccess(Appointment appointment) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.check_circle_rounded, color: Colors.green, size: 40),
        title: const Text('Request sent'),
        content: Text(
          'Your booking request was sent to ${doctorDisplayName(appointment.doctor?.name ?? '')}. '
          "You'll be notified once they respond.",
          textAlign: TextAlign.center,
        ),
        actions: [
          FilledButton(
            onPressed: () {
              context.pop();
              context.go('/patient');
            },
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final doctorAsync = ref.watch(doctorDetailProvider(widget.doctorId));
    final dependentsAsync = ref.watch(dependentsListProvider);

    return Scaffold(
      appBar: const GradientAppBar(title: 'Book appointment'),
      body: doctorAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load this doctor.\n$e')),
        data: (doctor) {
          final profile = doctor.doctorProfile;
          final fee = feeForConsultType(profile, _consultType);
          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(doctorDisplayName(doctor.name), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                Text(profile.specialty, style: TextStyle(color: Colors.grey[600])),
                const SizedBox(height: 20),
                Text('Consultation type', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    ChoiceChip(
                      label: const Text('Clinic'),
                      selected: _consultType == kConsultTypeClinic,
                      onSelected: (_) => setState(() => _consultType = kConsultTypeClinic),
                    ),
                    if (profile.offersHomeVisit)
                      ChoiceChip(
                        label: const Text('Home visit'),
                        selected: _consultType == kConsultTypeHome,
                        onSelected: (_) => setState(() => _consultType = kConsultTypeHome),
                      ),
                    const Tooltip(
                      message: 'Video consultation is coming soon',
                      child: ChoiceChip(label: Text('Video'), selected: false, onSelected: null),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text('Fee: ₹${fee.toStringAsFixed(0)}', style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 20),
                Text('Who is this for?', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                dependentsAsync.when(
                  loading: () => const LinearProgressIndicator(),
                  error: (_, _) => const SizedBox.shrink(),
                  data: (dependents) => DropdownButtonFormField<String?>(
                    initialValue: _selectedDependentId,
                    items: [
                      const DropdownMenuItem(value: null, child: Text('Myself')),
                      for (final d in dependents) DropdownMenuItem(value: d.id, child: Text('${d.name} (${d.relation})')),
                    ],
                    onChanged: (v) => setState(() => _selectedDependentId = v),
                  ),
                ),
                const SizedBox(height: 20),
                Text('When?', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    ChoiceChip(
                      label: const Text('Now'),
                      selected: !_scheduleForLater,
                      onSelected: (_) => setState(() => _scheduleForLater = false),
                    ),
                    ChoiceChip(
                      label: const Text('Schedule for later'),
                      selected: _scheduleForLater,
                      onSelected: (_) => setState(() => _scheduleForLater = true),
                    ),
                  ],
                ),
                if (_scheduleForLater) ...[
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _pickScheduleTime,
                    icon: const Icon(Icons.event_outlined),
                    label: Text(
                      _scheduledAt == null
                          ? 'Pick date & time'
                          : DateFormat('MMM d, y · h:mm a').format(_scheduledAt!),
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                TextFormField(
                  controller: _symptomsController,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Symptoms / reason for visit', alignLabelWithHint: true),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Please describe your symptoms' : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _allergiesController,
                  decoration: const InputDecoration(labelText: 'Known allergies (optional)'),
                ),
                const SizedBox(height: 12),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _consentGiven,
                  onChanged: (v) => setState(() => _consentGiven = v ?? false),
                  title: const Text(
                    'I consent to sharing this information with the doctor for the purpose of this consultation.',
                  ),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                        )
                      : const Text('Send booking request'),
                ),
              ],
            ).animate().fadeIn(),
          );
        },
      ),
    );
  }
}
