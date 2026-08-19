import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/audio/notification_sound.dart';
import '../../../../shared/models/appointment.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../../profile/data/doctor_profile_repository.dart';
import '../data/doctor_appointments_repository.dart';

/// The name to show for this appointment — the dependent's own name when
/// booked for a family member, otherwise the account holder's. Mirrors the
/// web's patientLabel() in src/app/doctor/dashboard/page.tsx.
String _patientLabel(Appointment a) =>
    a.relation != 'Self' && a.patientName != null ? a.patientName! : (a.patient?.name ?? 'Patient');

/// Where "view history" for this appointment's patient/dependent leads.
/// Mirrors the web's historyHref().
String _historyPath(Appointment a) =>
    a.dependentId != null ? '/doctor/patients/${a.patientId}?dependentId=${a.dependentId}' : '/doctor/patients/${a.patientId}';

const _typeIcons = {kConsultTypeHome: Icons.home_outlined, kConsultTypeClinic: Icons.apartment_outlined, kConsultTypeVideo: Icons.videocam_outlined};

Uri _navigateUri(double lat, double lng) => Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');

/// Doctor's main dashboard — mirrors src/app/doctor/dashboard/page.tsx's
/// section layout: stat strip, search, Pending Requests, Upcoming
/// Appointments, Recent Completed Visits, Cancelled Appointments. Polls
/// every 5s like the web's dashboard.
///
/// Mirrors src/hooks/useDoctorNotifications.ts + the inline unread-count
/// chime in src/app/doctor/dashboard/page.tsx: a repeating ring on any
/// brand-new PENDING_APPROVAL request (same for emergency or not — the web
/// doesn't treat those differently either), and a one-shot chime whenever
/// the summed unread-message count across appointments increases.
class DoctorHomeScreen extends ConsumerStatefulWidget {
  const DoctorHomeScreen({super.key});

  @override
  ConsumerState<DoctorHomeScreen> createState() => _DoctorHomeScreenState();
}

class _DoctorHomeScreenState extends ConsumerState<DoctorHomeScreen> {
  final _seenPendingIds = <String>{};
  VoidCallback? _stopRinging;
  int? _lastUnreadTotal;
  bool _seeded = false;
  String _search = '';
  bool _upcomingExpanded = false;
  bool _completedExpanded = false;
  bool _cancelledExpanded = false;
  static const _pageSize = 5;

  @override
  void dispose() {
    _stopRinging?.call();
    super.dispose();
  }

  void _onAppointments(List<Appointment> appointments) {
    final pendingIds = appointments.where((a) => a.status == kStatusPendingApproval).map((a) => a.id).toSet();
    final unreadTotal = appointments.fold<int>(0, (sum, a) => sum + a.unreadMessageCount);

    if (!_seeded) {
      // First poll just seeds state — nothing was "new" before we started watching.
      _seeded = true;
      _seenPendingIds.addAll(pendingIds);
      _lastUnreadTotal = unreadTotal;
      return;
    }

    final hasFresh = pendingIds.any((id) => !_seenPendingIds.contains(id));
    _seenPendingIds
      ..clear()
      ..addAll(pendingIds);
    if (hasFresh) {
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
    final appointmentsAsync = ref.watch(doctorAppointmentsListProvider);
    ref.listen(doctorAppointmentsListProvider, (previous, next) => next.whenData(_onAppointments));

    return Scaffold(
      appBar: GradientAppBar(
        title: 'doconclick',
        actions: [
          IconButton(
            icon: const Icon(Icons.people_alt_outlined),
            tooltip: 'Patients',
            onPressed: () => context.push('/doctor/patients'),
          ),
          IconButton(
            icon: const Icon(Icons.payments_outlined),
            tooltip: 'Earnings',
            onPressed: () => context.push('/doctor/earnings'),
          ),
          IconButton(
            icon: const Icon(Icons.person_outline),
            tooltip: 'Profile',
            onPressed: () => context.push('/doctor/profile'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: appointmentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load appointments.\n$e', textAlign: TextAlign.center)),
        data: (appointments) {
          final query = _search.trim().toLowerCase();
          bool matches(Appointment a) => query.isEmpty || _patientLabel(a).toLowerCase().contains(query);

          final pending = appointments.where((a) => a.status == kStatusPendingApproval && matches(a)).toList();
          final upcoming = appointments.where((a) => a.status == kStatusScheduled && matches(a)).toList();
          final completed = appointments.where((a) => a.status == kStatusCompleted && a.paymentStatus == 'PAID' && matches(a)).toList();
          final cancelled = appointments.where((a) => a.status == kStatusCancelled && matches(a)).toList();
          final nothingAtAll = pending.isEmpty && upcoming.isEmpty && completed.isEmpty && cancelled.isEmpty;

          return ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              _StatsStrip(appointments: appointments),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Search by patient name',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _search.isEmpty ? null : IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _search = '')),
                    filled: true,
                  ),
                  onChanged: (v) => setState(() => _search = v),
                ),
              ),
              _SectionHeader('Pending requests', badge: pending.isEmpty ? null : '${pending.length} new'),
              if (pending.isEmpty)
                _EmptySection(query.isEmpty ? 'No pending requests.' : 'No pending requests match your search.')
              else
                for (final a in pending) _RequestCard(appointment: a),
              _SectionHeader('Upcoming appointments'),
              if (upcoming.isEmpty)
                _EmptySection(query.isEmpty ? 'No upcoming appointments.' : 'No upcoming appointments match your search.')
              else ...[
                for (final a in (_upcomingExpanded ? upcoming : upcoming.take(_pageSize))) _UpcomingCard(appointment: a),
                if (!_upcomingExpanded && upcoming.length > _pageSize)
                  _LoadMoreButton(count: upcoming.length - _pageSize, onTap: () => setState(() => _upcomingExpanded = true)),
              ],
              if (completed.isNotEmpty) ...[
                _SectionHeader('Recent completed visits'),
                for (final a in (_completedExpanded ? completed : completed.take(_pageSize))) _CompletedTile(appointment: a),
                if (!_completedExpanded && completed.length > _pageSize)
                  _LoadMoreButton(count: completed.length - _pageSize, onTap: () => setState(() => _completedExpanded = true)),
              ],
              if (cancelled.isNotEmpty) ...[
                _SectionHeader('Cancelled appointments'),
                for (final a in (_cancelledExpanded ? cancelled : cancelled.take(_pageSize))) _CancelledTile(appointment: a),
                if (!_cancelledExpanded && cancelled.length > _pageSize)
                  _LoadMoreButton(count: cancelled.length - _pageSize, onTap: () => setState(() => _cancelledExpanded = true)),
              ],
              if (nothingAtAll)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 40),
                  child: Center(child: Text(query.isEmpty ? 'No requests right now.' : 'Nothing matches your search.')),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Stat strip so the dashboard is actually a dashboard, not just a request
/// list — today's + all-time earnings (mirrors the web's totalEarnings
/// calc: completed & paid, minus platformFee), total consultations, and
/// average rating.
class _StatsStrip extends ConsumerWidget {
  const _StatsStrip({required this.appointments});
  final List<Appointment> appointments;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final avgRating = ref.watch(doctorAccountProvider).value?.doctorProfile?.avgRating ?? 0;

    final completed = appointments.where((a) => a.status == kStatusCompleted).toList();
    final paidCompleted = completed.where((a) => a.paymentStatus == 'PAID');
    double earningsOf(Iterable<Appointment> list) => list.fold(0, (sum, a) => sum + (a.amount - a.platformFee));

    final now = DateTime.now();
    final todayEarnings = earningsOf(paidCompleted.where((a) {
      final d = a.scheduledAt.toLocal();
      return d.year == now.year && d.month == now.month && d.day == now.day;
    }));
    final totalEarnings = earningsOf(paidCompleted);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(child: _StatCard(label: "Today's earnings", value: '₹${todayEarnings.toStringAsFixed(0)}', color: Colors.teal)),
              const SizedBox(width: 10),
              Expanded(child: _StatCard(label: 'Total earnings', value: '₹${totalEarnings.toStringAsFixed(0)}', color: Colors.indigo)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _StatCard(label: 'Consultations', value: '${completed.length}', color: Colors.blue)),
              const SizedBox(width: 10),
              Expanded(child: _StatCard(label: 'Avg. rating', value: '${avgRating.toStringAsFixed(1)} / 5', color: Colors.amber.shade800)),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.grey[600])),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title, {this.badge});
  final String title;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          if (badge != null) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: Colors.orange.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
              child: Text(badge!, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.orange[800])),
            ),
          ],
        ],
      ),
    );
  }
}

class _EmptySection extends StatelessWidget {
  const _EmptySection(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Center(child: Text(text, style: TextStyle(color: Colors.grey[500]))),
    );
  }
}

class _LoadMoreButton extends StatelessWidget {
  const _LoadMoreButton({required this.count, required this.onTap});
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: TextButton(onPressed: onTap, child: Text('Load $count more')),
    );
  }
}

/// Small "{relation} of {accountHolder}" chip shown whenever an appointment
/// was booked for a dependent rather than the account holder themself.
class _DependentBadge extends StatelessWidget {
  const _DependentBadge({required this.appointment});
  final Appointment appointment;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: Colors.grey.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
      child: Text('${appointment.relation} of ${appointment.patient?.name ?? 'account holder'}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600)),
    );
  }
}

class _AllergyChip extends StatelessWidget {
  const _AllergyChip({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: Colors.amber.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.amber.withValues(alpha: 0.4))),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.warning_amber_rounded, size: 12, color: Colors.amber),
          const SizedBox(width: 4),
          Flexible(child: Text('Allergies: $text', style: TextStyle(fontSize: 11, color: Colors.amber[900]))),
        ],
      ),
    );
  }
}

/// A compact circular icon button for a card's quick actions (history, chat,
/// call, cancel) — replaces bulky labeled `OutlinedButton`s so several
/// actions can sit together without crowding the card.
class _ActionIconButton extends StatelessWidget {
  const _ActionIconButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.color,
    this.badgeCount = 0,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;
  final Color? color;
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    final tint = color ?? Theme.of(context).colorScheme.primary;
    final button = Material(
      color: tint.withValues(alpha: 0.08),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Icon(icon, size: 18, color: tint),
        ),
      ),
    );
    return Tooltip(
      message: tooltip,
      child: badgeCount > 0 ? Badge(label: Text('$badgeCount'), child: button) : button,
    );
  }
}

class _RequestCard extends ConsumerWidget {
  const _RequestCard({required this.appointment});
  final Appointment appointment;

  Future<void> _respond(WidgetRef ref, BuildContext context, String status) async {
    try {
      await ref.read(doctorAppointmentsRepositoryProvider).updateStatus(appointment.id, status);
      ref.invalidate(doctorAppointmentsListProvider);
    } on DoctorApiError catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = appointment.patient?.patientProfile;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      color: appointment.isEmergency ? Colors.red.withValues(alpha: 0.06) : null,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (appointment.isEmergency)
                  const Padding(
                    padding: EdgeInsets.only(right: 6),
                    child: Icon(Icons.emergency_rounded, color: Colors.red, size: 18),
                  ),
                Expanded(
                  child: Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 6,
                    children: [
                      Text(_patientLabel(appointment), style: const TextStyle(fontWeight: FontWeight.w700)),
                      if (appointment.relation != 'Self') _DependentBadge(appointment: appointment),
                    ],
                  ),
                ),
                Text(appointment.consultType),
              ],
            ),
            const SizedBox(height: 4),
            Text(appointment.symptoms, maxLines: 2, overflow: TextOverflow.ellipsis),
            if (appointment.allergies != null && appointment.allergies!.isNotEmpty) _AllergyChip(text: appointment.allergies!),
            const SizedBox(height: 4),
            Text(DateFormat('MMM d, h:mm a').format(appointment.scheduledAt.toLocal()),
                style: TextStyle(color: Colors.grey[600], fontSize: 12)),
            if (appointment.consultType == kConsultTypeHome && loc?.lat != null && loc?.lng != null) ...[
              const SizedBox(height: 4),
              InkWell(
                onTap: () => launchUrl(_navigateUri(loc!.lat!, loc.lng!), mode: LaunchMode.externalApplication),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.near_me_outlined, size: 13, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(width: 4),
                    Flexible(child: Text(loc?.homeAddress ?? 'View patient location', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w600))),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _respond(ref, context, kStatusRejected),
                    child: const Text('Decline'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: () => _respond(ref, context, kStatusScheduled),
                    child: const Text('Accept'),
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

class _UpcomingCard extends ConsumerWidget {
  const _UpcomingCard({required this.appointment});
  final Appointment appointment;

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this appointment?'),
        content: Text('${_patientLabel(appointment)}\'s appointment will be cancelled. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep appointment')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Cancel appointment')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(doctorAppointmentsRepositoryProvider).updateStatus(appointment.id, kStatusCancelled);
      ref.invalidate(doctorAppointmentsListProvider);
    } on DoctorApiError catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final loc = appointment.patient?.patientProfile;
    final icon = _typeIcons[appointment.consultType] ?? Icons.medical_services_outlined;
    final paymentWarn = appointment.paymentMethod == 'ONLINE' && appointment.paymentStatus != 'PAID';
    final paymentText = appointment.paymentMethod == 'ONLINE'
        ? (appointment.paymentStatus == 'PAID' ? 'Paid online' : 'Payment pending')
        : 'Cash on visit';

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => context.push('/doctor/appointments/${appointment.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: (appointment.isEmergency ? Colors.red : scheme.primary).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, size: 18, color: appointment.isEmergency ? Colors.red : scheme.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 6,
                          children: [
                            InkWell(onTap: () => context.push(_historyPath(appointment)), child: Text(_patientLabel(appointment), style: const TextStyle(fontWeight: FontWeight.w700))),
                            if (appointment.relation != 'Self') _DependentBadge(appointment: appointment),
                            if (appointment.isEmergency)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(color: Colors.red.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                                child: const Text('Emergency', style: TextStyle(fontSize: 10, color: Colors.red, fontWeight: FontWeight.w700)),
                              ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text('${DateFormat('MMM d, h:mm a').format(appointment.scheduledAt.toLocal())} · ${appointment.consultType}',
                            style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                        const SizedBox(height: 2),
                        Text(appointment.symptoms, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
                        if (appointment.allergies != null && appointment.allergies!.isNotEmpty) _AllergyChip(text: appointment.allergies!),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            Icon(Icons.currency_rupee, size: 12, color: paymentWarn ? Colors.orange[800] : Colors.grey[500]),
                            Text('${appointment.amount.toStringAsFixed(0)} · $paymentText',
                                style: TextStyle(fontSize: 11, color: paymentWarn ? Colors.orange[800] : Colors.grey[500], fontWeight: paymentWarn ? FontWeight.w700 : null)),
                          ],
                        ),
                        if (appointment.consultType == kConsultTypeHome) ...[
                          if (loc?.lat != null && loc?.lng != null)
                            InkWell(
                              onTap: () => launchUrl(_navigateUri(loc!.lat!, loc.lng!), mode: LaunchMode.externalApplication),
                              child: Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.near_me_outlined, size: 13, color: scheme.primary),
                                    const SizedBox(width: 4),
                                    Text('Navigate to patient', style: TextStyle(fontSize: 12, color: scheme.primary, fontWeight: FontWeight.w600)),
                                  ],
                                ),
                              ),
                            ),
                          if (appointment.travelStatus == kTravelOnTheWay)
                            Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle)),
                                  const SizedBox(width: 5),
                                  Text('Sharing live location with patient', style: TextStyle(fontSize: 11, color: Colors.green[700], fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ),
                          if (appointment.travelStatus == kTravelArrived)
                            Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.check_circle_outline, size: 13, color: Colors.grey[600]),
                                  const SizedBox(width: 4),
                                  Text('Marked arrived', style: TextStyle(fontSize: 11, color: Colors.grey[600], fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  _ActionIconButton(
                    icon: Icons.history,
                    tooltip: 'History',
                    onPressed: () => context.push(_historyPath(appointment)),
                  ),
                  const SizedBox(width: 6),
                  _ActionIconButton(
                    icon: Icons.chat_bubble_outline,
                    tooltip: 'Chat',
                    badgeCount: appointment.unreadMessageCount,
                    onPressed: () => context.push('/doctor/appointments/${appointment.id}/chat'),
                  ),
                  if (appointment.patient?.mobile case final mobile? when mobile.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    _ActionIconButton(
                      icon: Icons.call_outlined,
                      tooltip: 'Call',
                      onPressed: () => launchUrl(Uri(scheme: 'tel', path: mobile)),
                    ),
                  ],
                  const SizedBox(width: 6),
                  _ActionIconButton(
                    icon: Icons.close,
                    tooltip: 'Cancel',
                    color: Colors.red,
                    onPressed: () => _confirmCancel(context, ref),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompletedTile extends StatelessWidget {
  const _CompletedTile({required this.appointment});
  final Appointment appointment;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
        onTap: () => context.push(_historyPath(appointment)),
        title: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 6,
          children: [
            Text(_patientLabel(appointment), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            if (appointment.relation != 'Self') _DependentBadge(appointment: appointment),
          ],
        ),
        subtitle: Text('${DateFormat('MMM d, y').format(appointment.scheduledAt.toLocal())} · ${appointment.consultType}', style: const TextStyle(fontSize: 12)),
        trailing: Text('₹${(appointment.amount - appointment.platformFee).toStringAsFixed(0)}',
            style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _CancelledTile extends StatelessWidget {
  const _CancelledTile({required this.appointment});
  final Appointment appointment;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
        onTap: () => context.push(_historyPath(appointment)),
        title: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 6,
          children: [
            Text(_patientLabel(appointment), style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: Colors.grey[600])),
            if (appointment.relation != 'Self') _DependentBadge(appointment: appointment),
          ],
        ),
        subtitle: Text('${DateFormat('MMM d, y').format(appointment.scheduledAt.toLocal())} · ${appointment.consultType}', style: const TextStyle(fontSize: 12)),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(color: Colors.red.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
          child: Text('Cancelled', style: TextStyle(fontSize: 11, color: Colors.red[700], fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
