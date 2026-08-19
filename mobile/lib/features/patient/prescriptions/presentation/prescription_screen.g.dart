// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'prescription_screen.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(prescriptionDetail)
final prescriptionDetailProvider = PrescriptionDetailFamily._();

final class PrescriptionDetailProvider
    extends
        $FunctionalProvider<
          AsyncValue<PrescriptionDetail>,
          PrescriptionDetail,
          FutureOr<PrescriptionDetail>
        >
    with
        $FutureModifier<PrescriptionDetail>,
        $FutureProvider<PrescriptionDetail> {
  PrescriptionDetailProvider._({
    required PrescriptionDetailFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'prescriptionDetailProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$prescriptionDetailHash();

  @override
  String toString() {
    return r'prescriptionDetailProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<PrescriptionDetail> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<PrescriptionDetail> create(Ref ref) {
    final argument = this.argument as String;
    return prescriptionDetail(ref, argument);
  }

  @override
  bool operator ==(Object other) {
    return other is PrescriptionDetailProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$prescriptionDetailHash() =>
    r'91ab780ea220c81798d8514a2cc7f943853b4eb2';

final class PrescriptionDetailFamily extends $Family
    with $FunctionalFamilyOverride<FutureOr<PrescriptionDetail>, String> {
  PrescriptionDetailFamily._()
    : super(
        retry: null,
        name: r'prescriptionDetailProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  PrescriptionDetailProvider call(String appointmentId) =>
      PrescriptionDetailProvider._(argument: appointmentId, from: this);

  @override
  String toString() => r'prescriptionDetailProvider';
}
