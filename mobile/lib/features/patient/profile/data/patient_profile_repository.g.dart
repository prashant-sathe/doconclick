// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patient_profile_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(patientProfileRepository)
final patientProfileRepositoryProvider = PatientProfileRepositoryProvider._();

final class PatientProfileRepositoryProvider
    extends
        $FunctionalProvider<
          PatientProfileRepository,
          PatientProfileRepository,
          PatientProfileRepository
        >
    with $Provider<PatientProfileRepository> {
  PatientProfileRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'patientProfileRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$patientProfileRepositoryHash();

  @$internal
  @override
  $ProviderElement<PatientProfileRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  PatientProfileRepository create(Ref ref) {
    return patientProfileRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PatientProfileRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PatientProfileRepository>(value),
    );
  }
}

String _$patientProfileRepositoryHash() =>
    r'fef0559b8d267eea7e4dc66da83f6ce586810b98';

@ProviderFor(patientAccount)
final patientAccountProvider = PatientAccountProvider._();

final class PatientAccountProvider
    extends
        $FunctionalProvider<
          AsyncValue<PatientAccount>,
          PatientAccount,
          FutureOr<PatientAccount>
        >
    with $FutureModifier<PatientAccount>, $FutureProvider<PatientAccount> {
  PatientAccountProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'patientAccountProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$patientAccountHash();

  @$internal
  @override
  $FutureProviderElement<PatientAccount> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<PatientAccount> create(Ref ref) {
    return patientAccount(ref);
  }
}

String _$patientAccountHash() => r'5da71d1317955ec331a6f7c00d066f0f689d24a6';
