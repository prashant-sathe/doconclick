// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'doctor_payments_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(doctorPaymentsRepository)
final doctorPaymentsRepositoryProvider = DoctorPaymentsRepositoryProvider._();

final class DoctorPaymentsRepositoryProvider
    extends
        $FunctionalProvider<
          DoctorPaymentsRepository,
          DoctorPaymentsRepository,
          DoctorPaymentsRepository
        >
    with $Provider<DoctorPaymentsRepository> {
  DoctorPaymentsRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'doctorPaymentsRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$doctorPaymentsRepositoryHash();

  @$internal
  @override
  $ProviderElement<DoctorPaymentsRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  DoctorPaymentsRepository create(Ref ref) {
    return doctorPaymentsRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DoctorPaymentsRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DoctorPaymentsRepository>(value),
    );
  }
}

String _$doctorPaymentsRepositoryHash() =>
    r'600502eda343d3d46df4dbecce941dd20beb1222';
