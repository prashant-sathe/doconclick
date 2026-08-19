import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import '../../../../shared/models/settlement.dart';

part 'doctor_earnings_repository.g.dart';

class DoctorEarningsRepository {
  DoctorEarningsRepository(this._dio);
  final Dio _dio;

  Future<List<Settlement>> listSettlements() async {
    final res = await _dio.get('/api/doctor/settlements');
    return (res.data as List).map((e) => Settlement.fromJson(e as Map<String, dynamic>)).toList();
  }
}

@riverpod
DoctorEarningsRepository doctorEarningsRepository(Ref ref) {
  return DoctorEarningsRepository(ref.watch(dioProvider));
}

@riverpod
Future<List<Settlement>> doctorSettlementsList(Ref ref) {
  return ref.watch(doctorEarningsRepositoryProvider).listSettlements();
}
