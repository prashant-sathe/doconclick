// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patient_record_screen.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(patientRecordDetail)
final patientRecordDetailProvider = PatientRecordDetailFamily._();

final class PatientRecordDetailProvider
    extends
        $FunctionalProvider<
          AsyncValue<PatientRecord>,
          PatientRecord,
          FutureOr<PatientRecord>
        >
    with $FutureModifier<PatientRecord>, $FutureProvider<PatientRecord> {
  PatientRecordDetailProvider._({
    required PatientRecordDetailFamily super.from,
    required (String, {String? dependentId}) super.argument,
  }) : super(
         retry: null,
         name: r'patientRecordDetailProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$patientRecordDetailHash();

  @override
  String toString() {
    return r'patientRecordDetailProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  $FutureProviderElement<PatientRecord> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<PatientRecord> create(Ref ref) {
    final argument = this.argument as (String, {String? dependentId});
    return patientRecordDetail(
      ref,
      argument.$1,
      dependentId: argument.dependentId,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is PatientRecordDetailProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$patientRecordDetailHash() =>
    r'ca20f717b8de1311fc7aaba93cc73b622bb39947';

final class PatientRecordDetailFamily extends $Family
    with
        $FunctionalFamilyOverride<
          FutureOr<PatientRecord>,
          (String, {String? dependentId})
        > {
  PatientRecordDetailFamily._()
    : super(
        retry: null,
        name: r'patientRecordDetailProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  PatientRecordDetailProvider call(String patientId, {String? dependentId}) =>
      PatientRecordDetailProvider._(
        argument: (patientId, dependentId: dependentId),
        from: this,
      );

  @override
  String toString() => r'patientRecordDetailProvider';
}
