// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'geocode_result.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$GeocodeResult {

 int get id; String get label; double get lat; double get lon;
/// Create a copy of GeocodeResult
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$GeocodeResultCopyWith<GeocodeResult> get copyWith => _$GeocodeResultCopyWithImpl<GeocodeResult>(this as GeocodeResult, _$identity);

  /// Serializes this GeocodeResult to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is GeocodeResult&&(identical(other.id, id) || other.id == id)&&(identical(other.label, label) || other.label == label)&&(identical(other.lat, lat) || other.lat == lat)&&(identical(other.lon, lon) || other.lon == lon));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,label,lat,lon);

@override
String toString() {
  return 'GeocodeResult(id: $id, label: $label, lat: $lat, lon: $lon)';
}


}

/// @nodoc
abstract mixin class $GeocodeResultCopyWith<$Res>  {
  factory $GeocodeResultCopyWith(GeocodeResult value, $Res Function(GeocodeResult) _then) = _$GeocodeResultCopyWithImpl;
@useResult
$Res call({
 int id, String label, double lat, double lon
});




}
/// @nodoc
class _$GeocodeResultCopyWithImpl<$Res>
    implements $GeocodeResultCopyWith<$Res> {
  _$GeocodeResultCopyWithImpl(this._self, this._then);

  final GeocodeResult _self;
  final $Res Function(GeocodeResult) _then;

/// Create a copy of GeocodeResult
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? label = null,Object? lat = null,Object? lon = null,}) {
  return _then(GeocodeResult(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as int,label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,lat: null == lat ? _self.lat : lat // ignore: cast_nullable_to_non_nullable
as double,lon: null == lon ? _self.lon : lon // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [GeocodeResult].
extension GeocodeResultPatterns on GeocodeResult {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _GeocodeResult value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _GeocodeResult() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _GeocodeResult value)  $default,){
final _that = this;
switch (_that) {
case _GeocodeResult():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _GeocodeResult value)?  $default,){
final _that = this;
switch (_that) {
case _GeocodeResult() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int id,  String label,  double lat,  double lon)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _GeocodeResult() when $default != null:
return $default(_that.id,_that.label,_that.lat,_that.lon);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int id,  String label,  double lat,  double lon)  $default,) {final _that = this;
switch (_that) {
case _GeocodeResult():
return $default(_that.id,_that.label,_that.lat,_that.lon);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int id,  String label,  double lat,  double lon)?  $default,) {final _that = this;
switch (_that) {
case _GeocodeResult() when $default != null:
return $default(_that.id,_that.label,_that.lat,_that.lon);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _GeocodeResult implements GeocodeResult {
  const _GeocodeResult({required this.id, required this.label, required this.lat, required this.lon});
  factory _GeocodeResult.fromJson(Map<String, dynamic> json) => _$GeocodeResultFromJson(json);

@override final  int id;
@override final  String label;
@override final  double lat;
@override final  double lon;

/// Create a copy of GeocodeResult
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$GeocodeResultCopyWith<_GeocodeResult> get copyWith => __$GeocodeResultCopyWithImpl<_GeocodeResult>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$GeocodeResultToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _GeocodeResult&&(identical(other.id, id) || other.id == id)&&(identical(other.label, label) || other.label == label)&&(identical(other.lat, lat) || other.lat == lat)&&(identical(other.lon, lon) || other.lon == lon));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,label,lat,lon);

@override
String toString() {
  return 'GeocodeResult(id: $id, label: $label, lat: $lat, lon: $lon)';
}


}

/// @nodoc
abstract mixin class _$GeocodeResultCopyWith<$Res> implements $GeocodeResultCopyWith<$Res> {
  factory _$GeocodeResultCopyWith(_GeocodeResult value, $Res Function(_GeocodeResult) _then) = __$GeocodeResultCopyWithImpl;
@override @useResult
$Res call({
 int id, String label, double lat, double lon
});




}
/// @nodoc
class __$GeocodeResultCopyWithImpl<$Res>
    implements _$GeocodeResultCopyWith<$Res> {
  __$GeocodeResultCopyWithImpl(this._self, this._then);

  final _GeocodeResult _self;
  final $Res Function(_GeocodeResult) _then;

/// Create a copy of GeocodeResult
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? label = null,Object? lat = null,Object? lon = null,}) {
  return _then(_GeocodeResult(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as int,label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,lat: null == lat ? _self.lat : lat // ignore: cast_nullable_to_non_nullable
as double,lon: null == lon ? _self.lon : lon // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}

// dart format on
