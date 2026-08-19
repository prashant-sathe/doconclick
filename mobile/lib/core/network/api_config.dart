import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode;

/// Base URL of the doconclick Next.js backend. In debug builds, points at
/// the local dev server — Android emulators reach the host machine via
/// 10.0.2.2, not localhost; iOS simulators, Chrome (`flutter run -d chrome`),
/// and macOS desktop all reach it directly via localhost.
///
/// Override at build/run time with:
///   flutter run --dart-define=API_BASE_URL=https://your-domain.com
class ApiConfig {
  static const String _override = String.fromEnvironment('API_BASE_URL');

  static String get baseUrl {
    if (_override.isNotEmpty) return _override;
    if (kDebugMode) {
      if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2:3000';
      return 'http://localhost:3000';
    }
    return 'https://doconclick.co.in';
  }
}
