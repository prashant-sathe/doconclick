// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'doctor_appointments_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(doctorAppointmentsRepository)
final doctorAppointmentsRepositoryProvider =
    DoctorAppointmentsRepositoryProvider._();

final class DoctorAppointmentsRepositoryProvider
    extends
        $FunctionalProvider<
          DoctorAppointmentsRepository,
          DoctorAppointmentsRepository,
          DoctorAppointmentsRepository
        >
    with $Provider<DoctorAppointmentsRepository> {
  DoctorAppointmentsRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'doctorAppointmentsRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$doctorAppointmentsRepositoryHash();

  @$internal
  @override
  $ProviderElement<DoctorAppointmentsRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  DoctorAppointmentsRepository create(Ref ref) {
    return doctorAppointmentsRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DoctorAppointmentsRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DoctorAppointmentsRepository>(value),
    );
  }
}

String _$doctorAppointmentsRepositoryHash() =>
    r'30a635de84581e42c00cda559b6c38e416cc746c';

/// Polls every 5s, matching the web's doctor/dashboard interval.

@ProviderFor(doctorAppointmentsList)
final doctorAppointmentsListProvider = DoctorAppointmentsListProvider._();

/// Polls every 5s, matching the web's doctor/dashboard interval.

final class DoctorAppointmentsListProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<Appointment>>,
          List<Appointment>,
          Stream<List<Appointment>>
        >
    with
        $FutureModifier<List<Appointment>>,
        $StreamProvider<List<Appointment>> {
  /// Polls every 5s, matching the web's doctor/dashboard interval.
  DoctorAppointmentsListProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'doctorAppointmentsListProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$doctorAppointmentsListHash();

  @$internal
  @override
  $StreamProviderElement<List<Appointment>> $createElement(
    $ProviderPointer pointer,
  ) => $StreamProviderElement(pointer);

  @override
  Stream<List<Appointment>> create(Ref ref) {
    return doctorAppointmentsList(ref);
  }
}

String _$doctorAppointmentsListHash() =>
    r'b42abf4e8554c3c75160c076389a52f2f55f976a';
