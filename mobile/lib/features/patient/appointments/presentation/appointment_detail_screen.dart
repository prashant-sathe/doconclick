import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../shared/models/appointment.dart';
import '../../../../shared/payments/cashfree_checkout.dart';
import '../../../../shared/utils/doctor_display_name.dart';
import '../../../../shared/widgets/consultation_timer.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../booking/data/appointment_payment_repository.dart';
import '../../booking/data/booking_repository.dart';
import '../data/patient_appointments_repository.dart';
import 'review_dialog.dart';

Color _statusColor(String status) {
  switch (status) {
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

class AppointmentDetailScreen extends ConsumerWidget {
  const AppointmentDetailScreen({super.key, required this.appointmentId});
  final String appointmentId;

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this booking?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => context.pop(false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => context.pop(true),
            child: const Text('Cancel booking'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref
          .read(patientAppointmentsRepositoryProvider)
          .cancel(appointmentId);
      ref.invalidate(patientAppointmentsListProvider);
      if (context.mounted) Navigator.of(context).pop();
    } on AppointmentApiError catch (e) {
      if (context.mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _pay(BuildContext context, WidgetRef ref) async {
    try {
      final order = await ref
          .read(appointmentPaymentRepositoryProvider)
          .createOrder(appointmentId);
      if (!context.mounted) return;
      CashfreeCheckout.start(
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
        onSuccess: (_) {
          ref.invalidate(appointmentPollingProvider(appointmentId));
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Payment successful.')),
            );
          }
        },
        onError: (message) {
          if (context.mounted)
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(message)));
        },
      );
    } on BookingApiError catch (e) {
      if (context.mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appointmentAsync = ref.watch(
      appointmentPollingProvider(appointmentId),
    );

    return Scaffold(
      appBar: const GradientAppBar(title: 'Appointment'),
      body: appointmentAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            Center(child: Text('Could not load this appointment.\n$e')),
        data: (appt) {
          final scheme = Theme.of(context).colorScheme;
          final photoUrl = appt.doctor?.doctorProfile?.photoUrl;
          final name = doctorDisplayName(appt.doctor?.name ?? '');
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundColor: scheme.primaryContainer,
                            backgroundImage: photoUrl != null
                                ? CachedNetworkImageProvider(photoUrl)
                                : null,
                            child: photoUrl == null
                                ? Text(
                                    name.isNotEmpty
                                        ? name
                                              .replaceFirst('Dr. ', '')[0]
                                              .toUpperCase()
                                        : '?',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 20,
                                    ),
                                  )
                                : null,
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: Theme.of(context).textTheme.titleMedium
                                      ?.copyWith(fontWeight: FontWeight.w700),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  appt.doctor?.doctorProfile?.specialty ?? '',
                                  style: TextStyle(color: Colors.grey[600]),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: _statusColor(appt.status),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              appt.status.replaceAll('_', ' '),
                              style: const TextStyle(
                                fontSize: 11,
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                  .animate()
                  .fadeIn(duration: 280.ms)
                  .slideY(begin: 0.06, end: 0, curve: Curves.easeOut),
              const SizedBox(height: 12),
              Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _row('Type', appt.consultType),
                          _row(
                            'When',
                            DateFormat('MMM d, y · h:mm a')
                                .format(appt.scheduledAt.toLocal()),
                          ),
                          _row('Fee', '₹${appt.amount.toStringAsFixed(0)}'),
                          if (appt.symptoms.isNotEmpty)
                            _row('Symptoms', appt.symptoms),
                        ],
                      ),
                    ),
                  )
                  .animate()
                  .fadeIn(delay: 80.ms, duration: 280.ms)
                  .slideY(begin: 0.06, end: 0, curve: Curves.easeOut),
              if (appt.status == kStatusScheduled) ...[
                if (appt.otpVerifiedAt != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.grey.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.verified_outlined,
                          size: 18,
                          color: Colors.grey[700],
                        ),
                        const SizedBox(width: 10),
                        Text(
                          'Verified with your doctor',
                          style: TextStyle(
                            color: Colors.grey[700],
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  ConsultationTimer(
                    startedAt: appt.otpVerifiedAt!,
                    endedAt: appt.completedAt,
                  ),
                ] else if (appt.otpCode != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.password_outlined, size: 18),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Visit OTP',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey[700],
                                ),
                              ),
                              Text(
                                appt.otpCode!,
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 4,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Flexible(
                          child: Text(
                            'Share this with your doctor when they begin your consultation',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey[600],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
              if (appt.status == kStatusScheduled &&
                  appt.consultType == kConsultTypeHome &&
                  appt.travelStatus == kTravelOnTheWay) ...[
                const SizedBox(height: 12),
                InkWell(
                  onTap: () =>
                      context.push('/patient/appointments/${appt.id}/track'),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.08),
                      border: Border.all(
                        color: Colors.green.withValues(alpha: 0.3),
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.directions_car,
                          size: 18,
                          color: Colors.green,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            '${doctorDisplayName(appt.doctor?.name ?? '')} is on the way',
                            style: TextStyle(
                              color: Colors.green[800],
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Text(
                          'Track live',
                          style: TextStyle(
                            color: Colors.green[800],
                            fontWeight: FontWeight.w700,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              if (appt.status == kStatusScheduled &&
                  appt.consultType == kConsultTypeHome &&
                  appt.travelStatus == kTravelArrived) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.blue.withValues(alpha: 0.08),
                    border: Border.all(
                      color: Colors.blue.withValues(alpha: 0.3),
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.check_circle_outline,
                        size: 18,
                        color: Colors.blue[800],
                      ),
                      const SizedBox(width: 10),
                      Text(
                        '${doctorDisplayName(appt.doctor?.name ?? '')} has arrived',
                        style: TextStyle(
                          color: Colors.blue[800],
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (appt.attachments.isNotEmpty) ...[
                const SizedBox(height: 12),
                Card(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          vertical: 8,
                          horizontal: 8,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                              child: Text(
                                'Reports from your doctor',
                                style: Theme.of(context).textTheme.titleSmall
                                    ?.copyWith(fontWeight: FontWeight.w600),
                              ),
                            ),
                            for (final a in appt.attachments)
                              ListTile(
                                leading: const Icon(
                                  Icons.insert_drive_file_outlined,
                                ),
                                title: Text(a.fileName ?? 'Attachment'),
                                trailing: const Icon(
                                  Icons.open_in_new,
                                  size: 18,
                                ),
                                onTap: () => launchUrl(
                                  Uri.parse(a.url),
                                  mode: LaunchMode.externalApplication,
                                ),
                              ),
                          ],
                        ),
                      ),
                    )
                    .animate()
                    .fadeIn(delay: 130.ms, duration: 280.ms)
                    .slideY(begin: 0.06, end: 0, curve: Curves.easeOut),
              ],
              const SizedBox(height: 24),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  if (appt.paymentMethod == 'ONLINE' &&
                      appt.paymentStatus == 'PENDING' &&
                      appt.status != kStatusCancelled &&
                      appt.status != kStatusRejected &&
                      appt.status != kStatusExpired)
                    FilledButton.icon(
                      onPressed: () => _pay(context, ref),
                      icon: const Icon(Icons.payment_outlined),
                      label: Text('Pay ₹${appt.amount.toStringAsFixed(0)}'),
                    ),
                  if (appt.status == kStatusPendingApproval)
                    OutlinedButton.icon(
                      onPressed: () => _cancel(context, ref),
                      icon: const Icon(Icons.close),
                      label: const Text('Cancel booking'),
                    ),
                  if (appt.status == kStatusScheduled ||
                      appt.status == kStatusCompleted)
                    FilledButton.icon(
                      onPressed: () =>
                          context.push('/patient/appointments/${appt.id}/chat'),
                      icon: appt.unreadMessageCount > 0
                          ? Badge(
                              label: Text('${appt.unreadMessageCount}'),
                              child: const Icon(Icons.chat_bubble_outline),
                            )
                          : const Icon(Icons.chat_bubble_outline),
                      label: const Text('Chat'),
                    ),
                  if (appt.consultType == kConsultTypeHome &&
                      appt.status == kStatusScheduled &&
                      appt.travelStatus != kTravelNotStarted)
                    FilledButton.icon(
                      onPressed: () => context.push(
                        '/patient/appointments/${appt.id}/track',
                      ),
                      icon: const Icon(Icons.map_outlined),
                      label: const Text('Track doctor'),
                    ),
                  if (appt.status == kStatusCompleted)
                    OutlinedButton.icon(
                      onPressed: () => context.push(
                        '/patient/appointments/${appt.id}/prescription',
                      ),
                      icon: const Icon(Icons.description_outlined),
                      label: const Text('Prescription'),
                    ),
                  if (appt.status == kStatusCompleted && appt.review == null)
                    OutlinedButton.icon(
                      onPressed: () => showReviewDialog(
                        context,
                        ref,
                        appointmentId: appt.id,
                      ),
                      icon: const Icon(Icons.star_outline),
                      label: const Text('Leave a review'),
                    ),
                  if (appt.status == kStatusCompleted)
                    OutlinedButton.icon(
                      onPressed: () => context.push(
                        '/patient/book?doctorId=${appt.doctorId}&followUpOf=${appt.id}',
                      ),
                      icon: const Icon(Icons.replay_outlined),
                      label: const Text('Book follow-up'),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(label, style: TextStyle(color: Colors.grey[600])),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
