import 'package:freezed_annotation/freezed_annotation.dart';

import 'appointment.dart';

part 'patient_record.freezed.dart';
part 'patient_record.g.dart';

@freezed
abstract class PatientRecordPerson with _$PatientRecordPerson {
  const factory PatientRecordPerson({
    String? id,
    required String name,
    String? mobile,
    String? relation,
    int? age,
    String? gender,
    String? bloodGroup,
    int? height,
    int? weight,
    String? allergies,
    String? chronicDiseases,
    String? medications,
    String? surgeries,
    String? emergencyContactName,
    String? emergencyContactPhone,
  }) = _PatientRecordPerson;

  factory PatientRecordPerson.fromJson(Map<String, dynamic> json) => _$PatientRecordPersonFromJson(json);
}

/// Mirrors GET /api/doctors/patients/[patientId]'s combined shape.
@freezed
abstract class PatientRecord with _$PatientRecord {
  const factory PatientRecord({
    required PatientRecordPerson patient,
    PatientRecordPerson? dependent,
    required List<Appointment> appointments,
  }) = _PatientRecord;

  factory PatientRecord.fromJson(Map<String, dynamic> json) => _$PatientRecordFromJson(json);
}
