// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'specialty.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Specialty {

 String get name; String get color;
/// Create a copy of Specialty
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SpecialtyCopyWith<Specialty> get copyWith => _$SpecialtyCopyWithImpl<Specialty>(this as Specialty, _$identity);

  /// Serializes this Specialty to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Specialty&&(identical(other.name, name) || other.name == name)&&(identical(other.color, color) || other.color == color));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name,color);

@override
String toString() {
  return 'Specialty(name: $name, color: $color)';
}


}

/// @nodoc
abstract mixin class $SpecialtyCopyWith<$Res>  {
  factory $SpecialtyCopyWith(Specialty value, $Res Function(Specialty) _then) = _$SpecialtyCopyWithImpl;
@useResult
$Res call({
 String name, String color
});




}
/// @nodoc
class _$SpecialtyCopyWithImpl<$Res>
    implements $SpecialtyCopyWith<$Res> {
  _$SpecialtyCopyWithImpl(this._self, this._then);

  final Specialty _self;
  final $Res Function(Specialty) _then;

/// Create a copy of Specialty
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? name = null,Object? color = null,}) {
  return _then(Specialty(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,color: null == color ? _self.color : color // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [Specialty].
extension SpecialtyPatterns on Specialty {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Specialty value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Specialty() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Specialty value)  $default,){
final _that = this;
switch (_that) {
case _Specialty():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Specialty value)?  $default,){
final _that = this;
switch (_that) {
case _Specialty() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String name,  String color)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Specialty() when $default != null:
return $default(_that.name,_that.color);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String name,  String color)  $default,) {final _that = this;
switch (_that) {
case _Specialty():
return $default(_that.name,_that.color);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String name,  String color)?  $default,) {final _that = this;
switch (_that) {
case _Specialty() when $default != null:
return $default(_that.name,_that.color);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Specialty implements Specialty {
  const _Specialty({required this.name, required this.color});
  factory _Specialty.fromJson(Map<String, dynamic> json) => _$SpecialtyFromJson(json);

@override final  String name;
@override final  String color;

/// Create a copy of Specialty
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SpecialtyCopyWith<_Specialty> get copyWith => __$SpecialtyCopyWithImpl<_Specialty>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SpecialtyToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Specialty&&(identical(other.name, name) || other.name == name)&&(identical(other.color, color) || other.color == color));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name,color);

@override
String toString() {
  return 'Specialty(name: $name, color: $color)';
}


}

/// @nodoc
abstract mixin class _$SpecialtyCopyWith<$Res> implements $SpecialtyCopyWith<$Res> {
  factory _$SpecialtyCopyWith(_Specialty value, $Res Function(_Specialty) _then) = __$SpecialtyCopyWithImpl;
@override @useResult
$Res call({
 String name, String color
});




}
/// @nodoc
class __$SpecialtyCopyWithImpl<$Res>
    implements _$SpecialtyCopyWith<$Res> {
  __$SpecialtyCopyWithImpl(this._self, this._then);

  final _Specialty _self;
  final $Res Function(_Specialty) _then;

/// Create a copy of Specialty
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? name = null,Object? color = null,}) {
  return _then(_Specialty(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,color: null == color ? _self.color : color // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

// dart format on
