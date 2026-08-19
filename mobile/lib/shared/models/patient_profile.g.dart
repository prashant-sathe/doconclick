// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patient_profile.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PatientProfileDetail _$PatientProfileDetailFromJson(
  Map<String, dynamic> json,
) => _PatientProfileDetail(
  id: json['id'] as String?,
  age: (json['age'] as num?)?.toInt(),
  gender: json['gender'] as String?,
  location: json['location'] as String?,
  homeAddress: json['homeAddress'] as String?,
  landmark: json['landmark'] as String?,
  pinCode: json['pinCode'] as String?,
  bloodGroup: json['bloodGroup'] as String?,
  height: (json['height'] as num?)?.toInt(),
  weight: (json['weight'] as num?)?.toInt(),
  allergies: json['allergies'] as String?,
  chronicDiseases: json['chronicDiseases'] as String?,
  medications: json['medications'] as String?,
  surgeries: json['surgeries'] as String?,
  emergencyContactName: json['emergencyContactName'] as String?,
  emergencyContactPhone: json['emergencyContactPhone'] as String?,
  photoUrl: json['photoUrl'] as String?,
  lat: (json['lat'] as num?)?.toDouble(),
  lng: (json['lng'] as num?)?.toDouble(),
);

Map<String, dynamic> _$PatientProfileDetailToJson(
  _PatientProfileDetail instance,
) => <String, dynamic>{
  'id': instance.id,
  'age': instance.age,
  'gender': instance.gender,
  'location': instance.location,
  'homeAddress': instance.homeAddress,
  'landmark': instance.landmark,
  'pinCode': instance.pinCode,
  'bloodGroup': instance.bloodGroup,
  'height': instance.height,
  'weight': instance.weight,
  'allergies': instance.allergies,
  'chronicDiseases': instance.chronicDiseases,
  'medications': instance.medications,
  'surgeries': instance.surgeries,
  'emergencyContactName': instance.emergencyContactName,
  'emergencyContactPhone': instance.emergencyContactPhone,
  'photoUrl': instance.photoUrl,
  'lat': instance.lat,
  'lng': instance.lng,
};

_PatientAccount _$PatientAccountFromJson(Map<String, dynamic> json) =>
    _PatientAccount(
      id: json['id'] as String,
      name: json['name'] as String,
      mobile: json['mobile'] as String,
      email: json['email'] as String?,
      patientProfile: json['patientProfile'] == null
          ? null
          : PatientProfileDetail.fromJson(
              json['patientProfile'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$PatientAccountToJson(_PatientAccount instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'mobile': instance.mobile,
      'email': instance.email,
      'patientProfile': instance.patientProfile,
    };
