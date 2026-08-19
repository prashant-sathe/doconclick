// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'doctor_account.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_DoctorAccount _$DoctorAccountFromJson(Map<String, dynamic> json) =>
    _DoctorAccount(
      id: json['id'] as String,
      name: json['name'] as String,
      mobile: json['mobile'] as String,
      email: json['email'] as String?,
      doctorProfile: json['doctorProfile'] == null
          ? null
          : DoctorFullProfile.fromJson(
              json['doctorProfile'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$DoctorAccountToJson(_DoctorAccount instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'mobile': instance.mobile,
      'email': instance.email,
      'doctorProfile': instance.doctorProfile,
    };

_DoctorFullProfile _$DoctorFullProfileFromJson(Map<String, dynamic> json) =>
    _DoctorFullProfile(
      photoUrl: json['photoUrl'] as String?,
      qualification: json['qualification'] as String?,
      medRegNo: json['medRegNo'] as String?,
      specialty: json['specialty'] as String? ?? 'General Physician',
      experience: (json['experience'] as num?)?.toInt() ?? 0,
      consultFee: (json['consultFee'] as num?)?.toDouble() ?? 0,
      videoFee: (json['videoFee'] as num?)?.toDouble() ?? 0,
      homeVisitFee: (json['homeVisitFee'] as num?)?.toDouble() ?? 0,
      availability: json['availability'] as String? ?? 'Mon-Fri, 9AM-5PM',
      radius: (json['radius'] as num?)?.toInt() ?? 10,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      languages: json['languages'] as String? ?? 'English, Hindi',
      bio: json['bio'] as String?,
      offersHomeVisit: json['offersHomeVisit'] as bool? ?? true,
      isVerified: json['isVerified'] as bool? ?? false,
      avgRating: (json['avgRating'] as num?)?.toDouble() ?? 0,
      totalReviews: (json['totalReviews'] as num?)?.toInt() ?? 0,
      bankDetails: json['bankDetails'] as String?,
      status: json['status'] as String? ?? 'PENDING',
      registrationFeePaid: json['registrationFeePaid'] as bool? ?? false,
      registrationFeeStatus:
          json['registrationFeeStatus'] as String? ?? 'PENDING',
      medRegCertUrl: json['medRegCertUrl'] as String?,
      degreeCertUrl: json['degreeCertUrl'] as String?,
      kycDocUrl: json['kycDocUrl'] as String?,
      address: json['address'] as String?,
      clinicName: json['clinicName'] as String?,
      clinicPhotoUrl: json['clinicPhotoUrl'] as String?,
      trialEndsAt: json['trialEndsAt'] == null
          ? null
          : DateTime.parse(json['trialEndsAt'] as String),
      subscriptionPaidUntil: json['subscriptionPaidUntil'] == null
          ? null
          : DateTime.parse(json['subscriptionPaidUntil'] as String),
    );

Map<String, dynamic> _$DoctorFullProfileToJson(
  _DoctorFullProfile instance,
) => <String, dynamic>{
  'photoUrl': instance.photoUrl,
  'qualification': instance.qualification,
  'medRegNo': instance.medRegNo,
  'specialty': instance.specialty,
  'experience': instance.experience,
  'consultFee': instance.consultFee,
  'videoFee': instance.videoFee,
  'homeVisitFee': instance.homeVisitFee,
  'availability': instance.availability,
  'radius': instance.radius,
  'lat': instance.lat,
  'lng': instance.lng,
  'languages': instance.languages,
  'bio': instance.bio,
  'offersHomeVisit': instance.offersHomeVisit,
  'isVerified': instance.isVerified,
  'avgRating': instance.avgRating,
  'totalReviews': instance.totalReviews,
  'bankDetails': instance.bankDetails,
  'status': instance.status,
  'registrationFeePaid': instance.registrationFeePaid,
  'registrationFeeStatus': instance.registrationFeeStatus,
  'medRegCertUrl': instance.medRegCertUrl,
  'degreeCertUrl': instance.degreeCertUrl,
  'kycDocUrl': instance.kycDocUrl,
  'address': instance.address,
  'clinicName': instance.clinicName,
  'clinicPhotoUrl': instance.clinicPhotoUrl,
  'trialEndsAt': instance.trialEndsAt?.toIso8601String(),
  'subscriptionPaidUntil': instance.subscriptionPaidUntil?.toIso8601String(),
};
