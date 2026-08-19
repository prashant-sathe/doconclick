import 'package:freezed_annotation/freezed_annotation.dart';

part 'doctor_account.freezed.dart';
part 'doctor_account.g.dart';

/// Mirrors GET /api/doctors/me's `User` + full nested `doctorProfile`
/// (includes fields the public /api/doctors/[id] omits, e.g. status,
/// registrationFeePaid, trialEndsAt, subscriptionPaidUntil, document URLs).
@freezed
abstract class DoctorAccount with _$DoctorAccount {
  const factory DoctorAccount({
    required String id,
    required String name,
    required String mobile,
    String? email,
    DoctorFullProfile? doctorProfile,
  }) = _DoctorAccount;

  factory DoctorAccount.fromJson(Map<String, dynamic> json) => _$DoctorAccountFromJson(json);
}

@freezed
abstract class DoctorFullProfile with _$DoctorFullProfile {
  const factory DoctorFullProfile({
    String? photoUrl,
    String? qualification,
    String? medRegNo,
    @Default('General Physician') String specialty,
    @Default(0) int experience,
    @Default(0) double consultFee,
    @Default(0) double videoFee,
    @Default(0) double homeVisitFee,
    @Default('Mon-Fri, 9AM-5PM') String availability,
    @Default(10) int radius,
    double? lat,
    double? lng,
    @Default('English, Hindi') String languages,
    String? bio,
    @Default(true) bool offersHomeVisit,
    @Default(false) bool isVerified,
    @Default(0) double avgRating,
    @Default(0) int totalReviews,
    String? bankDetails,
    @Default('PENDING') String status,
    @Default(false) bool registrationFeePaid,
    @Default('PENDING') String registrationFeeStatus,
    String? medRegCertUrl,
    String? degreeCertUrl,
    String? kycDocUrl,
    String? address,
    String? clinicName,
    String? clinicPhotoUrl,
    DateTime? trialEndsAt,
    DateTime? subscriptionPaidUntil,
  }) = _DoctorFullProfile;

  factory DoctorFullProfile.fromJson(Map<String, dynamic> json) => _$DoctorFullProfileFromJson(json);
}

const kDoctorStatusPending = 'PENDING';
const kDoctorStatusApproved = 'APPROVED';
const kDoctorStatusRejected = 'REJECTED';
const kDoctorStatusSuspended = 'SUSPENDED';
