import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import '../../../../shared/models/appointment.dart';
import '../../../../shared/models/prescription.dart';

part 'doctor_appointments_repository.g.dart';

class DoctorApiError implements Exception {
  DoctorApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

class DoctorAppointmentsRepository {
  DoctorAppointmentsRepository(this._dio);
  final Dio _dio;

  Future<List<Appointment>> listMine() async {
    final res = await _dio.get('/api/appointments/me');
    return (res.data as List)
        .map((e) => Appointment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Accept (-> SCHEDULED) / reject (-> REJECTED) a pending request, or
  /// complete/cancel a scheduled one — same PATCH the web's dashboard uses,
  /// enforcing the same status-transition rules server-side.
  Future<Appointment> updateStatus(
    String id,
    String status, {
    String? doctorNotes,
  }) async {
    try {
      final res = await _dio.patch(
        '/api/appointments/$id',
        data: {'status': status, 'doctorNotes': doctorNotes},
      );
      return Appointment.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw DoctorApiError(
        e.response?.data?['error'] as String? ??
            'Could not update this appointment.',
      );
    }
  }

  /// Starts/updates/ends a home-visit journey — travelStatus is one of
  /// ON_THE_WAY | ARRIVED, optionally with a live lat/lng.
  Future<Appointment> updateTravelStatus(
    String id,
    String travelStatus, {
    double? lat,
    double? lng,
  }) async {
    try {
      final res = await _dio.patch(
        '/api/appointments/$id/travel',
        data: {'travelStatus': travelStatus, 'lat': ?lat, 'lng': ?lng},
      );
      return Appointment.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw DoctorApiError(
        e.response?.data?['error'] as String? ??
            'Could not update travel status.',
      );
    }
  }

  /// Replaces the full medicine list for an appointment's prescription.
  Future<List<PrescriptionMedicine>> saveMedicines(
    String appointmentId,
    List<PrescriptionMedicine> medicines,
  ) async {
    try {
      final res = await _dio.post(
        '/api/appointments/$appointmentId/prescription-items',
        data: {'medicines': medicines.map((m) => m.toJson()).toList()},
      );
      return (res.data as List)
          .map((e) => PrescriptionMedicine.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw DoctorApiError(
        e.response?.data?['error'] as String? ??
            'Could not save the prescription.',
      );
    }
  }

  /// Uploads one or more report/scan files (PDF/JPG/PNG, matched to the
  /// backend's ALLOWED_TYPES) for this appointment's prescription. For a
  /// HOME visit, the backend rejects this until travelStatus is ARRIVED.
  ///
  /// Takes [PlatformFile] (from `file_picker`) rather than `dart:io`'s
  /// `File` — on Flutter Web, picked files have no filesystem `path` (the
  /// browser never exposes one). `readAsBytes()` works uniformly across
  /// every platform, so it's used here instead of branching on `path`.
  Future<Appointment> uploadAttachments(
    String appointmentId,
    List<PlatformFile> files,
  ) async {
    try {
      final form = FormData();
      for (final file in files) {
        final bytes = await file.readAsBytes();
        form.files.add(
          MapEntry('file', MultipartFile.fromBytes(bytes, filename: file.name)),
        );
      }
      final res = await _dio.post(
        '/api/appointments/$appointmentId/prescription',
        data: form,
      );
      return Appointment.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw DoctorApiError(
        e.response?.data?['error'] as String? ??
            'Could not upload the file(s).',
      );
    }
  }

  /// Deletes a previously uploaded attachment from this appointment.
  Future<void> deleteAttachment(
    String appointmentId,
    String attachmentId,
  ) async {
    try {
      await _dio.delete(
        '/api/appointments/$appointmentId/prescription/$attachmentId',
      );
    } on DioException catch (e) {
      throw DoctorApiError(
        e.response?.data?['error'] as String? ??
            'Could not delete the attachment.',
      );
    }
  }

  /// Verifies the 6-digit visit code the patient reads out in person. Must
  /// succeed before the backend allows any prescription writes.
  Future<Appointment> verifyOtp(String appointmentId, String otp) async {
    try {
      final res = await _dio.patch(
        '/api/appointments/$appointmentId/otp',
        data: {'otp': otp},
      );
      return Appointment.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw DoctorApiError(
        e.response?.data?['error'] as String? ?? 'Could not verify the OTP.',
      );
    }
  }
}

@riverpod
DoctorAppointmentsRepository doctorAppointmentsRepository(Ref ref) {
  return DoctorAppointmentsRepository(ref.watch(dioProvider));
}

/// Polls every 5s, matching the web's doctor/dashboard interval.
@riverpod
Stream<List<Appointment>> doctorAppointmentsList(Ref ref) async* {
  final repo = ref.watch(doctorAppointmentsRepositoryProvider);
  while (true) {
    yield await repo.listMine();
    await Future.delayed(const Duration(seconds: 5));
  }
}
