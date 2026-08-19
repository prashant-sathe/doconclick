// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'location_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Best-effort current position — returns null on denied/unavailable rather
/// than throwing, since doctor discovery must still work without it
/// (falls back to showing all doctors unsorted, same as the web when geo
/// permission isn't granted).

@ProviderFor(currentPosition)
final currentPositionProvider = CurrentPositionProvider._();

/// Best-effort current position — returns null on denied/unavailable rather
/// than throwing, since doctor discovery must still work without it
/// (falls back to showing all doctors unsorted, same as the web when geo
/// permission isn't granted).

final class CurrentPositionProvider
    extends
        $FunctionalProvider<
          AsyncValue<Position?>,
          Position?,
          FutureOr<Position?>
        >
    with $FutureModifier<Position?>, $FutureProvider<Position?> {
  /// Best-effort current position — returns null on denied/unavailable rather
  /// than throwing, since doctor discovery must still work without it
  /// (falls back to showing all doctors unsorted, same as the web when geo
  /// permission isn't granted).
  CurrentPositionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'currentPositionProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$currentPositionHash();

  @$internal
  @override
  $FutureProviderElement<Position?> $createElement($ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<Position?> create(Ref ref) {
    return currentPosition(ref);
  }
}

String _$currentPositionHash() => r'e0c7b5f8ca9dac35873a5b1a3e6fe4335e37c459';
