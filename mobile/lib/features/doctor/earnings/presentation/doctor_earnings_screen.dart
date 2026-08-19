import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../shared/models/appointment.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../dashboard/data/doctor_appointments_repository.dart';
import '../data/doctor_earnings_repository.dart';

class DoctorEarningsScreen extends ConsumerWidget {
  const DoctorEarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settlementsAsync = ref.watch(doctorSettlementsListProvider);
    final appointmentsAsync = ref.watch(doctorAppointmentsListProvider);

    return Scaffold(
      appBar: const GradientAppBar(title: 'Earnings'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Last 7 days', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text('Consultation earnings by day (completed & paid)', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
          const SizedBox(height: 12),
          appointmentsAsync.when(
            loading: () => const SizedBox(height: 180, child: Center(child: CircularProgressIndicator())),
            error: (e, _) => SizedBox(height: 80, child: Center(child: Text('Could not load the chart.\n$e', textAlign: TextAlign.center))),
            data: (appointments) => _EarningsChart(appointments: appointments),
          ),
          const SizedBox(height: 24),
          settlementsAsync.when(
            loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: CircularProgressIndicator())),
            error: (e, _) => Center(child: Text('$e')),
            data: (settlements) {
              final totalNet = settlements.fold<double>(0, (sum, s) => sum + s.netAmount);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        children: [
                          Text('Total net settled', style: TextStyle(color: Colors.grey[600], fontWeight: FontWeight.w600)),
                          const SizedBox(height: 6),
                          Text('₹${totalNet.toStringAsFixed(0)}',
                              style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: Theme.of(context).colorScheme.primary)),
                        ],
                      ),
                    ),
                  ).animate().fadeIn(duration: 280.ms).slideY(begin: 0.06, end: 0, curve: Curves.easeOut),
                  const SizedBox(height: 20),
                  Text('Settlements', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text('Issued periodically by your admin', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                  const SizedBox(height: 12),
                  if (settlements.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Column(
                        children: [
                          Icon(Icons.receipt_long_outlined, size: 48, color: Colors.grey[350]),
                          const SizedBox(height: 10),
                          Text('No settlements yet.', style: TextStyle(color: Colors.grey[600])),
                        ],
                      ),
                    ).animate().fadeIn(duration: 280.ms)
                  else
                    for (final (i, s) in settlements.indexed)
                      Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(DateFormat('MMM d, y').format(s.createdAt.toLocal()), style: const TextStyle(fontWeight: FontWeight.w600)),
                                  Text('₹${s.netAmount.toStringAsFixed(0)}',
                                      style: TextStyle(fontWeight: FontWeight.w700, color: s.netAmount >= 0 ? Colors.green[700] : Colors.red[700])),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text('${s.cashCount} cash · ${s.onlineCount} online', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                              if (s.note != null && s.note!.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(s.note!, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                              ],
                            ],
                          ),
                        ),
                      ).animate().fadeIn(delay: (i.clamp(0, 8) * 40).ms, duration: 280.ms).slideY(begin: 0.06, end: 0, curve: Curves.easeOut),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

/// A dependency-free bar chart — no charting package is installed, and this
/// only needs to show 7 bars, so plain widgets keep it simple and avoid
/// adding a new pub dependency for something this small.
class _EarningsChart extends StatelessWidget {
  const _EarningsChart({required this.appointments});
  final List<Appointment> appointments;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final now = DateTime.now();
    final days = List.generate(7, (i) => DateTime(now.year, now.month, now.day).subtract(Duration(days: 6 - i)));

    final paidCompleted = appointments.where((a) => a.status == kStatusCompleted && a.paymentStatus == 'PAID');
    final earningsByDay = <DateTime, double>{
      for (final d in days) d: 0,
    };
    for (final a in paidCompleted) {
      final d = a.scheduledAt.toLocal();
      final key = DateTime(d.year, d.month, d.day);
      if (earningsByDay.containsKey(key)) {
        earningsByDay[key] = earningsByDay[key]! + (a.amount - a.platformFee);
      }
    }

    final maxValue = earningsByDay.values.fold<double>(0, (m, v) => v > m ? v : m);
    const chartHeight = 140.0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
        child: Column(
          children: [
            SizedBox(
              height: chartHeight,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  for (final d in days)
                    _Bar(
                      value: earningsByDay[d]!,
                      maxValue: maxValue,
                      maxHeight: chartHeight,
                      color: scheme.primary,
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final d in days)
                  SizedBox(
                    width: 36,
                    child: Column(
                      children: [
                        Text(DateFormat('E').format(d), textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
                        Text(DateFormat('d MMM').format(d), textAlign: TextAlign.center, style: TextStyle(fontSize: 10, color: Colors.grey[400])),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.value, required this.maxValue, required this.maxHeight, required this.color});
  final double value;
  final double maxValue;
  final double maxHeight;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final barHeight = maxValue <= 0 ? 4.0 : (value / maxValue) * (maxHeight - 24);
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        if (value > 0)
          Text('₹${value.toStringAsFixed(0)}', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.grey[700])),
        const SizedBox(height: 4),
        Container(
          width: 28,
          height: barHeight.clamp(4.0, maxHeight),
          decoration: BoxDecoration(
            color: value > 0 ? color : color.withValues(alpha: 0.15),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
          ),
        ).animate().scaleY(begin: 0, end: 1, alignment: Alignment.bottomCenter, duration: 400.ms, curve: Curves.easeOut),
      ],
    );
  }
}
