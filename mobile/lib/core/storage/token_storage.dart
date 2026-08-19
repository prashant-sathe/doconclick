import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Keychain/Keystore-backed JWT storage — the mobile analog of the web
/// app's httpOnly `doconclick_token` cookie's security guarantee.
class TokenStorage {
  TokenStorage(this._storage);

  final FlutterSecureStorage _storage;
  static const _tokenKey = 'doconclick_jwt';

  Future<String?> read() => _storage.read(key: _tokenKey);

  Future<void> write(String token) => _storage.write(key: _tokenKey, value: token);

  Future<void> clear() => _storage.delete(key: _tokenKey);
}
