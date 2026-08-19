import 'dart:io' show Platform;

import 'package:google_sign_in/google_sign_in.dart';

/// The backend's `GOOGLE_CLIENT_ID` (web OAuth client — see .env) — passing
/// it as `serverClientId` below is what makes google_sign_in v7 issue an ID
/// token whose `aud` claim matches what `/api/mobile/auth/google` verifies
/// against, on both Android and iOS. Client IDs are not secrets (they're
/// already public inside every signed-in ID token, and used the same way on
/// the web login flow), so hardcoding them here — with build-time overrides
/// for switching projects — is the standard approach.
const String _defaultServerClientId = '858264508334-gktl5npugk8gtau63q5v1hufj8t1s57o.apps.googleusercontent.com';
const String _serverClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID', defaultValue: _defaultServerClientId);

/// iOS-only: google_sign_in requires the platform's own OAuth client id
/// (unlike Android, which is auto-discovered from package name + SHA-1
/// registered against an Android OAuth client in the Cloud project — no
/// clientId needed there). Must match the reversed-client-id URL scheme
/// registered in Info.plist's CFBundleURLTypes.
const String _defaultIosClientId = '858264508334-nfv7tjnemlsf2m1br09jcjv0ljq2q38n.apps.googleusercontent.com';
const String _iosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID', defaultValue: _defaultIosClientId);

/// Thin wrapper around native Google Sign-In, returning just the ID token
/// our backend's `/api/mobile/auth/google` endpoint verifies server-side.
class GoogleAuthService {
  GoogleAuthService._();
  static final instance = GoogleAuthService._();

  bool _initialized = false;

  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    await GoogleSignIn.instance.initialize(
      clientId: Platform.isIOS ? _iosClientId : null,
      serverClientId: _serverClientId,
    );
    _initialized = true;
  }

  /// Returns the Google ID token for the signed-in account, or `null` if
  /// the user cancelled the flow.
  Future<String?> signIn() async {
    await _ensureInitialized();
    final account = await GoogleSignIn.instance.authenticate();
    return account.authentication.idToken;
  }

  Future<void> signOut() async {
    if (!_initialized) return;
    await GoogleSignIn.instance.signOut();
  }
}
