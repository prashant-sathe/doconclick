import 'package:flutter_test/flutter_test.dart';

import 'package:doconclick_mobile/core/network/api_client.dart';

// Regression coverage for a bug class that has bitten twice: a prefix meant
// for a handful of genuinely public sub-paths (e.g. "/api/doctors" for the
// public listing) also matches authenticated sibling routes sharing that
// prefix (e.g. "/api/doctors/me"), silently stripping their bearer token and
// turning the screen into a 401. Every route below must be checked exactly,
// not loosened back into a prefix match.
void main() {
  test('public auth-issuing/public endpoints never carry a bearer token', () {
    for (final path in [
      '/api/mobile/auth/login',
      '/api/mobile/auth/register/patient',
      '/api/mobile/auth/register/doctor',
      '/api/mobile/auth/google',
      '/api/specialties',
      '/api/geocode/search',
      '/api/health',
      '/api/doctors',
      '/api/doctors/cms123abc',
      '/api/doctors/cms123abc/reviews',
    ]) {
      expect(isPublicPath(path), isTrue, reason: '$path should be public');
    }
  });

  test('session-restore endpoints under /api/mobile/auth/ still require a bearer token', () {
    expect(isPublicPath('/api/mobile/auth/me'), isFalse);
    expect(isPublicPath('/api/mobile/auth/refresh'), isFalse);
  });

  test('doctor endpoints sharing the /api/doctors prefix still require a bearer token', () {
    for (final path in [
      '/api/doctors/me',
      '/api/doctors/me/documents',
      '/api/doctors/patients/cms123abc',
      '/api/doctors/registration-fee/create-order',
      '/api/doctors/subscription/create-order',
    ]) {
      expect(isPublicPath(path), isFalse, reason: '$path must send a bearer token');
    }
  });
}
