// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patient_appointments_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(patientAppointmentsRepository)
final patientAppointmentsRepositoryProvider =
    PatientAppointmentsRepositoryProvider._();

final class PatientAppointmentsRepositoryProvider
    extends
        $FunctionalProvider<
          PatientAppointmentsRepository,
          PatientAppointmentsRepository,
          PatientAppointmentsRepository
        >
    with $Provider<PatientAppointmentsRepository> {
  PatientAppointmentsRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'patientAppointmentsRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$patientAppointmentsRepositoryHash();

  @$internal
  @override
  $ProviderElement<PatientAppointmentsRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  PatientAppointmentsRepository create(Ref ref) {
    return patientAppointmentsRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PatientAppointmentsRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PatientAppointmentsRepository>(
        value,
      ),
    );
  }
}

String _$patientAppointmentsRepositoryHash() =>
    r'f1d1cdc4eb1fa8831d75225948ef86b4200ef1fe';

/// Polls every 5s, matching the web's usePatientNotifications interval —
/// also what src/app/patient/appointments feeds off for the same live
/// status/notification behavior.

@ProviderFor(patientAppointmentsList)
final patientAppointmentsListProvider = PatientAppointmentsListProvider._();

/// Polls every 5s, matching the web's usePatientNotifications interval —
/// also what src/app/patient/appointments feeds off for the same live
/// status/notification behavior.

final class PatientAppointmentsListProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<Appointment>>,
          List<Appointment>,
          Stream<List<Appointment>>
        >
    with
        $FutureModifier<List<Appointment>>,
        $StreamProvider<List<Appointment>> {
  /// Polls every 5s, matching the web's usePatientNotifications interval —
  /// also what src/app/patient/appointments feeds off for the same live
  /// status/notification behavior.
  PatientAppointmentsListProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'patientAppointmentsListProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$patientAppointmentsListHash();

  @$internal
  @override
  $StreamProviderElement<List<Appointment>> $createElement(
    $ProviderPointer pointer,
  ) => $StreamProviderElement(pointer);

  @override
  Stream<List<Appointment>> create(Ref ref) {
    return patientAppointmentsList(ref);
  }
}

String _$patientAppointmentsListHash() =>
    r'b78ed12afd1177904fc55f3c5ffc2c013636976f';

/// Polls a single appointment every 5s — used for live HOME-visit tracking,
/// matching the web's identical 5s interval (src/app/patient/track/[id]).

@ProviderFor(appointmentPolling)
final appointmentPollingProvider = AppointmentPollingFamily._();

/// Polls a single appointment every 5s — used for live HOME-visit tracking,
/// matching the web's identical 5s interval (src/app/patient/track/[id]).

final class AppointmentPollingProvider
    extends
        $FunctionalProvider<
          AsyncValue<Appointment>,
          Appointment,
          Stream<Appointment>
        >
    with $FutureModifier<Appointment>, $StreamProvider<Appointment> {
  /// Polls a single appointment every 5s — used for live HOME-visit tracking,
  /// matching the web's identical 5s interval (src/app/patient/track/[id]).
  AppointmentPollingProvider._({
    required AppointmentPollingFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'appointmentPollingProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$appointmentPollingHash();

  @override
  String toString() {
    return r'appointmentPollingProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $StreamProviderElement<Appointment> $createElement(
    $ProviderPointer pointer,
  ) => $StreamProviderElement(pointer);

  @override
  Stream<Appointment> create(Ref ref) {
    final argument = this.argument as String;
    return appointmentPolling(ref, argument);
  }

  @override
  bool operator ==(Object other) {
    return other is AppointmentPollingProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$appointmentPollingHash() =>
    r'502d4ae4111456eaea2407f05c29cd32261df5f2';

/// Polls a single appointment every 5s — used for live HOME-visit tracking,
/// matching the web's identical 5s interval (src/app/patient/track/[id]).

final class AppointmentPollingFamily extends $Family
    with $FunctionalFamilyOverride<Stream<Appointment>, String> {
  AppointmentPollingFamily._()
    : super(
        retry: null,
        name: r'appointmentPollingProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// Polls a single appointment every 5s — used for live HOME-visit tracking,
  /// matching the web's identical 5s interval (src/app/patient/track/[id]).

  AppointmentPollingProvider call(String id) =>
      AppointmentPollingProvider._(argument: id, from: this);

  @override
  String toString() => r'appointmentPollingProvider';
}
