// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dependents_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(dependentsRepository)
final dependentsRepositoryProvider = DependentsRepositoryProvider._();

final class DependentsRepositoryProvider
    extends
        $FunctionalProvider<
          DependentsRepository,
          DependentsRepository,
          DependentsRepository
        >
    with $Provider<DependentsRepository> {
  DependentsRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'dependentsRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$dependentsRepositoryHash();

  @$internal
  @override
  $ProviderElement<DependentsRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  DependentsRepository create(Ref ref) {
    return dependentsRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DependentsRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DependentsRepository>(value),
    );
  }
}

String _$dependentsRepositoryHash() =>
    r'fc830e745836d79d82b04ac7926dd48612978fbd';

@ProviderFor(dependentsList)
final dependentsListProvider = DependentsListProvider._();

final class DependentsListProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<PatientDependent>>,
          List<PatientDependent>,
          FutureOr<List<PatientDependent>>
        >
    with
        $FutureModifier<List<PatientDependent>>,
        $FutureProvider<List<PatientDependent>> {
  DependentsListProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'dependentsListProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$dependentsListHash();

  @$internal
  @override
  $FutureProviderElement<List<PatientDependent>> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<List<PatientDependent>> create(Ref ref) {
    return dependentsList(ref);
  }
}

String _$dependentsListHash() => r'862d437909f7c67fa35a258576329435a5670825';
