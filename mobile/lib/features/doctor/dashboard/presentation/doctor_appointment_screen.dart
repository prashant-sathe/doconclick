import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../shared/models/appointment.dart';
import '../../../../shared/models/prescription.dart';
import '../../../../shared/widgets/consultation_timer.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../data/doctor_appointments_repository.dart';

/// A doctor's view of a single appointment — travel-status control for home
/// visits, structured prescription editor, notes, and completion.
class DoctorAppointmentScreen extends ConsumerStatefulWidget {
  const DoctorAppointmentScreen({super.key, required this.appointmentId});
  final String appointmentId;

  @override
  ConsumerState<DoctorAppointmentScreen> createState() =>
      _DoctorAppointmentScreenState();
}

class _DoctorAppointmentScreenState
    extends ConsumerState<DoctorAppointmentScreen> {
  final _notesController = TextEditingController();
  final _otpController = TextEditingController();
  final List<_MedicineRow> _medicines = [];
  bool _initialized = false;
  bool _busy = false;

  @override
  void dispose() {
    _notesController.dispose();
    _otpController.dispose();
    for (final m in _medicines) {
      m.dispose();
    }
    super.dispose();
  }

  void _initFrom(Appointment appt) {
    if (_initialized) return;
    _initialized = true;
    _notesController.text = appt.doctorNotes ?? '';
    if (appt.medicines.isEmpty) {
      _medicines.add(_MedicineRow());
    } else {
      _medicines.addAll(appt.medicines.map(_MedicineRow.fromMedicine));
    }
  }

  Future<void> _updateTravel(String status) async {
    setState(() => _busy = true);
    try {
      Position? position;
      try {
        position = await Geolocator.getCurrentPosition();
      } catch (_) {
        // Location optional — travel status still updates without coordinates.
      }
      await ref
          .read(doctorAppointmentsRepositoryProvider)
          .updateTravelStatus(
            widget.appointmentId,
            status,
            lat: position?.latitude,
            lng: position?.longitude,
          );
      ref.invalidate(doctorAppointmentsListProvider);
      if (mounted) setState(() {});
    } on DoctorApiError catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _savePrescription() async {
    setState(() => _busy = true);
    try {
      final medicines = _medicines
          .where((m) => m.nameController.text.trim().isNotEmpty)
          .map((m) => m.toMedicine())
          .toList();
      await ref
          .read(doctorAppointmentsRepositoryProvider)
          .saveMedicines(widget.appointmentId, medicines);
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Prescription saved.')));
    } on DoctorApiError catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteAttachment(PrescriptionAttachment attachment) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete attachment?'),
        content: Text(
          'Remove "${attachment.fileName ?? 'this file'}" from this appointment?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(doctorAppointmentsRepositoryProvider)
          .deleteAttachment(widget.appointmentId, attachment.id);
      ref.invalidate(doctorAppointmentsListProvider);
    } on DoctorApiError catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _attachFiles() async {
    final picked = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    );
    if (picked.isEmpty) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(doctorAppointmentsRepositoryProvider)
          .uploadAttachments(widget.appointmentId, picked);
      ref.invalidate(doctorAppointmentsListProvider);
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Uploaded.')));
    } on DoctorApiError catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _complete() async {
    setState(() => _busy = true);
    try {
      await _savePrescriptionSilently();
      await ref
          .read(doctorAppointmentsRepositoryProvider)
          .updateStatus(
            widget.appointmentId,
            kStatusCompleted,
            doctorNotes: _notesController.text.trim(),
          );
      ref.invalidate(doctorAppointmentsListProvider);
      if (mounted) Navigator.of(context).pop();
    } on DoctorApiError catch (e) {
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Not completed yet'),
            content: Text(e.message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verifyOtp() async {
    final otp = _otpController.text.trim();
    setState(() => _busy = true);
    try {
      await ref
          .read(doctorAppointmentsRepositoryProvider)
          .verifyOtp(widget.appointmentId, otp);
      ref.invalidate(doctorAppointmentsListProvider);
    } on DoctorApiError catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
        _otpController.clear();
        setState(() {});
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _savePrescriptionSilently() async {
    final medicines = _medicines
        .where((m) => m.nameController.text.trim().isNotEmpty)
        .map((m) => m.toMedicine())
        .toList();
    if (medicines.isNotEmpty) {
      await ref
          .read(doctorAppointmentsRepositoryProvider)
          .saveMedicines(widget.appointmentId, medicines);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appointmentsAsync = ref.watch(doctorAppointmentsListProvider);

    return Scaffold(
      appBar: const GradientAppBar(title: 'Consultation'),
      body: appointmentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (all) {
          final appt = all
              .where((a) => a.id == widget.appointmentId)
              .firstOrNull;
          if (appt == null) {
            return const Center(child: Text('Appointment not found.'));
          }
          _initFrom(appt);
          final arrivedForHome =
              appt.consultType != kConsultTypeHome ||
              appt.travelStatus == kTravelArrived;
          final otpVerified = appt.otpVerifiedAt != null;
          final canEditPrescription = arrivedForHome && otpVerified;

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                appt.patientName ?? appt.patient?.name ?? 'Patient',
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              Text(
                '${appt.consultType} · ${DateFormat('MMM d, h:mm a').format(appt.scheduledAt.toLocal())}',
                style: TextStyle(color: Colors.grey[600]),
              ),
              const SizedBox(height: 4),
              Text(appt.symptoms),
              const SizedBox(height: 16),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  FilledButton.tonalIcon(
                    onPressed: () =>
                        context.push('/doctor/appointments/${appt.id}/chat'),
                    icon: appt.unreadMessageCount > 0
                        ? Badge(
                            label: Text('${appt.unreadMessageCount}'),
                            child: const Icon(Icons.chat_bubble_outline),
                          )
                        : const Icon(Icons.chat_bubble_outline),
                    label: const Text('Chat with patient'),
                  ),
                  if (appt.patient?.mobile case final mobile?
                      when mobile.isNotEmpty)
                    OutlinedButton.icon(
                      onPressed: () =>
                          launchUrl(Uri(scheme: 'tel', path: mobile)),
                      icon: const Icon(Icons.call_outlined),
                      label: const Text('Call patient'),
                    ),
                ],
              ),
              if (appt.consultType == kConsultTypeHome) ...[
                const Divider(height: 32),
                Text(
                  'Travel status',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text('Current: ${appt.travelStatus.replaceAll('_', ' ')}'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    if (appt.travelStatus == kTravelNotStarted)
                      FilledButton(
                        onPressed: _busy
                            ? null
                            : () => _updateTravel(kTravelOnTheWay),
                        child: const Text('Start journey'),
                      ),
                    if (appt.travelStatus == kTravelOnTheWay) ...[
                      OutlinedButton(
                        onPressed: _busy
                            ? null
                            : () => _updateTravel(kTravelOnTheWay),
                        child: const Text('Update location'),
                      ),
                      FilledButton(
                        onPressed: _busy
                            ? null
                            : () => _updateTravel(kTravelArrived),
                        child: const Text('Mark arrived'),
                      ),
                    ],
                  ],
                ),
              ],
              const Divider(height: 32),
              Text(
                'Prescription',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              if (!arrivedForHome)
                const Text(
                  'Mark yourself arrived at the patient\'s location to add a prescription, notes, or reports.',
                )
              else if (!otpVerified) ...[
                const Text(
                  'Ask the patient for their 6-digit visit code to begin the consultation.',
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  maxLength: 6,
                  autofillHints: const [],
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 6,
                  ),
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: "Patient's OTP",
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: (_busy || _otpController.text.trim().length != 6)
                        ? null
                        : _verifyOtp,
                    child: const Text('Verify'),
                  ),
                ),
              ] else ...[
                ConsultationTimer(
                  startedAt: appt.otpVerifiedAt!,
                  endedAt: appt.completedAt,
                ),
                const SizedBox(height: 12),
                for (final m in _medicines)
                  _MedicineFields(
                    row: m,
                    onRemove: () => setState(() => _medicines.remove(m)),
                  ),
                TextButton.icon(
                  onPressed: () =>
                      setState(() => _medicines.add(_MedicineRow())),
                  icon: const Icon(Icons.add),
                  label: const Text('Add medicine'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _notesController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Doctor notes',
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 12),
                if (appt.attachments.isNotEmpty) ...[
                  Text(
                    'Attached reports',
                    style: Theme.of(context).textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  for (final a in appt.attachments)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.insert_drive_file_outlined),
                      title: Text(a.fileName ?? 'Attachment'),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: _busy ? null : () => _deleteAttachment(a),
                      ),
                    ),
                  const SizedBox(height: 4),
                ],
                OutlinedButton.icon(
                  onPressed: _busy ? null : _attachFiles,
                  icon: const Icon(Icons.attach_file),
                  label: const Text('Attach reports / scans'),
                ),
              ],
              if (canEditPrescription) ...[
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy ? null : _savePrescription,
                        child: const Text('Save prescription'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: (_busy || appt.status != kStatusScheduled)
                            ? null
                            : _complete,
                        child: const Text('Mark complete'),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _MedicineRow {
  _MedicineRow();
  factory _MedicineRow.fromMedicine(PrescriptionMedicine m) {
    final row = _MedicineRow();
    row.nameController.text = m.name;
    row.dosageController.text = m.dosage;
    row.frequencyController.text = m.frequency;
    row.durationController.text = m.duration;
    row.instructionsController.text = m.instructions ?? '';
    return row;
  }

  final nameController = TextEditingController();
  final dosageController = TextEditingController();
  final frequencyController = TextEditingController();
  final durationController = TextEditingController();
  final instructionsController = TextEditingController();

  PrescriptionMedicine toMedicine() => PrescriptionMedicine(
    name: nameController.text.trim(),
    dosage: dosageController.text.trim(),
    frequency: frequencyController.text.trim(),
    duration: durationController.text.trim(),
    instructions: instructionsController.text.trim().isEmpty
        ? null
        : instructionsController.text.trim(),
  );

  void dispose() {
    nameController.dispose();
    dosageController.dispose();
    frequencyController.dispose();
    durationController.dispose();
    instructionsController.dispose();
  }
}

class _MedicineFields extends StatelessWidget {
  const _MedicineFields({required this.row, required this.onRemove});
  final _MedicineRow row;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: row.nameController,
                    decoration: const InputDecoration(
                      labelText: 'Medicine name',
                    ),
                  ),
                ),
                IconButton(icon: const Icon(Icons.close), onPressed: onRemove),
              ],
            ),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: row.dosageController,
                    decoration: const InputDecoration(labelText: 'Dosage'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _SelectOrOtherField(
                    label: 'Frequency',
                    options: _kFrequencyOptions,
                    controller: row.frequencyController,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _SelectOrOtherField(
                    label: 'Duration',
                    options: _kDurationOptions,
                    controller: row.durationController,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _SelectOrOtherField(
                    label: 'Instructions',
                    options: _kInstructionsOptions,
                    controller: row.instructionsController,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

const _kFrequencyOptions = {
  'OD': 'OD — Once a day',
  'BD': 'BD — Twice a day',
  'TDS': 'TDS — Thrice a day',
  'QID': 'QID — 4 times a day',
  'SOS': 'SOS — As needed',
};

const _kDurationOptions = {
  '3 days': '3 days',
  '5 days': '5 days',
  '7 days': '7 days',
  '10 days': '10 days',
  '14 days': '14 days',
  '1 month': '1 month',
};

const _kInstructionsOptions = {
  'Before food': 'Before food',
  'After food': 'After food',
  'Empty stomach': 'Empty stomach',
  'With food': 'With food',
  'At bedtime': 'At bedtime',
};

const _kOtherOption = '__other__';

/// A dropdown of common values with a "Custom" text field fallback — used
/// for prescription fields (frequency, duration, instructions) that are
/// usually one of a handful of standard values but occasionally need a
/// free-typed one.
class _SelectOrOtherField extends StatefulWidget {
  const _SelectOrOtherField({
    required this.label,
    required this.options,
    required this.controller,
  });
  final String label;
  final Map<String, String> options;
  final TextEditingController controller;

  @override
  State<_SelectOrOtherField> createState() => _SelectOrOtherFieldState();
}

class _SelectOrOtherFieldState extends State<_SelectOrOtherField> {
  late bool _isOther =
      widget.controller.text.isNotEmpty &&
      !widget.options.containsKey(widget.controller.text);

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          initialValue: _isOther
              ? _kOtherOption
              : (widget.controller.text.isEmpty
                    ? null
                    : widget.controller.text),
          isExpanded: true,
          decoration: InputDecoration(labelText: widget.label),
          items: [
            for (final entry in widget.options.entries)
              DropdownMenuItem(value: entry.key, child: Text(entry.value)),
            const DropdownMenuItem(value: _kOtherOption, child: Text('Other')),
          ],
          onChanged: (value) {
            setState(() {
              _isOther = value == _kOtherOption;
              widget.controller.text = _isOther ? '' : (value ?? '');
            });
          },
        ),
        if (_isOther) ...[
          const SizedBox(height: 8),
          TextField(
            controller: widget.controller,
            decoration: InputDecoration(
              labelText: 'Custom ${widget.label.toLowerCase()}',
            ),
          ),
        ],
      ],
    );
  }
}
