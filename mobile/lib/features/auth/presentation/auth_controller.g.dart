// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Holds the current session, mirroring src/components/AuthProvider.tsx's
/// role in the web app. `null` means signed out; loading means we're still
/// checking a persisted token on app start.

@ProviderFor(AuthController)
final authControllerProvider = AuthControllerProvider._();

/// Holds the current session, mirroring src/components/AuthProvider.tsx's
/// role in the web app. `null` means signed out; loading means we're still
/// checking a persisted token on app start.
final class AuthControllerProvider
    extends $AsyncNotifierProvider<AuthController, AuthUser?> {
  /// Holds the current session, mirroring src/components/AuthProvider.tsx's
  /// role in the web app. `null` means signed out; loading means we're still
  /// checking a persisted token on app start.
  AuthControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'authControllerProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$authControllerHash();

  @$internal
  @override
  AuthController create() => AuthController();
}

String _$authControllerHash() => r'd3188d351e6fc6cbbf5cbfeafd37e77a4a2892a1';

/// Holds the current session, mirroring src/components/AuthProvider.tsx's
/// role in the web app. `null` means signed out; loading means we're still
/// checking a persisted token on app start.

abstract class _$AuthController extends $AsyncNotifier<AuthUser?> {
  FutureOr<AuthUser?> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<AuthUser?>, AuthUser?>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<AuthUser?>, AuthUser?>,
              AsyncValue<AuthUser?>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
