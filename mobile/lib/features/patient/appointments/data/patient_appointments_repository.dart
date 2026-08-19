import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import '../../../../shared/models/appointment.dart';
import '../../../../shared/models/prescription.dart';
import '../../../../shared/models/review.dart';

part 'patient_appointments_repository.g.dart';

class AppointmentApiError implements Exception {
  AppointmentApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

class PatientAppointmentsRepository {
  PatientAppointmentsRepository(this._dio);
  final Dio _dio;

  Future<List<Appointment>> listMine() async {
    final res = await _dio.get('/api/appointments/me');
    return (res.data as List).map((e) => Appointment.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Appointment> get(String id) async {
    final res = await _dio.get('/api/appointments/$id');
    return Appointment.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Appointment> cancel(String id) async {
    try {
      final res = await _dio.patch('/api/appointments/$id', data: {'status': kStatusCancelled});
      return Appointment.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw AppointmentApiError(e.response?.data?['error'] as String? ?? 'Could not cancel this appointment.');
    }
  }

  Future<Review> leaveReview({required String appointmentId, required int rating, String? comment}) async {
    try {
      final res = await _dio.post('/api/reviews', data: {
        'appointmentId': appointmentId,
        'rating': rating,
        'comment': comment,
      });
      return Review.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw AppointmentApiError(e.response?.data?['error'] as String? ?? 'Could not submit your review.');
    }
  }

  Future<PrescriptionDetail> getPrescription(String appointmentId) async {
    try {
      final res = await _dio.get('/api/appointments/$appointmentId/prescription');
      return PrescriptionDetail.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw AppointmentApiError(e.response?.data?['error'] as String? ?? 'Prescription not available yet.');
    }
  }
}

@riverpod
PatientAppointmentsRepository patientAppointmentsRepository(Ref ref) {
  return PatientAppointmentsRepository(ref.watch(dioProvider));
}

/// Polls every 5s, matching the web's usePatientNotifications interval —
/// also what src/app/patient/appointments feeds off for the same live
/// status/notification behavior.
@riverpod
Stream<List<Appointment>> patientAppointmentsList(Ref ref) async* {
  final repo = ref.watch(patientAppointmentsRepositoryProvider);
  while (true) {
    yield await repo.listMine();
    await Future.delayed(const Duration(seconds: 5));
  }
}

/// Polls a single appointment every 5s — used for live HOME-visit tracking,
/// matching the web's identical 5s interval (src/app/patient/track/[id]).
@riverpod
Stream<Appointment> appointmentPolling(Ref ref, String id) async* {
  final repo = ref.watch(patientAppointmentsRepositoryProvider);
  while (true) {
    yield await repo.get(id);
    await Future.delayed(const Duration(seconds: 5));
  }
}
