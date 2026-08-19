import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import 'booking_repository.dart';

part 'appointment_payment_repository.g.dart';

typedef CashfreeOrder = ({String orderId, String paymentSessionId});

class AppointmentPaymentRepository {
  AppointmentPaymentRepository(this._dio);
  final Dio _dio;

  Future<CashfreeOrder> createOrder(String appointmentId) async {
    try {
      final res = await _dio.post('/api/payments/create-order', data: {'appointmentId': appointmentId});
      final data = res.data as Map<String, dynamic>;
      return (orderId: data['orderId'] as String, paymentSessionId: data['paymentSessionId'] as String);
    } on DioException catch (e) {
      throw BookingApiError(e.response?.data?['error'] as String? ?? 'Could not start payment.');
    }
  }
}

@riverpod
AppointmentPaymentRepository appointmentPaymentRepository(Ref ref) {
  return AppointmentPaymentRepository(ref.watch(dioProvider));
}
