import 'package:freezed_annotation/freezed_annotation.dart';

part 'patient_profile.freezed.dart';
part 'patient_profile.g.dart';

/// Mirrors Prisma's `PatientProfile` model.
@freezed
abstract class PatientProfileDetail with _$PatientProfileDetail {
  const factory PatientProfileDetail({
    String? id,
    int? age,
    String? gender,
    String? location,
    String? homeAddress,
    String? landmark,
    String? pinCode,
    String? bloodGroup,
    int? height,
    int? weight,
    String? allergies,
    String? chronicDiseases,
    String? medications,
    String? surgeries,
    String? emergencyContactName,
    String? emergencyContactPhone,
    String? photoUrl,
    double? lat,
    double? lng,
  }) = _PatientProfileDetail;

  factory PatientProfileDetail.fromJson(Map<String, dynamic> json) => _$PatientProfileDetailFromJson(json);
}

/// Mirrors GET /api/patients/me's `User` + nested `patientProfile` shape.
@freezed
abstract class PatientAccount with _$PatientAccount {
  const factory PatientAccount({
    required String id,
    required String name,
    required String mobile,
    String? email,
    PatientProfileDetail? patientProfile,
  }) = _PatientAccount;

  factory PatientAccount.fromJson(Map<String, dynamic> json) => _$PatientAccountFromJson(json);
}
