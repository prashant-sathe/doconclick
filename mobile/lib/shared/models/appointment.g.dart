// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'appointment.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_DoctorRefProfile _$DoctorRefProfileFromJson(Map<String, dynamic> json) =>
    _DoctorRefProfile(
      specialty: json['specialty'] as String?,
      photoUrl: json['photoUrl'] as String?,
    );

Map<String, dynamic> _$DoctorRefProfileToJson(_DoctorRefProfile instance) =>
    <String, dynamic>{
      'specialty': instance.specialty,
      'photoUrl': instance.photoUrl,
    };

_DoctorRef _$DoctorRefFromJson(Map<String, dynamic> json) => _DoctorRef(
  name: json['name'] as String,
  doctorProfile: json['doctorProfile'] == null
      ? null
      : DoctorRefProfile.fromJson(
          json['doctorProfile'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$DoctorRefToJson(_DoctorRef instance) =>
    <String, dynamic>{
      'name': instance.name,
      'doctorProfile': instance.doctorProfile,
    };

_PatientRefProfile _$PatientRefProfileFromJson(Map<String, dynamic> json) =>
    _PatientRefProfile(
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      homeAddress: json['homeAddress'] as String?,
    );

Map<String, dynamic> _$PatientRefProfileToJson(_PatientRefProfile instance) =>
    <String, dynamic>{
      'lat': instance.lat,
      'lng': instance.lng,
      'homeAddress': instance.homeAddress,
    };

_PatientRef _$PatientRefFromJson(Map<String, dynamic> json) => _PatientRef(
  name: json['name'] as String,
  mobile: json['mobile'] as String?,
  patientProfile: json['patientProfile'] == null
      ? null
      : PatientRefProfile.fromJson(
          json['patientProfile'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$PatientRefToJson(_PatientRef instance) =>
    <String, dynamic>{
      'name': instance.name,
      'mobile': instance.mobile,
      'patientProfile': instance.patientProfile,
    };

_Appointment _$AppointmentFromJson(Map<String, dynamic> json) => _Appointment(
  id: json['id'] as String,
  patientId: json['patientId'] as String,
  doctorId: json['doctorId'] as String,
  symptoms: json['symptoms'] as String,
  patientName: json['patientName'] as String?,
  relation: json['relation'] as String? ?? 'Self',
  allergies: json['allergies'] as String?,
  dependentId: json['dependentId'] as String?,
  consentGiven: json['consentGiven'] as bool? ?? false,
  consultType: json['consultType'] as String? ?? 'CLINIC',
  status: json['status'] as String? ?? 'PENDING_APPROVAL',
  paymentMethod: json['paymentMethod'] as String? ?? 'CASH',
  paymentStatus: json['paymentStatus'] as String? ?? 'PENDING',
  isEmergency: json['isEmergency'] as bool? ?? false,
  amount: (json['amount'] as num?)?.toDouble() ?? 0,
  platformFee: (json['platformFee'] as num?)?.toDouble() ?? 0,
  doctorNotes: json['doctorNotes'] as String?,
  travelStatus: json['travelStatus'] as String? ?? 'NOT_STARTED',
  otpCode: json['otpCode'] as String?,
  otpVerifiedAt: json['otpVerifiedAt'] == null
      ? null
      : DateTime.parse(json['otpVerifiedAt'] as String),
  completedAt: json['completedAt'] == null
      ? null
      : DateTime.parse(json['completedAt'] as String),
  doctorLat: (json['doctorLat'] as num?)?.toDouble(),
  doctorLng: (json['doctorLng'] as num?)?.toDouble(),
  doctorLocationUpdatedAt: json['doctorLocationUpdatedAt'] == null
      ? null
      : DateTime.parse(json['doctorLocationUpdatedAt'] as String),
  followUpOfId: json['followUpOfId'] as String?,
  scheduledAt: DateTime.parse(json['scheduledAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  patient: json['patient'] == null
      ? null
      : PatientRef.fromJson(json['patient'] as Map<String, dynamic>),
  doctor: json['doctor'] == null
      ? null
      : DoctorRef.fromJson(json['doctor'] as Map<String, dynamic>),
  review: json['review'] == null
      ? null
      : Review.fromJson(json['review'] as Map<String, dynamic>),
  medicines:
      (json['medicines'] as List<dynamic>?)
          ?.map((e) => PrescriptionMedicine.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  attachments:
      (json['attachments'] as List<dynamic>?)
          ?.map(
            (e) => PrescriptionAttachment.fromJson(e as Map<String, dynamic>),
          )
          .toList() ??
      const [],
  unreadMessageCount: (json['unreadMessageCount'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$AppointmentToJson(_Appointment instance) =>
    <String, dynamic>{
      'id': instance.id,
      'patientId': instance.patientId,
      'doctorId': instance.doctorId,
      'symptoms': instance.symptoms,
      'patientName': instance.patientName,
      'relation': instance.relation,
      'allergies': instance.allergies,
      'dependentId': instance.dependentId,
      'consentGiven': instance.consentGiven,
      'consultType': instance.consultType,
      'status': instance.status,
      'paymentMethod': instance.paymentMethod,
      'paymentStatus': instance.paymentStatus,
      'isEmergency': instance.isEmergency,
      'amount': instance.amount,
      'platformFee': instance.platformFee,
      'doctorNotes': instance.doctorNotes,
      'travelStatus': instance.travelStatus,
      'otpCode': instance.otpCode,
      'otpVerifiedAt': instance.otpVerifiedAt?.toIso8601String(),
      'completedAt': instance.completedAt?.toIso8601String(),
      'doctorLat': instance.doctorLat,
      'doctorLng': instance.doctorLng,
      'doctorLocationUpdatedAt': instance.doctorLocationUpdatedAt
          ?.toIso8601String(),
      'followUpOfId': instance.followUpOfId,
      'scheduledAt': instance.scheduledAt.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'patient': instance.patient,
      'doctor': instance.doctor,
      'review': instance.review,
      'medicines': instance.medicines,
      'attachments': instance.attachments,
      'unreadMessageCount': instance.unreadMessageCount,
    };
