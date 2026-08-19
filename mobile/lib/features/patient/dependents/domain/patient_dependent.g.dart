// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patient_dependent.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PatientDependent _$PatientDependentFromJson(Map<String, dynamic> json) =>
    _PatientDependent(
      id: json['id'] as String,
      patientProfileId: json['patientProfileId'] as String,
      name: json['name'] as String,
      relation: json['relation'] as String,
      age: (json['age'] as num?)?.toInt(),
      gender: json['gender'] as String?,
      bloodGroup: json['bloodGroup'] as String?,
      height: (json['height'] as num?)?.toInt(),
      weight: (json['weight'] as num?)?.toInt(),
      allergies: json['allergies'] as String?,
      chronicDiseases: json['chronicDiseases'] as String?,
      medications: json['medications'] as String?,
      surgeries: json['surgeries'] as String?,
      emergencyContactName: json['emergencyContactName'] as String?,
      emergencyContactPhone: json['emergencyContactPhone'] as String?,
    );

Map<String, dynamic> _$PatientDependentToJson(_PatientDependent instance) =>
    <String, dynamic>{
      'id': instance.id,
      'patientProfileId': instance.patientProfileId,
      'name': instance.name,
      'relation': instance.relation,
      'age': instance.age,
      'gender': instance.gender,
      'bloodGroup': instance.bloodGroup,
      'height': instance.height,
      'weight': instance.weight,
      'allergies': instance.allergies,
      'chronicDiseases': instance.chronicDiseases,
      'medications': instance.medications,
      'surgeries': instance.surgeries,
      'emergencyContactName': instance.emergencyContactName,
      'emergencyContactPhone': instance.emergencyContactPhone,
    };
