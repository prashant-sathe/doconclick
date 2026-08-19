import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../data/auth_repository.dart';
import '../domain/auth_user.dart';

part 'auth_controller.g.dart';

/// Holds the current session, mirroring src/components/AuthProvider.tsx's
/// role in the web app. `null` means signed out; loading means we're still
/// checking a persisted token on app start.
@riverpod
class AuthController extends _$AuthController {
  @override
  Future<AuthUser?> build() {
    return ref.watch(authRepositoryProvider).restoreSession();
  }

  Future<void> login({required String mobile, required String password}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(authRepositoryProvider).login(mobile: mobile, password: password),
    );
  }

  Future<void> registerPatient({
    required String name,
    required String mobile,
    required String password,
    required int age,
    required String gender,
    String? email,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(authRepositoryProvider).registerPatient(
            name: name,
            mobile: mobile,
            password: password,
            age: age,
            gender: gender,
            email: email,
          ),
    );
  }

  Future<void> registerDoctor({
    required String name,
    required String mobile,
    required String password,
    String? email,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(authRepositoryProvider).registerDoctor(
            name: name,
            mobile: mobile,
            password: password,
            email: email,
          ),
    );
  }

  Future<void> continueWithGoogle({required String idToken, String? role, String? intent}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(authRepositoryProvider).continueWithGoogle(idToken: idToken, role: role, intent: intent),
    );
  }

  Future<void> completeMobileNumber(String mobile) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(authRepositoryProvider).completeMobileNumber(mobile),
    );
  }

  Future<void> logout() async {
    await ref.read(authRepositoryProvider).logout();
    state = const AsyncData(null);
  }
}
