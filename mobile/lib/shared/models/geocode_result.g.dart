// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'geocode_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_GeocodeResult _$GeocodeResultFromJson(Map<String, dynamic> json) =>
    _GeocodeResult(
      id: (json['id'] as num).toInt(),
      label: json['label'] as String,
      lat: (json['lat'] as num).toDouble(),
      lon: (json['lon'] as num).toDouble(),
    );

Map<String, dynamic> _$GeocodeResultToJson(_GeocodeResult instance) =>
    <String, dynamic>{
      'id': instance.id,
      'label': instance.label,
      'lat': instance.lat,
      'lon': instance.lon,
    };
