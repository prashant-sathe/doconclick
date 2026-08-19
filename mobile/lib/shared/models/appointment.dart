import 'package:freezed_annotation/freezed_annotation.dart';

import 'prescription.dart';
import 'review.dart';

part 'appointment.freezed.dart';
part 'appointment.g.dart';

@freezed
abstract class DoctorRefProfile with _$DoctorRefProfile {
  const factory DoctorRefProfile({String? specialty, String? photoUrl}) = _DoctorRefProfile;
  factory DoctorRefProfile.fromJson(Map<String, dynamic> json) => _$DoctorRefProfileFromJson(json);
}

@freezed
abstract class DoctorRef with _$DoctorRef {
  const factory DoctorRef({required String name, DoctorRefProfile? doctorProfile}) = _DoctorRef;
  factory DoctorRef.fromJson(Map<String, dynamic> json) => _$DoctorRefFromJson(json);
}

@freezed
abstract class PatientRefProfile with _$PatientRefProfile {
  const factory PatientRefProfile({double? lat, double? lng, String? homeAddress}) = _PatientRefProfile;
  factory PatientRefProfile.fromJson(Map<String, dynamic> json) => _$PatientRefProfileFromJson(json);
}

@freezed
abstract class PatientRef with _$PatientRef {
  const factory PatientRef({required String name, String? mobile, PatientRefProfile? patientProfile}) = _PatientRef;
  factory PatientRef.fromJson(Map<String, dynamic> json) => _$PatientRefFromJson(json);
}

/// Mirrors Prisma's `Appointment` model, plus the nested fields the backend
/// conditionally includes depending on the endpoint (POST /api/appointments,
/// GET /api/appointments/me, GET /api/appointments/[id]).
@freezed
abstract class Appointment with _$Appointment {
  const factory Appointment({
    required String id,
    required String patientId,
    required String doctorId,
    required String symptoms,
    String? patientName,
    @Default('Self') String relation,
    String? allergies,
    String? dependentId,
    @Default(false) bool consentGiven,
    @Default('CLINIC') String consultType,
    @Default('PENDING_APPROVAL') String status,
    @Default('CASH') String paymentMethod,
    @Default('PENDING') String paymentStatus,
    @Default(false) bool isEmergency,
    @Default(0) double amount,
    @Default(0) double platformFee,
    String? doctorNotes,
    @Default('NOT_STARTED') String travelStatus,
    String? otpCode,
    DateTime? otpVerifiedAt,
    DateTime? completedAt,
    double? doctorLat,
    double? doctorLng,
    DateTime? doctorLocationUpdatedAt,
    String? followUpOfId,
    required DateTime scheduledAt,
    required DateTime createdAt,
    PatientRef? patient,
    DoctorRef? doctor,
    Review? review,
    @Default([]) List<PrescriptionMedicine> medicines,
    @Default([]) List<PrescriptionAttachment> attachments,
    @Default(0) int unreadMessageCount,
  }) = _Appointment;

  factory Appointment.fromJson(Map<String, dynamic> json) => _$AppointmentFromJson(json);
}

const kConsultTypeClinic = 'CLINIC';
const kConsultTypeHome = 'HOME';
const kConsultTypeVideo = 'VIDEO'; // UI-disabled — no backing video infra yet, matches the web app

const kStatusPendingApproval = 'PENDING_APPROVAL';
const kStatusScheduled = 'SCHEDULED';
const kStatusRejected = 'REJECTED';
const kStatusExpired = 'EXPIRED';
const kStatusCompleted = 'COMPLETED';
const kStatusCancelled = 'CANCELLED';

const kTravelNotStarted = 'NOT_STARTED';
const kTravelOnTheWay = 'ON_THE_WAY';
const kTravelArrived = 'ARRIVED';
