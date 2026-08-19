import 'package:freezed_annotation/freezed_annotation.dart';

part 'prescription.freezed.dart';
part 'prescription.g.dart';

@freezed
abstract class PrescriptionMedicine with _$PrescriptionMedicine {
  const factory PrescriptionMedicine({
    String? id,
    String? appointmentId,
    required String name,
    @Default('') String dosage,
    @Default('') String frequency,
    @Default('') String duration,
    String? instructions,
  }) = _PrescriptionMedicine;

  factory PrescriptionMedicine.fromJson(Map<String, dynamic> json) => _$PrescriptionMedicineFromJson(json);
}

@freezed
abstract class PrescriptionAttachment with _$PrescriptionAttachment {
  const factory PrescriptionAttachment({
    required String id,
    required String appointmentId,
    required String url,
    String? fileName,
  }) = _PrescriptionAttachment;

  factory PrescriptionAttachment.fromJson(Map<String, dynamic> json) => _$PrescriptionAttachmentFromJson(json);
}

/// Mirrors GET /api/appointments/[id]/prescription's flattened JSON shape.
@freezed
abstract class PrescriptionDetail with _$PrescriptionDetail {
  const factory PrescriptionDetail({
    required String id,
    required DateTime scheduledAt,
    String? patientName,
    required String accountHolderName,
    required String relation,
    int? patientAge,
    String? patientGender,
    required String doctorName,
    String? doctorQualification,
    String? doctorRegNo,
    @Default('General Physician') String doctorSpecialty,
    String? doctorNotes,
    DateTime? consultationStartedAt,
    DateTime? consultationEndedAt,
    required List<PrescriptionMedicine> medicines,
  }) = _PrescriptionDetail;

  factory PrescriptionDetail.fromJson(Map<String, dynamic> json) => _$PrescriptionDetailFromJson(json);
}
