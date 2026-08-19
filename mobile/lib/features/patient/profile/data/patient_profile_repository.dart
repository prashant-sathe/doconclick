import 'dart:io';

import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import '../../../../shared/models/patient_profile.dart';

part 'patient_profile_repository.g.dart';

class PatientProfileRepository {
  PatientProfileRepository(this._dio);
  final Dio _dio;

  Future<PatientAccount> me() async {
    final res = await _dio.get('/api/patients/me');
    return PatientAccount.fromJson(res.data as Map<String, dynamic>);
  }

  Future<PatientProfileDetail> update(Map<String, dynamic> data) async {
    final res = await _dio.patch('/api/patients/me', data: data);
    return PatientProfileDetail.fromJson(res.data as Map<String, dynamic>);
  }

  Future<String> uploadPhoto(File file) async {
    final form = FormData.fromMap({'file': await MultipartFile.fromFile(file.path)});
    final res = await _dio.post('/api/patients/me/photo', data: form);
    return (res.data as Map<String, dynamic>)['photoUrl'] as String;
  }
}

@riverpod
PatientProfileRepository patientProfileRepository(Ref ref) {
  return PatientProfileRepository(ref.watch(dioProvider));
}

@riverpod
Future<PatientAccount> patientAccount(Ref ref) {
  return ref.watch(patientProfileRepositoryProvider).me();
}
