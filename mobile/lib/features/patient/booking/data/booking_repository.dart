import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import '../../../../shared/models/appointment.dart';

part 'booking_repository.g.dart';

class BookingApiError implements Exception {
  BookingApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

class BookingRepository {
  BookingRepository(this._dio);
  final Dio _dio;

  /// Mirrors POST /api/appointments (src/app/api/appointments/route.ts) —
  /// same field names/contract the web's two booking pages already post to.
  Future<Appointment> createAppointment({
    required String doctorId,
    required String symptoms,
    required String consultType,
    required double amount,
    String? dependentId,
    String? allergies,
    bool consentGiven = false,
    bool isEmergency = false,
    DateTime? scheduledAt,
    String? followUpOfId,
  }) async {
    try {
      final res = await _dio.post('/api/appointments', data: {
        'doctorId': doctorId,
        'symptoms': symptoms,
        'consultType': consultType,
        'amount': amount,
        'dependentId': dependentId,
        'allergies': allergies,
        'consentGiven': consentGiven,
        'isEmergency': isEmergency,
        'followUpOfId': followUpOfId,
        if (scheduledAt != null) 'scheduledAt': scheduledAt.toIso8601String(),
      });
      return Appointment.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw BookingApiError(e.response?.data?['error'] as String? ?? 'Booking failed. Please try again.');
    }
  }
}

@riverpod
BookingRepository bookingRepository(Ref ref) => BookingRepository(ref.watch(dioProvider));
