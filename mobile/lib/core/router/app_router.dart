import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../features/auth/domain/auth_user.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/complete_profile_screen.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/doctor/dashboard/presentation/doctor_appointment_screen.dart';
import '../../features/doctor/dashboard/presentation/doctor_home_screen.dart';
import '../../features/doctor/earnings/presentation/doctor_earnings_screen.dart';
import '../../features/doctor/patients/presentation/doctor_patients_list_screen.dart';
import '../../features/doctor/patients/presentation/patient_record_screen.dart';
import '../../features/doctor/profile/presentation/doctor_profile_screen.dart';
import '../../features/doctor/registration/presentation/registration_payment_screen.dart';
import '../../features/doctor/registration/presentation/subscription_payment_screen.dart';
import '../../features/patient/appointments/presentation/appointment_detail_screen.dart';
import '../../features/patient/appointments/presentation/patient_appointments_screen.dart';
import '../../features/patient/booking/presentation/booking_screen.dart';
import '../../features/patient/dependents/presentation/dependents_screen.dart';
import '../../features/patient/discovery/presentation/doctor_profile_screen.dart';
import '../../features/patient/discovery/presentation/patient_home_screen.dart';
import '../../features/patient/prescriptions/presentation/prescription_screen.dart';
import '../../features/patient/profile/presentation/patient_profile_screen.dart';
import '../../features/patient/tracking/presentation/tracking_screen.dart';
import '../../shared/chat/chat_screen.dart';

part 'app_router.g.dart';

const _publicPaths = {'/login', '/register', '/forgot-password'};

/// Reproduces src/proxy.ts's decision table for the two roles this app
/// serves (no ADMIN login on mobile):
///   unauthenticated -> /login
///   Google sign-in with a placeholder "pending_" mobile -> /complete-profile
///   role mismatch -> that role's home
String? computeRedirect({required AuthUser? user, required bool isLoading, required String location}) {
  if (isLoading) return null; // splash screen handles this state

  if (user == null) {
    return _publicPaths.contains(location) ? null : '/login';
  }

  if (_publicPaths.contains(location)) {
    return user.hasPendingMobile ? '/complete-profile' : (user.isDoctor ? '/doctor' : '/patient');
  }

  if (user.hasPendingMobile && location != '/complete-profile') {
    return '/complete-profile';
  }

  // Mobile number just got completed — nothing above sends a no-longer-
  // pending user away from /complete-profile, so without this they'd be
  // stuck there forever after a successful submit.
  if (!user.hasPendingMobile && location == '/complete-profile') {
    return user.isDoctor ? '/doctor' : '/patient';
  }

  if (location.startsWith('/doctor') && !user.isDoctor) return '/patient';
  if (location.startsWith('/patient') && user.isDoctor) return '/doctor';

  return null;
}

@riverpod
GoRouter appRouter(Ref ref) {
  return GoRouter(
    initialLocation: '/login',
    refreshListenable: GoRouterRefreshStream(ref),
    redirect: (context, state) {
      final authState = ref.read(authControllerProvider);
      return computeRedirect(
        user: authState.value,
        isLoading: authState.isLoading,
        location: state.matchedLocation,
      );
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
      GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(path: '/complete-profile', builder: (context, state) => const CompleteProfileScreen()),
      GoRoute(path: '/patient', builder: (context, state) => const PatientHomeScreen()),
      GoRoute(
        path: '/patient/doctor/:id',
        builder: (context, state) => DoctorProfileScreen(doctorId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/patient/book',
        builder: (context, state) => BookingScreen(
          doctorId: state.uri.queryParameters['doctorId']!,
          followUpOfId: state.uri.queryParameters['followUpOf'],
        ),
      ),
      GoRoute(path: '/patient/appointments', builder: (context, state) => const PatientAppointmentsScreen()),
      GoRoute(
        path: '/patient/appointments/:id',
        builder: (context, state) => AppointmentDetailScreen(appointmentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/patient/appointments/:id/chat',
        builder: (context, state) => ChatScreen(appointmentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/patient/appointments/:id/track',
        builder: (context, state) => TrackingScreen(appointmentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/patient/appointments/:id/prescription',
        builder: (context, state) => PrescriptionScreen(appointmentId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/patient/profile', builder: (context, state) => const PatientProfileScreen()),
      GoRoute(path: '/patient/dependents', builder: (context, state) => const DependentsScreen()),
      GoRoute(path: '/doctor', builder: (context, state) => const DoctorHomeScreen()),
      GoRoute(
        path: '/doctor/appointments/:id',
        builder: (context, state) => DoctorAppointmentScreen(appointmentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/doctor/appointments/:id/chat',
        builder: (context, state) => ChatScreen(appointmentId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/doctor/patients', builder: (context, state) => const DoctorPatientsListScreen()),
      GoRoute(
        path: '/doctor/patients/:patientId',
        builder: (context, state) => PatientRecordScreen(
          patientId: state.pathParameters['patientId']!,
          dependentId: state.uri.queryParameters['dependentId'],
        ),
      ),
      GoRoute(path: '/doctor/earnings', builder: (context, state) => const DoctorEarningsScreen()),
      GoRoute(path: '/doctor/profile', builder: (context, state) => const DoctorOwnProfileScreen()),
      GoRoute(path: '/doctor/registration-payment', builder: (context, state) => const RegistrationPaymentScreen()),
      GoRoute(path: '/doctor/subscription-payment', builder: (context, state) => const SubscriptionPaymentScreen()),
    ],
  );
}

/// Bridges Riverpod's AsyncValue stream of auth state into a Listenable
/// go_router can watch for `redirect` re-evaluation.
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Ref ref) {
    ref.listen(authControllerProvider, (_, _) => notifyListeners());
  }
}
