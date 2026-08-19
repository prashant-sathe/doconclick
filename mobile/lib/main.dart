import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/push/push_service.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/domain/auth_user.dart';
import 'features/auth/presentation/auth_controller.dart';

void main() {
  runApp(const ProviderScope(child: DoconclickApp()));
}

class DoconclickApp extends ConsumerStatefulWidget {
  const DoconclickApp({super.key});

  @override
  ConsumerState<DoconclickApp> createState() => _DoconclickAppState();
}

class _DoconclickAppState extends ConsumerState<DoconclickApp> {
  @override
  void initState() {
    super.initState();
    // Best-effort: no-ops entirely if Firebase isn't configured for this
    // build yet (see PushService's class doc).
    ref.read(pushServiceProvider).initialize();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);

    ref.listen(authControllerProvider, (previous, next) {
      final user = next.value;
      if (user != null && previous?.value == null) {
        ref.read(pushServiceProvider).registerDeviceToken();
      } else if (user == null && previous?.value != null) {
        ref.read(pushServiceProvider).unregisterDeviceToken();
      }
    });

    ref.listen(pendingNotificationTargetProvider, (previous, appointmentId) {
      if (appointmentId == null) return;
      final user = ref.read(authControllerProvider).value;
      final base = (user?.isDoctor ?? false) ? '/doctor/appointments' : '/patient/appointments';
      router.push('$base/$appointmentId');
      ref.read(pendingNotificationTargetProvider.notifier).clear();
    });

    return MaterialApp.router(
      title: 'doconclick',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      routerConfig: router,
    );
  }
}
