import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../shared/models/appointment.dart';
import '../../../../shared/models/patient_record.dart';
import '../../../../shared/widgets/consultation_timer.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../data/doctor_patients_repository.dart';

part 'patient_record_screen.g.dart';

const _kTypeIcons = {
  kConsultTypeHome: Icons.home_outlined,
  kConsultTypeClinic: Icons.apartment_outlined,
  kConsultTypeVideo: Icons.videocam_outlined,
};

Color _statusColor(String status) {
  switch (status) {
    case kStatusCompleted:
      return Colors.green;
    case kStatusScheduled:
      return Colors.blue;
    case kStatusRejected:
    case kStatusCancelled:
    case kStatusExpired:
      return Colors.red;
    default:
      return Colors.orange;
  }
}

@riverpod
Future<PatientRecord> patientRecordDetail(
  Ref ref,
  String patientId, {
  String? dependentId,
}) {
  return ref
      .watch(doctorPatientsRepositoryProvider)
      .getRecord(patientId, dependentId: dependentId);
}

class PatientRecordScreen extends ConsumerWidget {
  const PatientRecordScreen({
    super.key,
    required this.patientId,
    this.dependentId,
  });
  final String patientId;
  final String? dependentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recordAsync = ref.watch(
      patientRecordDetailProvider(patientId, dependentId: dependentId),
    );

    return Scaffold(
      appBar: const GradientAppBar(title: 'Patient record'),
      body: recordAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (record) {
          final person = record.dependent ?? record.patient;
          final bmi =
              (person.height != null &&
                  person.weight != null &&
                  person.height! > 0)
              ? person.weight! /
                    ((person.height! / 100) * (person.height! / 100))
              : null;

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                person.name,
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              if (record.patient.mobile != null)
                Text(
                  record.patient.mobile!,
                  style: TextStyle(color: Colors.grey[600]),
                ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                runSpacing: 8,
                children: [
                  if (person.age != null) _stat('Age', '${person.age}'),
                  if (person.gender != null) _stat('Gender', person.gender!),
                  if (person.bloodGroup != null)
                    _stat('Blood group', person.bloodGroup!),
                  if (bmi != null) _stat('BMI', bmi.toStringAsFixed(1)),
                ],
              ),
              const SizedBox(height: 16),
              if (person.allergies != null)
                _infoBlock('Allergies', person.allergies!),
              if (person.chronicDiseases != null)
                _infoBlock('Chronic diseases', person.chronicDiseases!),
              if (person.medications != null)
                _infoBlock('Current medications', person.medications!),
              if (person.surgeries != null)
                _infoBlock('Past surgeries', person.surgeries!),
              const Divider(height: 32),
              Text(
                'Appointment history',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              for (final a in record.appointments)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
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
                                color: Theme.of(context).colorScheme.primary
                                    .withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(
                                _kTypeIcons[a.consultType] ??
                                    Icons.medical_services_outlined,
                                size: 18,
                                color: Theme.of(context).colorScheme.primary,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    DateFormat('MMM d, y')
                                        .format(a.scheduledAt.toLocal()),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Text(
                                    '${a.consultType} · ₹${a.amount.toStringAsFixed(0)}',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey[500],
                                    ),
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
                                color: _statusColor(a.status),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                a.status.replaceAll('_', ' '),
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          a.symptoms,
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.grey[700],
                          ),
                        ),
                        if (a.doctorNotes != null &&
                            a.doctorNotes!.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.grey.withValues(alpha: 0.06),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'Notes: ${a.doctorNotes}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey[700],
                              ),
                            ),
                          ),
                        ],
                        if (a.medicines.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          for (final m in a.medicines)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.purple.withValues(alpha: 0.06),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      Icons.medication_outlined,
                                      size: 14,
                                      color: Colors.purple[400],
                                    ),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text.rich(
                                        TextSpan(
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: Colors.black87,
                                          ),
                                          children: [
                                            TextSpan(
                                              text: '${m.name}  ',
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                            TextSpan(
                                              text:
                                                  [
                                                        m.dosage,
                                                        m.frequency,
                                                        m.duration,
                                                      ]
                                                      .where(
                                                        (s) => s.isNotEmpty,
                                                      )
                                                      .join(' · '),
                                              style: TextStyle(
                                                color: Colors.grey[600],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                        if (a.attachments.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              for (final att in a.attachments)
                                InkWell(
                                  borderRadius: BorderRadius.circular(8),
                                  onTap: () => launchUrl(
                                    Uri.parse(att.url),
                                    mode: LaunchMode.externalApplication,
                                  ),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 5,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.teal.withValues(
                                        alpha: 0.08,
                                      ),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(
                                          Icons.attach_file,
                                          size: 12,
                                          color: Colors.teal,
                                        ),
                                        const SizedBox(width: 4),
                                        Text(
                                          att.fileName ?? 'Attachment',
                                          style: const TextStyle(
                                            fontSize: 11,
                                            color: Colors.teal,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ],
                        if ((a.otpVerifiedAt != null &&
                                a.completedAt != null) ||
                            a.review != null) ...[
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              if (a.otpVerifiedAt != null &&
                                  a.completedAt != null)
                                ConsultationTimer(
                                  startedAt: a.otpVerifiedAt!,
                                  endedAt: a.completedAt,
                                )
                              else
                                const SizedBox.shrink(),
                              if (a.review != null)
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                      Icons.star,
                                      size: 14,
                                      color: Colors.amber,
                                    ),
                                    const SizedBox(width: 2),
                                    Text(
                                      '${a.review!.rating}/5',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey[700],
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _stat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }

  Widget _infoBlock(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
          Text(value),
        ],
      ),
    );
  }
}
