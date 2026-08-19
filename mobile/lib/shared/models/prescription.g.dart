// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'prescription.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PrescriptionMedicine _$PrescriptionMedicineFromJson(
  Map<String, dynamic> json,
) => _PrescriptionMedicine(
  id: json['id'] as String?,
  appointmentId: json['appointmentId'] as String?,
  name: json['name'] as String,
  dosage: json['dosage'] as String? ?? '',
  frequency: json['frequency'] as String? ?? '',
  duration: json['duration'] as String? ?? '',
  instructions: json['instructions'] as String?,
);

Map<String, dynamic> _$PrescriptionMedicineToJson(
  _PrescriptionMedicine instance,
) => <String, dynamic>{
  'id': instance.id,
  'appointmentId': instance.appointmentId,
  'name': instance.name,
  'dosage': instance.dosage,
  'frequency': instance.frequency,
  'duration': instance.duration,
  'instructions': instance.instructions,
};

_PrescriptionAttachment _$PrescriptionAttachmentFromJson(
  Map<String, dynamic> json,
) => _PrescriptionAttachment(
  id: json['id'] as String,
  appointmentId: json['appointmentId'] as String,
  url: json['url'] as String,
  fileName: json['fileName'] as String?,
);

Map<String, dynamic> _$PrescriptionAttachmentToJson(
  _PrescriptionAttachment instance,
) => <String, dynamic>{
  'id': instance.id,
  'appointmentId': instance.appointmentId,
  'url': instance.url,
  'fileName': instance.fileName,
};

_PrescriptionDetail _$PrescriptionDetailFromJson(Map<String, dynamic> json) =>
    _PrescriptionDetail(
      id: json['id'] as String,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      patientName: json['patientName'] as String?,
      accountHolderName: json['accountHolderName'] as String,
      relation: json['relation'] as String,
      patientAge: (json['patientAge'] as num?)?.toInt(),
      patientGender: json['patientGender'] as String?,
      doctorName: json['doctorName'] as String,
      doctorQualification: json['doctorQualification'] as String?,
      doctorRegNo: json['doctorRegNo'] as String?,
      doctorSpecialty:
          json['doctorSpecialty'] as String? ?? 'General Physician',
      doctorNotes: json['doctorNotes'] as String?,
      consultationStartedAt: json['consultationStartedAt'] == null
          ? null
          : DateTime.parse(json['consultationStartedAt'] as String),
      consultationEndedAt: json['consultationEndedAt'] == null
          ? null
          : DateTime.parse(json['consultationEndedAt'] as String),
      medicines: (json['medicines'] as List<dynamic>)
          .map((e) => PrescriptionMedicine.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PrescriptionDetailToJson(
  _PrescriptionDetail instance,
) => <String, dynamic>{
  'id': instance.id,
  'scheduledAt': instance.scheduledAt.toIso8601String(),
  'patientName': instance.patientName,
  'accountHolderName': instance.accountHolderName,
  'relation': instance.relation,
  'patientAge': instance.patientAge,
  'patientGender': instance.patientGender,
  'doctorName': instance.doctorName,
  'doctorQualification': instance.doctorQualification,
  'doctorRegNo': instance.doctorRegNo,
  'doctorSpecialty': instance.doctorSpecialty,
  'doctorNotes': instance.doctorNotes,
  'consultationStartedAt': instance.consultationStartedAt?.toIso8601String(),
  'consultationEndedAt': instance.consultationEndedAt?.toIso8601String(),
  'medicines': instance.medicines,
};
