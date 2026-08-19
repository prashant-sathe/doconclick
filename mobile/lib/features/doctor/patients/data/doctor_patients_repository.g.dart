// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'doctor_patients_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(doctorPatientsRepository)
final doctorPatientsRepositoryProvider = DoctorPatientsRepositoryProvider._();

final class DoctorPatientsRepositoryProvider
    extends
        $FunctionalProvider<
          DoctorPatientsRepository,
          DoctorPatientsRepository,
          DoctorPatientsRepository
        >
    with $Provider<DoctorPatientsRepository> {
  DoctorPatientsRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'doctorPatientsRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$doctorPatientsRepositoryHash();

  @$internal
  @override
  $ProviderElement<DoctorPatientsRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  DoctorPatientsRepository create(Ref ref) {
    return doctorPatientsRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DoctorPatientsRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DoctorPatientsRepository>(value),
    );
  }
}

String _$doctorPatientsRepositoryHash() =>
    r'b7d90abb84134e7174cade09c657bae678d88791';
