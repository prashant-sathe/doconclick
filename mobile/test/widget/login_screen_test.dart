import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:doconclick_mobile/features/auth/data/auth_repository.dart';
import 'package:doconclick_mobile/features/auth/domain/auth_user.dart';
import 'package:doconclick_mobile/features/auth/presentation/login_screen.dart';
import 'package:doconclick_mobile/shared/widgets/google_sign_in_button.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

void main() {
  late MockAuthRepository repository;

  setUp(() {
    repository = MockAuthRepository();
    when(() => repository.restoreSession()).thenAnswer((_) async => null);
  });

  Widget buildApp() {
    return ProviderScope(
      overrides: [authRepositoryProvider.overrideWithValue(repository)],
      child: const MaterialApp(home: LoginScreen()),
    );
  }

  testWidgets('renders mobile and password fields with a sign-in button', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Mobile number'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Password'), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, 'Sign in'), findsOneWidget);
    // Regression guard: a "Sign in with Google" entry point must always be
    // present — it was implemented (GoogleAuthService, backend endpoint)
    // but never actually wired into this screen's UI until this was caught.
    expect(find.byType(GoogleSignInButton), findsOneWidget);
  });

  testWidgets('shows a validation error when submitting an empty form', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
    await tester.pump();

    expect(find.text('Enter a valid mobile number'), findsOneWidget);
    verifyNever(() => repository.login(mobile: any(named: 'mobile'), password: any(named: 'password')));
  });

  testWidgets('calls AuthRepository.login with the entered credentials', (tester) async {
    when(() => repository.login(mobile: '9876543210', password: 'secret1'))
        .thenAnswer((_) async => const AuthUser(id: '1', name: 'Test', role: 'PATIENT', mobile: '9876543210'));

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'Mobile number'), '9876543210');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'secret1');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
    await tester.pumpAndSettle();

    verify(() => repository.login(mobile: '9876543210', password: 'secret1')).called(1);
  });
}
