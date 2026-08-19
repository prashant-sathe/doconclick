import '../models/doctor_profile.dart';
import '../models/appointment.dart';

/// Mirrors the identical `feeForConsultType` helper duplicated in the web's
/// patient/dashboard and patient/book pages: HOME -> homeVisitFee, VIDEO ->
/// videoFee, everything else (including CLINIC) -> consultFee.
double feeForConsultType(DoctorProfile profile, String consultType) {
  if (consultType == kConsultTypeHome) return profile.homeVisitFee;
  if (consultType == kConsultTypeVideo) return profile.videoFee;
  return profile.consultFee;
}
