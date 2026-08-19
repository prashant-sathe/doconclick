import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';

part 'doctor_payments_repository.g.dart';

class DoctorPaymentApiError implements Exception {
  DoctorPaymentApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

typedef CashfreeOrder = ({String orderId, String paymentSessionId});

class DoctorPaymentsRepository {
  DoctorPaymentsRepository(this._dio);
  final Dio _dio;

  /// One-time registration fee — required before admin verification begins.
  Future<CashfreeOrder> createRegistrationFeeOrder() async {
    try {
      final res = await _dio.post('/api/doctors/registration-fee/create-order');
      final data = res.data as Map<String, dynamic>;
      return (orderId: data['orderId'] as String, paymentSessionId: data['paymentSessionId'] as String);
    } on DioException catch (e) {
      throw DoctorPaymentApiError(e.response?.data?['error'] as String? ?? 'Could not start payment.');
    }
  }

  /// Recurring monthly subscription — required to keep receiving bookings
  /// after the free trial (trialEndsAt) or a prior subscription lapses.
  Future<CashfreeOrder> createSubscriptionOrder() async {
    try {
      final res = await _dio.post('/api/doctors/subscription/create-order');
      final data = res.data as Map<String, dynamic>;
      return (orderId: data['orderId'] as String, paymentSessionId: data['paymentSessionId'] as String);
    } on DioException catch (e) {
      throw DoctorPaymentApiError(e.response?.data?['error'] as String? ?? 'Could not start payment.');
    }
  }
}

@riverpod
DoctorPaymentsRepository doctorPaymentsRepository(Ref ref) {
  return DoctorPaymentsRepository(ref.watch(dioProvider));
}
