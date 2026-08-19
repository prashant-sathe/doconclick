import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/network/api_client.dart';
import '../../../core/storage/token_storage.dart';
import '../domain/auth_user.dart';

part 'auth_repository.g.dart';

class ApiError implements Exception {
  ApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

class AuthRepository {
  AuthRepository(this._dio, this._tokenStorage);

  final Dio _dio;
  final TokenStorage _tokenStorage;

  Future<AuthUser> login({required String mobile, required String password}) async {
    return _postAndPersist('/api/mobile/auth/login', {'mobile': mobile, 'password': password});
  }

  Future<AuthUser> registerPatient({
    required String name,
    required String mobile,
    required String password,
    required int age,
    required String gender,
    String? email,
  }) {
    return _postAndPersist('/api/mobile/auth/register/patient', {
      'name': name,
      'mobile': mobile,
      'password': password,
      'age': age,
      'gender': gender,
      if (email != null && email.isNotEmpty) 'email': email,
    });
  }

  Future<AuthUser> registerDoctor({
    required String name,
    required String mobile,
    required String password,
    String? email,
  }) {
    return _postAndPersist('/api/mobile/auth/register/doctor', {
      'name': name,
      'mobile': mobile,
      'password': password,
      if (email != null && email.isNotEmpty) 'email': email,
    });
  }

  /// [idToken] is the Google ID token from native `google_sign_in`.
  /// [role] only matters when no account exists yet for this Google email.
  Future<AuthUser> continueWithGoogle({required String idToken, String? role, String? intent}) {
    return _postAndPersist('/api/mobile/auth/google', {
      'idToken': idToken,
      'role': ?role,
      'intent': ?intent,
    });
  }

  /// One-time step for Google sign-ins to replace their placeholder
  /// "pending_..." mobile with a real number (mirrors the web's
  /// /complete-profile page, PATCH /api/auth/mobile).
  Future<AuthUser> completeMobileNumber(String mobile) async {
    try {
      final res = await _dio.patch('/api/auth/mobile', data: {'mobile': mobile});
      final data = res.data as Map<String, dynamic>;
      final token = data['token'] as String;
      await _tokenStorage.write(token);
      final current = await restoreSession();
      return current!;
    } on DioException catch (e) {
      throw ApiError(e.response?.data?['error'] as String? ?? 'Could not save your mobile number.');
    }
  }

  /// Forgot-password flow: identity is proven by a fresh Google sign-in
  /// (intent: "reset"), then this sets the new password on that account —
  /// mirrors the web's PATCH /api/auth/password, reached only once signed in.
  Future<void> resetPassword(String newPassword) async {
    try {
      await _dio.patch('/api/auth/password', data: {'password': newPassword});
    } on DioException catch (e) {
      throw ApiError(e.response?.data?['error'] as String? ?? 'Could not reset your password.');
    }
  }

  Future<AuthUser?> restoreSession() async {
    final token = await _tokenStorage.read();
    if (token == null) return null;
    try {
      final res = await _dio.get('/api/mobile/auth/me');
      return AuthUser.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      // Only a real 401 means the token itself is invalid. A timeout or
      // connection failure (e.g. dev server hiccup, emulator under load)
      // says nothing about the token's validity — clearing it there would
      // force a needless re-login for what's really just a transient
      // network failure.
      if (e.response?.statusCode == 401) {
        await _tokenStorage.clear();
      }
      return null;
    }
  }

  Future<void> logout() => _tokenStorage.clear();

  Future<AuthUser> _postAndPersist(String path, Map<String, dynamic> body) async {
    try {
      final res = await _dio.post(path, data: body);
      final data = res.data as Map<String, dynamic>;
      final token = data['token'] as String;
      final user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);
      await _tokenStorage.write(token);
      return user;
    } on DioException catch (e) {
      throw ApiError(e.response?.data?['error'] as String? ?? 'Something went wrong. Please try again.');
    }
  }
}

@riverpod
AuthRepository authRepository(Ref ref) {
  return AuthRepository(ref.watch(dioProvider), ref.watch(tokenStorageProvider));
}
