import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../shared/models/appointment.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../dashboard/data/doctor_appointments_repository.dart';

/// No dedicated "list all my patients" endpoint exists on the backend — this
/// mirrors what the web's /doctor/patients page does: derive the unique
/// patient (or specific dependent) list from the doctor's own appointment
/// history, since that's the only source of "who has this doctor treated".
class DoctorPatientsListScreen extends ConsumerWidget {
  const DoctorPatientsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appointmentsAsync = ref.watch(doctorAppointmentsListProvider);

    return Scaffold(
      appBar: const GradientAppBar(title: 'My patients'),
      body: appointmentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (appointments) {
          final seen = <String, Appointment>{};
          for (final a in appointments) {
            final key = '${a.patientId}:${a.dependentId ?? ''}';
            if (!seen.containsKey(key) || a.scheduledAt.isAfter(seen[key]!.scheduledAt)) {
              seen[key] = a;
            }
          }
          final entries = seen.values.toList()..sort((a, b) => b.scheduledAt.compareTo(a.scheduledAt));

          if (entries.isEmpty) {
            return const Center(child: Text('No patients yet.'));
          }

          return ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: entries.length,
            itemBuilder: (context, i) {
              final a = entries[i];
              final displayName = a.patientName ?? a.patient?.name ?? 'Patient';
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                child: ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                  title: Text(displayName),
                  subtitle: Text(a.relation == 'Self' ? 'Account holder' : a.relation),
                  onTap: () {
                    final query = a.dependentId != null ? '?dependentId=${a.dependentId}' : '';
                    context.push('/doctor/patients/${a.patientId}$query');
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
