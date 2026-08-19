import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../shared/models/prescription.dart';
import '../../../../shared/utils/doctor_display_name.dart';
import '../../../../shared/widgets/consultation_timer.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../appointments/data/patient_appointments_repository.dart';

part 'prescription_screen.g.dart';

@riverpod
Future<PrescriptionDetail> prescriptionDetail(Ref ref, String appointmentId) {
  return ref
      .watch(patientAppointmentsRepositoryProvider)
      .getPrescription(appointmentId);
}

class PrescriptionScreen extends ConsumerWidget {
  const PrescriptionScreen({super.key, required this.appointmentId});
  final String appointmentId;

  Future<void> _downloadPdf(PrescriptionDetail p) async {
    final doc = pw.Document();
    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        build: (context) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(
              'doconclick — Prescription',
              style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold),
            ),
            pw.SizedBox(height: 12),
            pw.Text(
              doctorDisplayName(p.doctorName),
              style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold),
            ),
            if (p.doctorQualification != null) pw.Text(p.doctorQualification!),
            if (p.doctorRegNo != null) pw.Text('Reg. No: ${p.doctorRegNo}'),
            pw.Text(p.doctorSpecialty),
            pw.Divider(),
            pw.Text(
              'Patient: ${p.patientName ?? p.accountHolderName} (${p.relation})',
            ),
            if (p.patientAge != null)
              pw.Text(
                'Age: ${p.patientAge}  Gender: ${p.patientGender ?? '-'}',
              ),
            pw.Text(
              'Date: ${DateFormat('MMM d, y').format(p.scheduledAt.toLocal())}',
            ),
            pw.SizedBox(height: 16),
            pw.Text(
              'Medicines',
              style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold),
            ),
            pw.SizedBox(height: 6),
            pw.TableHelper.fromTextArray(
              headers: [
                'Name',
                'Dosage',
                'Frequency',
                'Duration',
                'Instructions',
              ],
              data: p.medicines
                  .map(
                    (m) => [
                      m.name,
                      m.dosage,
                      m.frequency,
                      m.duration,
                      m.instructions ?? '',
                    ],
                  )
                  .toList(),
            ),
            if (p.doctorNotes != null && p.doctorNotes!.isNotEmpty) ...[
              pw.SizedBox(height: 16),
              pw.Text(
                'Notes',
                style: pw.TextStyle(
                  fontSize: 14,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
              pw.Text(p.doctorNotes!),
            ],
          ],
        ),
      ),
    );
    await Printing.sharePdf(
      bytes: await doc.save(),
      filename: 'prescription-${p.id}.pdf',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prescriptionAsync = ref.watch(
      prescriptionDetailProvider(appointmentId),
    );

    return Scaffold(
      appBar: GradientAppBar(
        title: 'Prescription',
        actions: [
          prescriptionAsync.maybeWhen(
            data: (p) => IconButton(
              icon: const Icon(Icons.download_outlined),
              onPressed: () => _downloadPdf(p),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: prescriptionAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', textAlign: TextAlign.center)),
        data: (p) {
          final scheme = Theme.of(context).colorScheme;
          final name = doctorDisplayName(p.doctorName);
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 26,
                            backgroundColor: scheme.primaryContainer,
                            child: Text(
                              name.isNotEmpty
                                  ? name
                                        .replaceFirst('Dr. ', '')[0]
                                        .toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                              ),
                            ),
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
                                  p.doctorSpecialty,
                                  style: TextStyle(color: Colors.grey[600]),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  DateFormat('MMM d, y')
                                      .format(p.scheduledAt.toLocal()),
                                  style: TextStyle(
                                    color: Colors.grey[500],
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                  .animate()
                  .fadeIn(duration: 280.ms)
                  .slideY(begin: 0.06, end: 0, curve: Curves.easeOut),
              if (p.consultationStartedAt != null) ...[
                const SizedBox(height: 8),
                ConsultationTimer(
                  startedAt: p.consultationStartedAt!,
                  endedAt: p.consultationEndedAt,
                ),
              ],
              const SizedBox(height: 16),
              Text(
                'Medicines',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              if (p.medicines.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Column(
                    children: [
                      Icon(
                        Icons.medication_outlined,
                        size: 44,
                        color: Colors.grey[350],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'No medicines recorded.',
                        style: TextStyle(color: Colors.grey[500]),
                      ),
                    ],
                  ),
                ).animate().fadeIn(delay: 80.ms, duration: 280.ms),
              for (final (i, m) in p.medicines.indexed)
                Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              Icons.medication_outlined,
                              size: 20,
                              color: scheme.primary,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    m.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    '${m.dosage} · ${m.frequency} · ${m.duration}',
                                  ),
                                  if (m.instructions != null &&
                                      m.instructions!.isNotEmpty)
                                    Text(m.instructions!),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                    .animate()
                    .fadeIn(
                      delay: (80 + i.clamp(0, 8) * 40).ms,
                      duration: 280.ms,
                    )
                    .slideY(begin: 0.06, end: 0, curve: Curves.easeOut),
              if (p.doctorNotes != null && p.doctorNotes!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Doctor notes',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(p.doctorNotes!),
                  ),
                ).animate().fadeIn(delay: 160.ms, duration: 280.ms),
              ],
            ],
          );
        },
      ),
    );
  }
}
