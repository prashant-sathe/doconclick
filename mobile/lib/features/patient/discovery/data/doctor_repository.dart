import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/network/api_client.dart';
import '../../../../shared/models/doctor_profile.dart';
import '../../../../shared/models/geocode_result.dart';
import '../../../../shared/models/specialty.dart';

part 'doctor_repository.g.dart';

class DoctorRepository {
  DoctorRepository(this._dio);
  final Dio _dio;

  Future<List<Doctor>> listDoctors({String? specialty}) async {
    final res = await _dio.get('/api/doctors', queryParameters: {
      if (specialty != null && specialty.isNotEmpty) 'specialty': specialty,
    });
    return (res.data as List).map((e) => Doctor.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Doctor> getDoctor(String id) async {
    final res = await _dio.get('/api/doctors/$id');
    return Doctor.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<Specialty>> listSpecialties() async {
    final res = await _dio.get('/api/specialties');
    return (res.data as List).map((e) => Specialty.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<GeocodeResult>> searchAddress(String query) async {
    if (query.trim().length < 3) return [];
    final res = await _dio.get('/api/geocode/search', queryParameters: {'q': query});
    return (res.data as List).map((e) => GeocodeResult.fromJson(e as Map<String, dynamic>)).toList();
  }
}

@riverpod
DoctorRepository doctorRepository(Ref ref) => DoctorRepository(ref.watch(dioProvider));

@riverpod
Future<List<Doctor>> doctorList(Ref ref, {String? specialty}) {
  return ref.watch(doctorRepositoryProvider).listDoctors(specialty: specialty);
}

@riverpod
Future<Doctor> doctorDetail(Ref ref, String id) {
  return ref.watch(doctorRepositoryProvider).getDoctor(id);
}

@riverpod
Future<List<Specialty>> specialtyList(Ref ref) {
  return ref.watch(doctorRepositoryProvider).listSpecialties();
}
