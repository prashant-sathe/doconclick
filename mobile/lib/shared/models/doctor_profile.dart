import 'package:freezed_annotation/freezed_annotation.dart';

part 'doctor_profile.freezed.dart';
part 'doctor_profile.g.dart';

/// Mirrors Prisma's `DoctorProfile` model (prisma/schema.prisma). Nullable
/// fields cover both response shapes that embed this: the full-list
/// `GET /api/doctors` (includes lat/lng/radius) and the public profile
/// `GET /api/doctors/[id]` (omits them).
@freezed
abstract class DoctorProfile with _$DoctorProfile {
  const factory DoctorProfile({
    String? photoUrl,
    String? clinicName,
    String? clinicPhotoUrl,
    String? qualification,
    String? medRegNo,
    @Default('General Physician') String specialty,
    @Default(0) int experience,
    @Default(0) double consultFee,
    @Default(0) double videoFee,
    @Default(0) double homeVisitFee,
    @Default('Mon-Fri, 9AM-5PM') String availability,
    int? radius,
    double? lat,
    double? lng,
    @Default('English, Hindi') String languages,
    String? bio,
    @Default(true) bool offersHomeVisit,
    @Default(false) bool isVerified,
    @Default(0) double avgRating,
    @Default(0) int totalReviews,
  }) = _DoctorProfile;

  factory DoctorProfile.fromJson(Map<String, dynamic> json) => _$DoctorProfileFromJson(json);
}

/// Mirrors `User` + nested `doctorProfile`, as returned by `GET /api/doctors`
/// and `GET /api/doctors/[id]`. Extra User fields the backend includes
/// (mobile/email/etc.) are intentionally not modeled here — the app never
/// needs another patient's or doctor's contact fields client-side.
@freezed
abstract class Doctor with _$Doctor {
  const factory Doctor({
    required String id,
    required String name,
    required DoctorProfile doctorProfile,
  }) = _Doctor;

  factory Doctor.fromJson(Map<String, dynamic> json) => _$DoctorFromJson(json);
}
