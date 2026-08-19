// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'doctor_profile_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(doctorProfileRepository)
final doctorProfileRepositoryProvider = DoctorProfileRepositoryProvider._();

final class DoctorProfileRepositoryProvider
    extends
        $FunctionalProvider<
          DoctorProfileRepository,
          DoctorProfileRepository,
          DoctorProfileRepository
        >
    with $Provider<DoctorProfileRepository> {
  DoctorProfileRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'doctorProfileRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$doctorProfileRepositoryHash();

  @$internal
  @override
  $ProviderElement<DoctorProfileRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  DoctorProfileRepository create(Ref ref) {
    return doctorProfileRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DoctorProfileRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DoctorProfileRepository>(value),
    );
  }
}

String _$doctorProfileRepositoryHash() =>
    r'3f3594f6a24de735f35d2113726c1e6492016c31';

@ProviderFor(doctorAccount)
final doctorAccountProvider = DoctorAccountProvider._();

final class DoctorAccountProvider
    extends
        $FunctionalProvider<
          AsyncValue<DoctorAccount>,
          DoctorAccount,
          FutureOr<DoctorAccount>
        >
    with $FutureModifier<DoctorAccount>, $FutureProvider<DoctorAccount> {
  DoctorAccountProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'doctorAccountProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$doctorAccountHash();

  @$internal
  @override
  $FutureProviderElement<DoctorAccount> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<DoctorAccount> create(Ref ref) {
    return doctorAccount(ref);
  }
}

String _$doctorAccountHash() => r'20e6b8360cd9b7b414306bae07dfbcb1d630e3f3';
