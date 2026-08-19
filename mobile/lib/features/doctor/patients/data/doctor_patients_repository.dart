import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import '../../../../shared/models/patient_record.dart';

part 'doctor_patients_repository.g.dart';

class DoctorPatientsRepository {
  DoctorPatientsRepository(this._dio);
  final Dio _dio;

  Future<PatientRecord> getRecord(String patientId, {String? dependentId}) async {
    final res = await _dio.get(
      '/api/doctors/patients/$patientId',
      queryParameters: {'dependentId': ?dependentId},
    );
    return PatientRecord.fromJson(res.data as Map<String, dynamic>);
  }
}

@riverpod
DoctorPatientsRepository doctorPatientsRepository(Ref ref) {
  return DoctorPatientsRepository(ref.watch(dioProvider));
}
