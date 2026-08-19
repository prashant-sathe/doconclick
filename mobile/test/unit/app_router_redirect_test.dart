import 'package:flutter_test/flutter_test.dart';

import 'package:doconclick_mobile/core/router/app_router.dart';
import 'package:doconclick_mobile/features/auth/domain/auth_user.dart';

// Pure decision-table tests mirroring src/proxy.ts's redirect rules for the
// two roles this app serves (PATIENT, DOCTOR — no ADMIN login on mobile).
void main() {
  const patient = AuthUser(id: '1', name: 'P', role: 'PATIENT', mobile: '9876543210');
  const doctor = AuthUser(id: '2', name: 'D', role: 'DOCTOR', mobile: '9876543211');
  const pendingGoogleUser = AuthUser(id: '3', name: 'G', role: 'PATIENT', mobile: 'pending_abc');

  test('loading state never redirects (splash screen owns it)', () {
    expect(computeRedirect(user: null, isLoading: true, location: '/patient'), isNull);
  });

  test('unauthenticated user is sent to /login from a protected route', () {
    expect(computeRedirect(user: null, isLoading: false, location: '/patient'), '/login');
    expect(computeRedirect(user: null, isLoading: false, location: '/doctor'), '/login');
  });

  test('unauthenticated user may stay on public auth routes', () {
    for (final path in ['/login', '/register', '/forgot-password']) {
      expect(computeRedirect(user: null, isLoading: false, location: path), isNull);
    }
  });

  test('authenticated user is bounced off auth routes to their role home', () {
    expect(computeRedirect(user: patient, isLoading: false, location: '/login'), '/patient');
    expect(computeRedirect(user: doctor, isLoading: false, location: '/login'), '/doctor');
  });

  test('a pending (Google) mobile number forces /complete-profile everywhere else', () {
    expect(computeRedirect(user: pendingGoogleUser, isLoading: false, location: '/patient'), '/complete-profile');
    expect(computeRedirect(user: pendingGoogleUser, isLoading: false, location: '/complete-profile'), isNull);
  });

  test('completing the mobile number sends the user home instead of leaving them stuck on /complete-profile', () {
    // Regression: the just-completed-mobile user is no longer "pending" but
    // is still sitting on /complete-profile when authState updates — nothing
    // upstream of this case sent them anywhere, so the Continue button
    // appeared to do nothing even though the backend call had succeeded.
    expect(computeRedirect(user: patient, isLoading: false, location: '/complete-profile'), '/patient');
    expect(computeRedirect(user: doctor, isLoading: false, location: '/complete-profile'), '/doctor');
  });

  test('a patient cannot view doctor routes and vice versa', () {
    expect(computeRedirect(user: patient, isLoading: false, location: '/doctor'), '/patient');
    expect(computeRedirect(user: doctor, isLoading: false, location: '/patient'), '/doctor');
  });

  test('authenticated, complete-profile user on their own home is left alone', () {
    expect(computeRedirect(user: patient, isLoading: false, location: '/patient'), isNull);
    expect(computeRedirect(user: doctor, isLoading: false, location: '/doctor'), isNull);
  });
}
