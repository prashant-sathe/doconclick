import 'dart:io';

import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import '../../../../shared/models/doctor_account.dart';

part 'doctor_profile_repository.g.dart';

class DoctorProfileRepository {
  DoctorProfileRepository(this._dio);
  final Dio _dio;

  Future<DoctorAccount> me() async {
    final res = await _dio.get('/api/doctors/me');
    return DoctorAccount.fromJson(res.data as Map<String, dynamic>);
  }

  Future<DoctorFullProfile> update(Map<String, dynamic> data) async {
    final res = await _dio.patch('/api/doctors/me', data: data);
    return DoctorFullProfile.fromJson(res.data as Map<String, dynamic>);
  }

  /// [type] is one of: photo | medRegCert | degreeCert | kyc | clinicPhoto
  Future<DoctorFullProfile> uploadDocument(String type, File file) async {
    final form = FormData.fromMap({
      'type': type,
      'file': await MultipartFile.fromFile(file.path),
    });
    final res = await _dio.post('/api/doctors/me/documents', data: form);
    return DoctorFullProfile.fromJson(res.data as Map<String, dynamic>);
  }
}

@riverpod
DoctorProfileRepository doctorProfileRepository(Ref ref) {
  return DoctorProfileRepository(ref.watch(dioProvider));
}

@riverpod
Future<DoctorAccount> doctorAccount(Ref ref) {
  return ref.watch(doctorProfileRepositoryProvider).me();
}
