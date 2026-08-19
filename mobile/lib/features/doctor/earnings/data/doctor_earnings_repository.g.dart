// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'doctor_earnings_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(doctorEarningsRepository)
final doctorEarningsRepositoryProvider = DoctorEarningsRepositoryProvider._();

final class DoctorEarningsRepositoryProvider
    extends
        $FunctionalProvider<
          DoctorEarningsRepository,
          DoctorEarningsRepository,
          DoctorEarningsRepository
        >
    with $Provider<DoctorEarningsRepository> {
  DoctorEarningsRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'doctorEarningsRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$doctorEarningsRepositoryHash();

  @$internal
  @override
  $ProviderElement<DoctorEarningsRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  DoctorEarningsRepository create(Ref ref) {
    return doctorEarningsRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DoctorEarningsRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DoctorEarningsRepository>(value),
    );
  }
}

String _$doctorEarningsRepositoryHash() =>
    r'0ae05ec81438d2883b1166fe59ebeecf074ad3e6';

@ProviderFor(doctorSettlementsList)
final doctorSettlementsListProvider = DoctorSettlementsListProvider._();

final class DoctorSettlementsListProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<Settlement>>,
          List<Settlement>,
          FutureOr<List<Settlement>>
        >
    with $FutureModifier<List<Settlement>>, $FutureProvider<List<Settlement>> {
  DoctorSettlementsListProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'doctorSettlementsListProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$doctorSettlementsListHash();

  @$internal
  @override
  $FutureProviderElement<List<Settlement>> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<List<Settlement>> create(Ref ref) {
    return doctorSettlementsList(ref);
  }
}

String _$doctorSettlementsListHash() =>
    r'4a1d215691c4d12dc6768ce91db4c8869ea065a0';
