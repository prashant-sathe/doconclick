import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../core/audio/notification_sound.dart';
import '../../../../shared/models/appointment.dart';
import '../../../../shared/utils/doctor_display_name.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../data/patient_appointments_repository.dart';

/// Notable status "events" worth ringing an alert for — mirrors
/// usePatientNotifications.ts's deriveEvent(): PENDING_APPROVAL and a HOME
/// visit still NOT_STARTED aren't events (nothing new for the patient to
/// react to yet), everything else is.
String? _notableEvent(Appointment a) {
  switch (a.status) {
    case kStatusPendingApproval:
      return null;
    case kStatusScheduled:
      if (a.consultType == kConsultTypeHome) {
        if (a.travelStatus == kTravelArrived) return 'ARRIVED';
        if (a.travelStatus == kTravelOnTheWay) return 'ON_THE_WAY';
        return null; // still NOT_STARTED — not yet notable
      }
      return kStatusScheduled;
    default:
      return a.status; // REJECTED, EXPIRED, COMPLETED, CANCELLED
  }
}

class PatientAppointmentsScreen extends ConsumerStatefulWidget {
  const PatientAppointmentsScreen({super.key});

  @override
  ConsumerState<PatientAppointmentsScreen> createState() => _PatientAppointmentsScreenState();
}

class _PatientAppointmentsScreenState extends ConsumerState<PatientAppointmentsScreen> {
  final _lastKnownEvent = <String, String?>{};
  VoidCallback? _stopRinging;
  int? _lastUnreadTotal;
  bool _seeded = false;

  @override
  void dispose() {
    _stopRinging?.call();
    super.dispose();
  }

  void _onAppointments(List<Appointment> appointments) {
    final unreadTotal = appointments.fold<int>(0, (sum, a) => sum + a.unreadMessageCount);

    if (!_seeded) {
      _seeded = true;
      for (final a in appointments) {
        _lastKnownEvent[a.id] = _notableEvent(a);
      }
      _lastUnreadTotal = unreadTotal;
      return;
    }

    var changed = false;
    for (final a in appointments) {
      final event = _notableEvent(a);
      if (event != null && _lastKnownEvent[a.id] != event) changed = true;
      _lastKnownEvent[a.id] = event;
    }
    if (changed) {
      _stopRinging?.call();
      _stopRinging = NotificationSound.startRingingAlert();
    }

    if (_lastUnreadTotal != null && unreadTotal > _lastUnreadTotal!) {
      NotificationSound.playChime();
    }
    _lastUnreadTotal = unreadTotal;
  }

  @override
  Widget build(BuildContext context) {
    final appointmentsAsync = ref.watch(patientAppointmentsListProvider);
    ref.listen(patientAppointmentsListProvider, (previous, next) => next.whenData(_onAppointments));

    return Scaffold(
      appBar: const GradientAppBar(title: 'My appointments'),
      body: appointmentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load your appointments.\n$e', textAlign: TextAlign.center)),
        data: (appointments) {
          if (appointments.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.event_note_outlined, size: 56, color: Colors.grey[350]),
                  const SizedBox(height: 12),
                  Text('No appointments yet', style: TextStyle(color: Colors.grey[600], fontSize: 16)),
                  const SizedBox(height: 4),
                  Text('Book a consultation to see it here.', style: TextStyle(color: Colors.grey[400], fontSize: 13)),
                ],
              ),
            ).animate().fadeIn(duration: 300.ms);
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(patientAppointmentsListProvider.future),
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: appointments.length,
              itemBuilder: (context, i) => _AppointmentTile(appointment: appointments[i], index: i),
            ),
          );
        },
      ),
    );
  }
}

class _AppointmentTile extends StatelessWidget {
  const _AppointmentTile({required this.appointment, this.index = 0});
  final Appointment appointment;
  final int index;

  Color _statusColor(BuildContext context) {
    switch (appointment.status) {
      case kStatusScheduled:
        return Colors.blue;
      case kStatusCompleted:
        return Colors.green;
      case kStatusRejected:
      case kStatusCancelled:
      case kStatusExpired:
        return Colors.red;
      default:
        return Colors.orange;
    }
  }

  @override
  Widget build(BuildContext context) {
    final photoUrl = appointment.doctor?.doctorProfile?.photoUrl;
    final name = doctorDisplayName(appointment.doctor?.name ?? '');
    final onTheWay = appointment.status == kStatusScheduled &&
        appointment.consultType == kConsultTypeHome &&
        appointment.travelStatus == kTravelOnTheWay;
    final arrived = appointment.status == kStatusScheduled &&
        appointment.consultType == kConsultTypeHome &&
        appointment.travelStatus == kTravelArrived;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Column(
        children: [
          ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        onTap: () => context.push('/patient/appointments/${appointment.id}'),
        leading: CircleAvatar(
          radius: 24,
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          backgroundImage: photoUrl != null ? CachedNetworkImageProvider(photoUrl) : null,
          child: photoUrl == null
              ? Text(name.isNotEmpty ? name.replaceFirst('Dr. ', '')[0].toUpperCase() : '?',
                  style: const TextStyle(fontWeight: FontWeight.bold))
              : null,
        ),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(appointment.doctor?.doctorProfile?.specialty ?? ''),
            Text(DateFormat('MMM d, y · h:mm a').format(appointment.scheduledAt.toLocal())),
          ],
        ),
        trailing: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: _statusColor(context), borderRadius: BorderRadius.circular(8)),
              child: Text(appointment.status.replaceAll('_', ' '), style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w600)),
            ),
            if (appointment.unreadMessageCount > 0)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: () => context.push('/patient/appointments/${appointment.id}/chat'),
                  child: Badge(
                    label: Text('${appointment.unreadMessageCount}'),
                    child: const Icon(Icons.chat_bubble_outline, size: 18),
                  ),
                ),
              ),
          ],
        ),
          ),
          if (onTheWay)
            InkWell(
              onTap: () => context.push('/patient/appointments/${appointment.id}/track'),
              child: Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.08),
                  border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.directions_car, size: 16, color: Colors.green),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('Doctor is on the way', style: TextStyle(fontSize: 13, color: Colors.green[800], fontWeight: FontWeight.w600)),
                    ),
                    Text('Track live', style: TextStyle(fontSize: 12, color: Colors.green[800], fontWeight: FontWeight.w700, decoration: TextDecoration.underline)),
                  ],
                ),
              ),
            ),
          if (arrived)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.08),
                border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  Icon(Icons.check_circle_outline, size: 16, color: Colors.blue[800]),
                  const SizedBox(width: 8),
                  Text('Doctor has arrived', style: TextStyle(fontSize: 13, color: Colors.blue[800], fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          if (appointment.status == kStatusScheduled)
            if (appointment.otpVerifiedAt != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                child: Row(
                  children: [
                    Icon(Icons.verified_outlined, size: 14, color: Colors.grey[600]),
                    const SizedBox(width: 6),
                    Text('Verified with your doctor', style: TextStyle(fontSize: 12, color: Colors.grey[600], fontWeight: FontWeight.w600)),
                  ],
                ),
              )
            else if (appointment.otpCode != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.password_outlined, size: 16),
                    const SizedBox(width: 8),
                    Text('Visit OTP: ', style: TextStyle(fontSize: 12, color: Colors.grey[700])),
                    Text(appointment.otpCode!, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, letterSpacing: 2)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text('· share with your doctor', style: TextStyle(fontSize: 11, color: Colors.grey[600]), overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              ),
        ],
      ),
    ).animate().fadeIn(delay: (index.clamp(0, 8) * 40).ms, duration: 280.ms).slideY(begin: 0.08, end: 0, curve: Curves.easeOut);
  }
}
