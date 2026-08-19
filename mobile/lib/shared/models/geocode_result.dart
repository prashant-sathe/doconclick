import 'package:freezed_annotation/freezed_annotation.dart';

part 'geocode_result.freezed.dart';
part 'geocode_result.g.dart';

/// Mirrors GET /api/geocode/search's mapped Nominatim result shape.
@freezed
abstract class GeocodeResult with _$GeocodeResult {
  const factory GeocodeResult({
    required int id,
    required String label,
    required double lat,
    required double lon,
  }) = _GeocodeResult;

  factory GeocodeResult.fromJson(Map<String, dynamic> json) => _$GeocodeResultFromJson(json);
}
