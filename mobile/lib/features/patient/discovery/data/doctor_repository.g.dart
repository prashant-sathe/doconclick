// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'doctor_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(doctorRepository)
final doctorRepositoryProvider = DoctorRepositoryProvider._();

final class DoctorRepositoryProvider
    extends
        $FunctionalProvider<
          DoctorRepository,
          DoctorRepository,
          DoctorRepository
        >
    with $Provider<DoctorRepository> {
  DoctorRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'doctorRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$doctorRepositoryHash();

  @$internal
  @override
  $ProviderElement<DoctorRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DoctorRepository create(Ref ref) {
    return doctorRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DoctorRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DoctorRepository>(value),
    );
  }
}

String _$doctorRepositoryHash() => r'1eff3982481338cb8af44c1fcf84ca0ac5558d7e';

@ProviderFor(doctorList)
final doctorListProvider = DoctorListFamily._();

final class DoctorListProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<Doctor>>,
          List<Doctor>,
          FutureOr<List<Doctor>>
        >
    with $FutureModifier<List<Doctor>>, $FutureProvider<List<Doctor>> {
  DoctorListProvider._({
    required DoctorListFamily super.from,
    required String? super.argument,
  }) : super(
         retry: null,
         name: r'doctorListProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$doctorListHash();

  @override
  String toString() {
    return r'doctorListProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<List<Doctor>> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<List<Doctor>> create(Ref ref) {
    final argument = this.argument as String?;
    return doctorList(ref, specialty: argument);
  }

  @override
  bool operator ==(Object other) {
    return other is DoctorListProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$doctorListHash() => r'3e40438cd359e377765865569e856cae0dffb8d8';

final class DoctorListFamily extends $Family
    with $FunctionalFamilyOverride<FutureOr<List<Doctor>>, String?> {
  DoctorListFamily._()
    : super(
        retry: null,
        name: r'doctorListProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  DoctorListProvider call({String? specialty}) =>
      DoctorListProvider._(argument: specialty, from: this);

  @override
  String toString() => r'doctorListProvider';
}

@ProviderFor(doctorDetail)
final doctorDetailProvider = DoctorDetailFamily._();

final class DoctorDetailProvider
    extends $FunctionalProvider<AsyncValue<Doctor>, Doctor, FutureOr<Doctor>>
    with $FutureModifier<Doctor>, $FutureProvider<Doctor> {
  DoctorDetailProvider._({
    required DoctorDetailFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'doctorDetailProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$doctorDetailHash();

  @override
  String toString() {
    return r'doctorDetailProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<Doctor> $createElement($ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<Doctor> create(Ref ref) {
    final argument = this.argument as String;
    return doctorDetail(ref, argument);
  }

  @override
  bool operator ==(Object other) {
    return other is DoctorDetailProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$doctorDetailHash() => r'a7c808123edf6fb6a816583e4191ed4c7d2f7140';

final class DoctorDetailFamily extends $Family
    with $FunctionalFamilyOverride<FutureOr<Doctor>, String> {
  DoctorDetailFamily._()
    : super(
        retry: null,
        name: r'doctorDetailProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  DoctorDetailProvider call(String id) =>
      DoctorDetailProvider._(argument: id, from: this);

  @override
  String toString() => r'doctorDetailProvider';
}

@ProviderFor(specialtyList)
final specialtyListProvider = SpecialtyListProvider._();

final class SpecialtyListProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<Specialty>>,
          List<Specialty>,
          FutureOr<List<Specialty>>
        >
    with $FutureModifier<List<Specialty>>, $FutureProvider<List<Specialty>> {
  SpecialtyListProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'specialtyListProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$specialtyListHash();

  @$internal
  @override
  $FutureProviderElement<List<Specialty>> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<List<Specialty>> create(Ref ref) {
    return specialtyList(ref);
  }
}

String _$specialtyListHash() => r'de60524d10111427e0c3f92a8923d7eee79aee5b';
