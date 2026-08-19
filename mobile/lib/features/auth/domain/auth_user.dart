import 'package:freezed_annotation/freezed_annotation.dart';

part 'auth_user.freezed.dart';
part 'auth_user.g.dart';

/// Mirrors the JWT payload shape signed by the backend's
/// `JWTPayload` type (src/lib/auth.ts): { id, name, role, mobile }.
@freezed
abstract class AuthUser with _$AuthUser {
  const factory AuthUser({
    required String id,
    required String name,
    required String role,
    required String mobile,
  }) = _AuthUser;

  factory AuthUser.fromJson(Map<String, dynamic> json) => _$AuthUserFromJson(json);
}

extension AuthUserRole on AuthUser {
  bool get isPatient => role == 'PATIENT';
  bool get isDoctor => role == 'DOCTOR';
  bool get hasPendingMobile => mobile.startsWith('pending_');
}
