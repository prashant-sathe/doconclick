import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import '../domain/patient_dependent.dart';

part 'dependents_repository.g.dart';

class DependentsRepository {
  DependentsRepository(this._dio);
  final Dio _dio;

  Future<List<PatientDependent>> list() async {
    final res = await _dio.get('/api/patients/me/dependents');
    return (res.data as List).map((e) => PatientDependent.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<PatientDependent> create(Map<String, dynamic> data) async {
    final res = await _dio.post('/api/patients/me/dependents', data: data);
    return PatientDependent.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> delete(String id) => _dio.delete('/api/patients/me/dependents/$id');
}

@riverpod
DependentsRepository dependentsRepository(Ref ref) => DependentsRepository(ref.watch(dioProvider));

@riverpod
Future<List<PatientDependent>> dependentsList(Ref ref) {
  return ref.watch(dependentsRepositoryProvider).list();
}
