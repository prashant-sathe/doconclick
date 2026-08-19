import 'package:freezed_annotation/freezed_annotation.dart';

part 'patient_dependent.freezed.dart';
part 'patient_dependent.g.dart';

/// Mirrors Prisma's `PatientDependent` model — a saved family-member
/// medical profile used when booking on someone else's behalf.
@freezed
abstract class PatientDependent with _$PatientDependent {
  const factory PatientDependent({
    required String id,
    required String patientProfileId,
    required String name,
    required String relation,
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
  }) = _PatientDependent;

  factory PatientDependent.fromJson(Map<String, dynamic> json) => _$PatientDependentFromJson(json);
}

/// Mirrors src/lib/relations.ts's RELATIONS list — "Self" is excluded from
/// the dependent-creation form since it's not a valid dependent relation.
const kDependentRelations = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Other'];
