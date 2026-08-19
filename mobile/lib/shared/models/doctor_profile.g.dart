// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'doctor_profile.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_DoctorProfile _$DoctorProfileFromJson(Map<String, dynamic> json) =>
    _DoctorProfile(
      photoUrl: json['photoUrl'] as String?,
      clinicName: json['clinicName'] as String?,
      clinicPhotoUrl: json['clinicPhotoUrl'] as String?,
      qualification: json['qualification'] as String?,
      medRegNo: json['medRegNo'] as String?,
      specialty: json['specialty'] as String? ?? 'General Physician',
      experience: (json['experience'] as num?)?.toInt() ?? 0,
      consultFee: (json['consultFee'] as num?)?.toDouble() ?? 0,
      videoFee: (json['videoFee'] as num?)?.toDouble() ?? 0,
      homeVisitFee: (json['homeVisitFee'] as num?)?.toDouble() ?? 0,
      availability: json['availability'] as String? ?? 'Mon-Fri, 9AM-5PM',
      radius: (json['radius'] as num?)?.toInt(),
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      languages: json['languages'] as String? ?? 'English, Hindi',
      bio: json['bio'] as String?,
      offersHomeVisit: json['offersHomeVisit'] as bool? ?? true,
      isVerified: json['isVerified'] as bool? ?? false,
      avgRating: (json['avgRating'] as num?)?.toDouble() ?? 0,
      totalReviews: (json['totalReviews'] as num?)?.toInt() ?? 0,
    );

Map<String, dynamic> _$DoctorProfileToJson(_DoctorProfile instance) =>
    <String, dynamic>{
      'photoUrl': instance.photoUrl,
      'clinicName': instance.clinicName,
      'clinicPhotoUrl': instance.clinicPhotoUrl,
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
    };

_Doctor _$DoctorFromJson(Map<String, dynamic> json) => _Doctor(
  id: json['id'] as String,
  name: json['name'] as String,
  doctorProfile: DoctorProfile.fromJson(
    json['doctorProfile'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$DoctorToJson(_Doctor instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'doctorProfile': instance.doctorProfile,
};
