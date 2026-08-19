// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_service.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Set whenever a notification is tapped (foreground-local-notification tap,
/// background tap, or a cold start from a notification) — the appointment id
/// to deep-link to. The root app widget listens for this and navigates,
/// keeping this file decoupled from go_router (which itself depends on
/// auth_controller, which would otherwise create an import cycle).

@ProviderFor(PendingNotificationTarget)
final pendingNotificationTargetProvider = PendingNotificationTargetProvider._();

/// Set whenever a notification is tapped (foreground-local-notification tap,
/// background tap, or a cold start from a notification) — the appointment id
/// to deep-link to. The root app widget listens for this and navigates,
/// keeping this file decoupled from go_router (which itself depends on
/// auth_controller, which would otherwise create an import cycle).
final class PendingNotificationTargetProvider
    extends $NotifierProvider<PendingNotificationTarget, String?> {
  /// Set whenever a notification is tapped (foreground-local-notification tap,
  /// background tap, or a cold start from a notification) — the appointment id
  /// to deep-link to. The root app widget listens for this and navigates,
  /// keeping this file decoupled from go_router (which itself depends on
  /// auth_controller, which would otherwise create an import cycle).
  PendingNotificationTargetProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'pendingNotificationTargetProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$pendingNotificationTargetHash();

  @$internal
  @override
  PendingNotificationTarget create() => PendingNotificationTarget();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(String? value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<String?>(value),
    );
  }
}

String _$pendingNotificationTargetHash() =>
    r'c47d869ae369b5f90bbab18b1c1c6646bd3f575c';

/// Set whenever a notification is tapped (foreground-local-notification tap,
/// background tap, or a cold start from a notification) — the appointment id
/// to deep-link to. The root app widget listens for this and navigates,
/// keeping this file decoupled from go_router (which itself depends on
/// auth_controller, which would otherwise create an import cycle).

abstract class _$PendingNotificationTarget extends $Notifier<String?> {
  String? build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<String?, String?>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<String?, String?>,
              String?,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}

@ProviderFor(pushService)
final pushServiceProvider = PushServiceProvider._();

final class PushServiceProvider
    extends $FunctionalProvider<PushService, PushService, PushService>
    with $Provider<PushService> {
  PushServiceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'pushServiceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$pushServiceHash();

  @$internal
  @override
  $ProviderElement<PushService> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  PushService create(Ref ref) {
    return pushService(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PushService value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PushService>(value),
    );
  }
}

String _$pushServiceHash() => r'c4cc95d2ce97546fe2759a971820b918db39502d';
