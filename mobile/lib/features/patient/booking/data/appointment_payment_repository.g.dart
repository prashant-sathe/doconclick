// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'appointment_payment_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(appointmentPaymentRepository)
final appointmentPaymentRepositoryProvider =
    AppointmentPaymentRepositoryProvider._();

final class AppointmentPaymentRepositoryProvider
    extends
        $FunctionalProvider<
          AppointmentPaymentRepository,
          AppointmentPaymentRepository,
          AppointmentPaymentRepository
        >
    with $Provider<AppointmentPaymentRepository> {
  AppointmentPaymentRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'appointmentPaymentRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$appointmentPaymentRepositoryHash();

  @$internal
  @override
  $ProviderElement<AppointmentPaymentRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  AppointmentPaymentRepository create(Ref ref) {
    return appointmentPaymentRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(AppointmentPaymentRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<AppointmentPaymentRepository>(value),
    );
  }
}

String _$appointmentPaymentRepositoryHash() =>
    r'87aea23f4dd64a8d18b27e86efcd5e7fff3481d4';
