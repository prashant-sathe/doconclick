// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patient_record.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PatientRecordPerson _$PatientRecordPersonFromJson(Map<String, dynamic> json) =>
    _PatientRecordPerson(
      id: json['id'] as String?,
      name: json['name'] as String,
      mobile: json['mobile'] as String?,
      relation: json['relation'] as String?,
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

Map<String, dynamic> _$PatientRecordPersonToJson(
  _PatientRecordPerson instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'mobile': instance.mobile,
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

_PatientRecord _$PatientRecordFromJson(Map<String, dynamic> json) =>
    _PatientRecord(
      patient: PatientRecordPerson.fromJson(
        json['patient'] as Map<String, dynamic>,
      ),
      dependent: json['dependent'] == null
          ? null
          : PatientRecordPerson.fromJson(
              json['dependent'] as Map<String, dynamic>,
            ),
      appointments: (json['appointments'] as List<dynamic>)
          .map((e) => Appointment.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PatientRecordToJson(_PatientRecord instance) =>
    <String, dynamic>{
      'patient': instance.patient,
      'dependent': instance.dependent,
      'appointments': instance.appointments,
    };
