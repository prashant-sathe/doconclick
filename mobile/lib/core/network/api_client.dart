import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../storage/token_storage.dart';
import 'api_config.dart';

part 'api_client.g.dart';

/// Endpoints that must never carry a bearer token — either because they
/// issue the token in the first place (no token exists yet to send), or
/// because they're genuinely public (same set the web app leaves
/// unauthenticated per src/proxy.ts's API bypass).
///
/// `/api/mobile/auth/me` and `/api/mobile/auth/refresh` are deliberately
/// NOT here even though they share the `/api/mobile/auth/` prefix: both
/// require `getAuthUserFromBearer` server-side, so excluding them here
/// silently strips the token restoreSession() needs on every app start —
/// leaving the user looking logged-out even though a valid token exists.
///
/// Same trap with `/api/doctors`: only the list (`/api/doctors`), a single
/// doctor (`/api/doctors/{id}`), and its reviews (`/api/doctors/{id}/reviews`)
/// are genuinely public. A plain prefix match also swallows
/// `/api/doctors/me`(/documents), `/api/doctors/patients/{id}`,
/// `/api/doctors/registration-fee/create-order`, and
/// `/api/doctors/subscription/create-order` — all authenticated — stripping
/// their bearer token and turning every one of those screens into a silent
/// 401. `_doctorsPublicPath` matches only the actual public shape.
final _doctorsPublicPath = RegExp(r'^/api/doctors/([^/]+)(/reviews)?$');
const _doctorsPrivateFirstSegment = {'me'}; // the only single-segment private route

bool isPublicPath(String path) {
  const publicExact = [
    '/api/mobile/auth/login',
    '/api/mobile/auth/register/patient',
    '/api/mobile/auth/register/doctor',
    '/api/mobile/auth/google',
    '/api/doctors',
  ];
  const publicPrefixes = [
    '/api/specialties',
    '/api/geocode/search',
    '/api/health',
  ];
  if (publicExact.contains(path) || publicPrefixes.any(path.startsWith)) return true;

  final doctorsMatch = _doctorsPublicPath.firstMatch(path);
  if (doctorsMatch != null && !_doctorsPrivateFirstSegment.contains(doctorsMatch.group(1))) {
    return true;
  }
  return false;
}

class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._tokenStorage, this._onUnauthorized);

  final TokenStorage _tokenStorage;
  final Future<void> Function() _onUnauthorized;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (!isPublicPath(options.path)) {
      final token = await _tokenStorage.read();
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401 && !isPublicPath(err.requestOptions.path)) {
      await _onUnauthorized();
    }
    handler.next(err);
  }
}

@riverpod
TokenStorage tokenStorage(Ref ref) => TokenStorage(const FlutterSecureStorage());

@riverpod
Dio dio(Ref ref) {
  final dio = Dio(BaseOptions(
    baseUrl: ApiConfig.baseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Content-Type': 'application/json'},
  ));

  dio.interceptors.add(AuthInterceptor(
    ref.read(tokenStorageProvider),
    () async => ref.read(tokenStorageProvider).clear(),
  ));

  return dio;
}
