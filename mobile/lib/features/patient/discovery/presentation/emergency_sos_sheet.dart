import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/location/location_provider.dart';
import '../../../../shared/models/appointment.dart';
import '../../../../shared/models/doctor_profile.dart';
import '../../../../shared/utils/doctor_display_name.dart';
import '../../../../shared/utils/fees.dart';
import '../../booking/data/booking_repository.dart';

/// Mirrors the web's one-tap SOS flow (src/app/patient/dashboard/page.tsx):
/// auto-picks the nearest doctor regardless of specialty filter, defaults
/// consultType to HOME if that doctor offers it (else CLINIC), and skips
/// consent/dependent/scheduling fields entirely — but still requires an
/// explicit "Request Now" tap, it's not silently fired on open.
Future<void> showEmergencySosSheet(
  BuildContext context,
  WidgetRef ref, {
  required List<Doctor> doctors,
}) async {
  final position = await ref.read(currentPositionProvider.future);
  if (!context.mounted) return;

  Doctor? nearest;
  double? nearestKm;
  if (position != null && doctors.isNotEmpty) {
    final located = doctors.where((d) => d.doctorProfile.lat != null && d.doctorProfile.lng != null).toList();
    for (final d in located) {
      final km = haversineKm(position.latitude, position.longitude, d.doctorProfile.lat!, d.doctorProfile.lng!);
      if (nearestKm == null || km < nearestKm) {
        nearestKm = km;
        nearest = d;
      }
    }
  }

  if (nearest == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Couldn't find a nearby doctor. Please check your location settings and try again.")),
    );
    return;
  }

  if (!context.mounted) return;
  await showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (sheetContext) => _EmergencySheetContent(doctor: nearest!, distanceKm: nearestKm),
  );
}

class _EmergencySheetContent extends ConsumerStatefulWidget {
  const _EmergencySheetContent({required this.doctor, this.distanceKm});
  final Doctor doctor;
  final double? distanceKm;

  @override
  ConsumerState<_EmergencySheetContent> createState() => _EmergencySheetContentState();
}

class _EmergencySheetContentState extends ConsumerState<_EmergencySheetContent> {
  final _noteController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    final profile = widget.doctor.doctorProfile;
    final consultType = profile.offersHomeVisit ? kConsultTypeHome : kConsultTypeClinic;
    try {
      await ref.read(bookingRepositoryProvider).createAppointment(
            doctorId: widget.doctor.id,
            symptoms: _noteController.text.trim().isEmpty ? 'Emergency request' : _noteController.text.trim(),
            consultType: consultType,
            amount: feeForConsultType(profile, consultType),
            isEmergency: true,
            consentGiven: true,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Emergency request sent. The doctor has been notified.')),
      );
    } on BookingApiError catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.emergency_rounded, color: Colors.red, size: 28),
              const SizedBox(width: 10),
              Text('Emergency request', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 12),
          Text('Nearest doctor', style: TextStyle(color: Colors.grey[600])),
          Text(
            '${doctorDisplayName(widget.doctor.name)} · ${widget.doctor.doctorProfile.specialty}'
            '${widget.distanceKm != null ? ' · ${widget.distanceKm!.toStringAsFixed(1)} km away' : ''}',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _noteController,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'What\'s the emergency? (optional)', alignLabelWithHint: true),
          ),
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red, minimumSize: const Size.fromHeight(52)),
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                : const Text('Request now'),
          ),
        ],
      ),
    );
  }
}
