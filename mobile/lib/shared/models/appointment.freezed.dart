// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'appointment.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$DoctorRefProfile {

 String? get specialty; String? get photoUrl;
/// Create a copy of DoctorRefProfile
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DoctorRefProfileCopyWith<DoctorRefProfile> get copyWith => _$DoctorRefProfileCopyWithImpl<DoctorRefProfile>(this as DoctorRefProfile, _$identity);

  /// Serializes this DoctorRefProfile to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DoctorRefProfile&&(identical(other.specialty, specialty) || other.specialty == specialty)&&(identical(other.photoUrl, photoUrl) || other.photoUrl == photoUrl));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,specialty,photoUrl);

@override
String toString() {
  return 'DoctorRefProfile(specialty: $specialty, photoUrl: $photoUrl)';
}


}

/// @nodoc
abstract mixin class $DoctorRefProfileCopyWith<$Res>  {
  factory $DoctorRefProfileCopyWith(DoctorRefProfile value, $Res Function(DoctorRefProfile) _then) = _$DoctorRefProfileCopyWithImpl;
@useResult
$Res call({
 String? specialty, String? photoUrl
});




}
/// @nodoc
class _$DoctorRefProfileCopyWithImpl<$Res>
    implements $DoctorRefProfileCopyWith<$Res> {
  _$DoctorRefProfileCopyWithImpl(this._self, this._then);

  final DoctorRefProfile _self;
  final $Res Function(DoctorRefProfile) _then;

/// Create a copy of DoctorRefProfile
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? specialty = freezed,Object? photoUrl = freezed,}) {
  return _then(DoctorRefProfile(
specialty: freezed == specialty ? _self.specialty : specialty // ignore: cast_nullable_to_non_nullable
as String?,photoUrl: freezed == photoUrl ? _self.photoUrl : photoUrl // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [DoctorRefProfile].
extension DoctorRefProfilePatterns on DoctorRefProfile {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DoctorRefProfile value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DoctorRefProfile() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DoctorRefProfile value)  $default,){
final _that = this;
switch (_that) {
case _DoctorRefProfile():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DoctorRefProfile value)?  $default,){
final _that = this;
switch (_that) {
case _DoctorRefProfile() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? specialty,  String? photoUrl)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DoctorRefProfile() when $default != null:
return $default(_that.specialty,_that.photoUrl);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? specialty,  String? photoUrl)  $default,) {final _that = this;
switch (_that) {
case _DoctorRefProfile():
return $default(_that.specialty,_that.photoUrl);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? specialty,  String? photoUrl)?  $default,) {final _that = this;
switch (_that) {
case _DoctorRefProfile() when $default != null:
return $default(_that.specialty,_that.photoUrl);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DoctorRefProfile implements DoctorRefProfile {
  const _DoctorRefProfile({this.specialty, this.photoUrl});
  factory _DoctorRefProfile.fromJson(Map<String, dynamic> json) => _$DoctorRefProfileFromJson(json);

@override final  String? specialty;
@override final  String? photoUrl;

/// Create a copy of DoctorRefProfile
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DoctorRefProfileCopyWith<_DoctorRefProfile> get copyWith => __$DoctorRefProfileCopyWithImpl<_DoctorRefProfile>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DoctorRefProfileToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DoctorRefProfile&&(identical(other.specialty, specialty) || other.specialty == specialty)&&(identical(other.photoUrl, photoUrl) || other.photoUrl == photoUrl));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,specialty,photoUrl);

@override
String toString() {
  return 'DoctorRefProfile(specialty: $specialty, photoUrl: $photoUrl)';
}


}

/// @nodoc
abstract mixin class _$DoctorRefProfileCopyWith<$Res> implements $DoctorRefProfileCopyWith<$Res> {
  factory _$DoctorRefProfileCopyWith(_DoctorRefProfile value, $Res Function(_DoctorRefProfile) _then) = __$DoctorRefProfileCopyWithImpl;
@override @useResult
$Res call({
 String? specialty, String? photoUrl
});




}
/// @nodoc
class __$DoctorRefProfileCopyWithImpl<$Res>
    implements _$DoctorRefProfileCopyWith<$Res> {
  __$DoctorRefProfileCopyWithImpl(this._self, this._then);

  final _DoctorRefProfile _self;
  final $Res Function(_DoctorRefProfile) _then;

/// Create a copy of DoctorRefProfile
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? specialty = freezed,Object? photoUrl = freezed,}) {
  return _then(_DoctorRefProfile(
specialty: freezed == specialty ? _self.specialty : specialty // ignore: cast_nullable_to_non_nullable
as String?,photoUrl: freezed == photoUrl ? _self.photoUrl : photoUrl // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$DoctorRef {

 String get name; DoctorRefProfile? get doctorProfile;
/// Create a copy of DoctorRef
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DoctorRefCopyWith<DoctorRef> get copyWith => _$DoctorRefCopyWithImpl<DoctorRef>(this as DoctorRef, _$identity);

  /// Serializes this DoctorRef to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DoctorRef&&(identical(other.name, name) || other.name == name)&&(identical(other.doctorProfile, doctorProfile) || other.doctorProfile == doctorProfile));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name,doctorProfile);

@override
String toString() {
  return 'DoctorRef(name: $name, doctorProfile: $doctorProfile)';
}


}

/// @nodoc
abstract mixin class $DoctorRefCopyWith<$Res>  {
  factory $DoctorRefCopyWith(DoctorRef value, $Res Function(DoctorRef) _then) = _$DoctorRefCopyWithImpl;
@useResult
$Res call({
 String name, DoctorRefProfile? doctorProfile
});


$DoctorRefProfileCopyWith<$Res>? get doctorProfile;

}
/// @nodoc
class _$DoctorRefCopyWithImpl<$Res>
    implements $DoctorRefCopyWith<$Res> {
  _$DoctorRefCopyWithImpl(this._self, this._then);

  final DoctorRef _self;
  final $Res Function(DoctorRef) _then;

/// Create a copy of DoctorRef
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? name = null,Object? doctorProfile = freezed,}) {
  return _then(DoctorRef(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,doctorProfile: freezed == doctorProfile ? _self.doctorProfile : doctorProfile // ignore: cast_nullable_to_non_nullable
as DoctorRefProfile?,
  ));
}
/// Create a copy of DoctorRef
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DoctorRefProfileCopyWith<$Res>? get doctorProfile {
    if (_self.doctorProfile == null) {
    return null;
  }

  return $DoctorRefProfileCopyWith<$Res>(_self.doctorProfile!, (value) {
    return _then(_self.copyWith(doctorProfile: value));
  });
}
}


/// Adds pattern-matching-related methods to [DoctorRef].
extension DoctorRefPatterns on DoctorRef {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DoctorRef value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DoctorRef() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DoctorRef value)  $default,){
final _that = this;
switch (_that) {
case _DoctorRef():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DoctorRef value)?  $default,){
final _that = this;
switch (_that) {
case _DoctorRef() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String name,  DoctorRefProfile? doctorProfile)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DoctorRef() when $default != null:
return $default(_that.name,_that.doctorProfile);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String name,  DoctorRefProfile? doctorProfile)  $default,) {final _that = this;
switch (_that) {
case _DoctorRef():
return $default(_that.name,_that.doctorProfile);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String name,  DoctorRefProfile? doctorProfile)?  $default,) {final _that = this;
switch (_that) {
case _DoctorRef() when $default != null:
return $default(_that.name,_that.doctorProfile);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DoctorRef implements DoctorRef {
  const _DoctorRef({required this.name, this.doctorProfile});
  factory _DoctorRef.fromJson(Map<String, dynamic> json) => _$DoctorRefFromJson(json);

@override final  String name;
@override final  DoctorRefProfile? doctorProfile;

/// Create a copy of DoctorRef
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DoctorRefCopyWith<_DoctorRef> get copyWith => __$DoctorRefCopyWithImpl<_DoctorRef>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DoctorRefToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DoctorRef&&(identical(other.name, name) || other.name == name)&&(identical(other.doctorProfile, doctorProfile) || other.doctorProfile == doctorProfile));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name,doctorProfile);

@override
String toString() {
  return 'DoctorRef(name: $name, doctorProfile: $doctorProfile)';
}


}

/// @nodoc
abstract mixin class _$DoctorRefCopyWith<$Res> implements $DoctorRefCopyWith<$Res> {
  factory _$DoctorRefCopyWith(_DoctorRef value, $Res Function(_DoctorRef) _then) = __$DoctorRefCopyWithImpl;
@override @useResult
$Res call({
 String name, DoctorRefProfile? doctorProfile
});


@override $DoctorRefProfileCopyWith<$Res>? get doctorProfile;

}
/// @nodoc
class __$DoctorRefCopyWithImpl<$Res>
    implements _$DoctorRefCopyWith<$Res> {
  __$DoctorRefCopyWithImpl(this._self, this._then);

  final _DoctorRef _self;
  final $Res Function(_DoctorRef) _then;

/// Create a copy of DoctorRef
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? name = null,Object? doctorProfile = freezed,}) {
  return _then(_DoctorRef(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,doctorProfile: freezed == doctorProfile ? _self.doctorProfile : doctorProfile // ignore: cast_nullable_to_non_nullable
as DoctorRefProfile?,
  ));
}

/// Create a copy of DoctorRef
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DoctorRefProfileCopyWith<$Res>? get doctorProfile {
    if (_self.doctorProfile == null) {
    return null;
  }

  return $DoctorRefProfileCopyWith<$Res>(_self.doctorProfile!, (value) {
    return _then(_self.copyWith(doctorProfile: value));
  });
}
}


/// @nodoc
mixin _$PatientRefProfile {

 double? get lat; double? get lng; String? get homeAddress;
/// Create a copy of PatientRefProfile
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PatientRefProfileCopyWith<PatientRefProfile> get copyWith => _$PatientRefProfileCopyWithImpl<PatientRefProfile>(this as PatientRefProfile, _$identity);

  /// Serializes this PatientRefProfile to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PatientRefProfile&&(identical(other.lat, lat) || other.lat == lat)&&(identical(other.lng, lng) || other.lng == lng)&&(identical(other.homeAddress, homeAddress) || other.homeAddress == homeAddress));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,lat,lng,homeAddress);

@override
String toString() {
  return 'PatientRefProfile(lat: $lat, lng: $lng, homeAddress: $homeAddress)';
}


}

/// @nodoc
abstract mixin class $PatientRefProfileCopyWith<$Res>  {
  factory $PatientRefProfileCopyWith(PatientRefProfile value, $Res Function(PatientRefProfile) _then) = _$PatientRefProfileCopyWithImpl;
@useResult
$Res call({
 double? lat, double? lng, String? homeAddress
});




}
/// @nodoc
class _$PatientRefProfileCopyWithImpl<$Res>
    implements $PatientRefProfileCopyWith<$Res> {
  _$PatientRefProfileCopyWithImpl(this._self, this._then);

  final PatientRefProfile _self;
  final $Res Function(PatientRefProfile) _then;

/// Create a copy of PatientRefProfile
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? lat = freezed,Object? lng = freezed,Object? homeAddress = freezed,}) {
  return _then(PatientRefProfile(
lat: freezed == lat ? _self.lat : lat // ignore: cast_nullable_to_non_nullable
as double?,lng: freezed == lng ? _self.lng : lng // ignore: cast_nullable_to_non_nullable
as double?,homeAddress: freezed == homeAddress ? _self.homeAddress : homeAddress // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [PatientRefProfile].
extension PatientRefProfilePatterns on PatientRefProfile {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PatientRefProfile value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PatientRefProfile() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PatientRefProfile value)  $default,){
final _that = this;
switch (_that) {
case _PatientRefProfile():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PatientRefProfile value)?  $default,){
final _that = this;
switch (_that) {
case _PatientRefProfile() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double? lat,  double? lng,  String? homeAddress)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PatientRefProfile() when $default != null:
return $default(_that.lat,_that.lng,_that.homeAddress);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double? lat,  double? lng,  String? homeAddress)  $default,) {final _that = this;
switch (_that) {
case _PatientRefProfile():
return $default(_that.lat,_that.lng,_that.homeAddress);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double? lat,  double? lng,  String? homeAddress)?  $default,) {final _that = this;
switch (_that) {
case _PatientRefProfile() when $default != null:
return $default(_that.lat,_that.lng,_that.homeAddress);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PatientRefProfile implements PatientRefProfile {
  const _PatientRefProfile({this.lat, this.lng, this.homeAddress});
  factory _PatientRefProfile.fromJson(Map<String, dynamic> json) => _$PatientRefProfileFromJson(json);

@override final  double? lat;
@override final  double? lng;
@override final  String? homeAddress;

/// Create a copy of PatientRefProfile
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PatientRefProfileCopyWith<_PatientRefProfile> get copyWith => __$PatientRefProfileCopyWithImpl<_PatientRefProfile>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PatientRefProfileToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PatientRefProfile&&(identical(other.lat, lat) || other.lat == lat)&&(identical(other.lng, lng) || other.lng == lng)&&(identical(other.homeAddress, homeAddress) || other.homeAddress == homeAddress));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,lat,lng,homeAddress);

@override
String toString() {
  return 'PatientRefProfile(lat: $lat, lng: $lng, homeAddress: $homeAddress)';
}


}

/// @nodoc
abstract mixin class _$PatientRefProfileCopyWith<$Res> implements $PatientRefProfileCopyWith<$Res> {
  factory _$PatientRefProfileCopyWith(_PatientRefProfile value, $Res Function(_PatientRefProfile) _then) = __$PatientRefProfileCopyWithImpl;
@override @useResult
$Res call({
 double? lat, double? lng, String? homeAddress
});




}
/// @nodoc
class __$PatientRefProfileCopyWithImpl<$Res>
    implements _$PatientRefProfileCopyWith<$Res> {
  __$PatientRefProfileCopyWithImpl(this._self, this._then);

  final _PatientRefProfile _self;
  final $Res Function(_PatientRefProfile) _then;

/// Create a copy of PatientRefProfile
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? lat = freezed,Object? lng = freezed,Object? homeAddress = freezed,}) {
  return _then(_PatientRefProfile(
lat: freezed == lat ? _self.lat : lat // ignore: cast_nullable_to_non_nullable
as double?,lng: freezed == lng ? _self.lng : lng // ignore: cast_nullable_to_non_nullable
as double?,homeAddress: freezed == homeAddress ? _self.homeAddress : homeAddress // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$PatientRef {

 String get name; String? get mobile; PatientRefProfile? get patientProfile;
/// Create a copy of PatientRef
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PatientRefCopyWith<PatientRef> get copyWith => _$PatientRefCopyWithImpl<PatientRef>(this as PatientRef, _$identity);

  /// Serializes this PatientRef to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PatientRef&&(identical(other.name, name) || other.name == name)&&(identical(other.mobile, mobile) || other.mobile == mobile)&&(identical(other.patientProfile, patientProfile) || other.patientProfile == patientProfile));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name,mobile,patientProfile);

@override
String toString() {
  return 'PatientRef(name: $name, mobile: $mobile, patientProfile: $patientProfile)';
}


}

/// @nodoc
abstract mixin class $PatientRefCopyWith<$Res>  {
  factory $PatientRefCopyWith(PatientRef value, $Res Function(PatientRef) _then) = _$PatientRefCopyWithImpl;
@useResult
$Res call({
 String name, String? mobile, PatientRefProfile? patientProfile
});


$PatientRefProfileCopyWith<$Res>? get patientProfile;

}
/// @nodoc
class _$PatientRefCopyWithImpl<$Res>
    implements $PatientRefCopyWith<$Res> {
  _$PatientRefCopyWithImpl(this._self, this._then);

  final PatientRef _self;
  final $Res Function(PatientRef) _then;

/// Create a copy of PatientRef
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? name = null,Object? mobile = freezed,Object? patientProfile = freezed,}) {
  return _then(PatientRef(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,mobile: freezed == mobile ? _self.mobile : mobile // ignore: cast_nullable_to_non_nullable
as String?,patientProfile: freezed == patientProfile ? _self.patientProfile : patientProfile // ignore: cast_nullable_to_non_nullable
as PatientRefProfile?,
  ));
}
/// Create a copy of PatientRef
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PatientRefProfileCopyWith<$Res>? get patientProfile {
    if (_self.patientProfile == null) {
    return null;
  }

  return $PatientRefProfileCopyWith<$Res>(_self.patientProfile!, (value) {
    return _then(_self.copyWith(patientProfile: value));
  });
}
}


/// Adds pattern-matching-related methods to [PatientRef].
extension PatientRefPatterns on PatientRef {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PatientRef value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PatientRef() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PatientRef value)  $default,){
final _that = this;
switch (_that) {
case _PatientRef():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PatientRef value)?  $default,){
final _that = this;
switch (_that) {
case _PatientRef() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String name,  String? mobile,  PatientRefProfile? patientProfile)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PatientRef() when $default != null:
return $default(_that.name,_that.mobile,_that.patientProfile);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String name,  String? mobile,  PatientRefProfile? patientProfile)  $default,) {final _that = this;
switch (_that) {
case _PatientRef():
return $default(_that.name,_that.mobile,_that.patientProfile);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String name,  String? mobile,  PatientRefProfile? patientProfile)?  $default,) {final _that = this;
switch (_that) {
case _PatientRef() when $default != null:
return $default(_that.name,_that.mobile,_that.patientProfile);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PatientRef implements PatientRef {
  const _PatientRef({required this.name, this.mobile, this.patientProfile});
  factory _PatientRef.fromJson(Map<String, dynamic> json) => _$PatientRefFromJson(json);

@override final  String name;
@override final  String? mobile;
@override final  PatientRefProfile? patientProfile;

/// Create a copy of PatientRef
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PatientRefCopyWith<_PatientRef> get copyWith => __$PatientRefCopyWithImpl<_PatientRef>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PatientRefToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PatientRef&&(identical(other.name, name) || other.name == name)&&(identical(other.mobile, mobile) || other.mobile == mobile)&&(identical(other.patientProfile, patientProfile) || other.patientProfile == patientProfile));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name,mobile,patientProfile);

@override
String toString() {
  return 'PatientRef(name: $name, mobile: $mobile, patientProfile: $patientProfile)';
}


}

/// @nodoc
abstract mixin class _$PatientRefCopyWith<$Res> implements $PatientRefCopyWith<$Res> {
  factory _$PatientRefCopyWith(_PatientRef value, $Res Function(_PatientRef) _then) = __$PatientRefCopyWithImpl;
@override @useResult
$Res call({
 String name, String? mobile, PatientRefProfile? patientProfile
});


@override $PatientRefProfileCopyWith<$Res>? get patientProfile;

}
/// @nodoc
class __$PatientRefCopyWithImpl<$Res>
    implements _$PatientRefCopyWith<$Res> {
  __$PatientRefCopyWithImpl(this._self, this._then);

  final _PatientRef _self;
  final $Res Function(_PatientRef) _then;

/// Create a copy of PatientRef
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? name = null,Object? mobile = freezed,Object? patientProfile = freezed,}) {
  return _then(_PatientRef(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,mobile: freezed == mobile ? _self.mobile : mobile // ignore: cast_nullable_to_non_nullable
as String?,patientProfile: freezed == patientProfile ? _self.patientProfile : patientProfile // ignore: cast_nullable_to_non_nullable
as PatientRefProfile?,
  ));
}

/// Create a copy of PatientRef
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PatientRefProfileCopyWith<$Res>? get patientProfile {
    if (_self.patientProfile == null) {
    return null;
  }

  return $PatientRefProfileCopyWith<$Res>(_self.patientProfile!, (value) {
    return _then(_self.copyWith(patientProfile: value));
  });
}
}


/// @nodoc
mixin _$Appointment {

 String get id; String get patientId; String get doctorId; String get symptoms; String? get patientName; String get relation; String? get allergies; String? get dependentId; bool get consentGiven; String get consultType; String get status; String get paymentMethod; String get paymentStatus; bool get isEmergency; double get amount; double get platformFee; String? get doctorNotes; String get travelStatus; String? get otpCode; DateTime? get otpVerifiedAt; DateTime? get completedAt; double? get doctorLat; double? get doctorLng; DateTime? get doctorLocationUpdatedAt; String? get followUpOfId; DateTime get scheduledAt; DateTime get createdAt; PatientRef? get patient; DoctorRef? get doctor; Review? get review; List<PrescriptionMedicine> get medicines; List<PrescriptionAttachment> get attachments; int get unreadMessageCount;
/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AppointmentCopyWith<Appointment> get copyWith => _$AppointmentCopyWithImpl<Appointment>(this as Appointment, _$identity);

  /// Serializes this Appointment to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Appointment&&(identical(other.id, id) || other.id == id)&&(identical(other.patientId, patientId) || other.patientId == patientId)&&(identical(other.doctorId, doctorId) || other.doctorId == doctorId)&&(identical(other.symptoms, symptoms) || other.symptoms == symptoms)&&(identical(other.patientName, patientName) || other.patientName == patientName)&&(identical(other.relation, relation) || other.relation == relation)&&(identical(other.allergies, allergies) || other.allergies == allergies)&&(identical(other.dependentId, dependentId) || other.dependentId == dependentId)&&(identical(other.consentGiven, consentGiven) || other.consentGiven == consentGiven)&&(identical(other.consultType, consultType) || other.consultType == consultType)&&(identical(other.status, status) || other.status == status)&&(identical(other.paymentMethod, paymentMethod) || other.paymentMethod == paymentMethod)&&(identical(other.paymentStatus, paymentStatus) || other.paymentStatus == paymentStatus)&&(identical(other.isEmergency, isEmergency) || other.isEmergency == isEmergency)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.platformFee, platformFee) || other.platformFee == platformFee)&&(identical(other.doctorNotes, doctorNotes) || other.doctorNotes == doctorNotes)&&(identical(other.travelStatus, travelStatus) || other.travelStatus == travelStatus)&&(identical(other.otpCode, otpCode) || other.otpCode == otpCode)&&(identical(other.otpVerifiedAt, otpVerifiedAt) || other.otpVerifiedAt == otpVerifiedAt)&&(identical(other.completedAt, completedAt) || other.completedAt == completedAt)&&(identical(other.doctorLat, doctorLat) || other.doctorLat == doctorLat)&&(identical(other.doctorLng, doctorLng) || other.doctorLng == doctorLng)&&(identical(other.doctorLocationUpdatedAt, doctorLocationUpdatedAt) || other.doctorLocationUpdatedAt == doctorLocationUpdatedAt)&&(identical(other.followUpOfId, followUpOfId) || other.followUpOfId == followUpOfId)&&(identical(other.scheduledAt, scheduledAt) || other.scheduledAt == scheduledAt)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.patient, patient) || other.patient == patient)&&(identical(other.doctor, doctor) || other.doctor == doctor)&&(identical(other.review, review) || other.review == review)&&const DeepCollectionEquality().equals(other.medicines, medicines)&&const DeepCollectionEquality().equals(other.attachments, attachments)&&(identical(other.unreadMessageCount, unreadMessageCount) || other.unreadMessageCount == unreadMessageCount));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,patientId,doctorId,symptoms,patientName,relation,allergies,dependentId,consentGiven,consultType,status,paymentMethod,paymentStatus,isEmergency,amount,platformFee,doctorNotes,travelStatus,otpCode,otpVerifiedAt,completedAt,doctorLat,doctorLng,doctorLocationUpdatedAt,followUpOfId,scheduledAt,createdAt,patient,doctor,review,const DeepCollectionEquality().hash(medicines),const DeepCollectionEquality().hash(attachments),unreadMessageCount]);

@override
String toString() {
  return 'Appointment(id: $id, patientId: $patientId, doctorId: $doctorId, symptoms: $symptoms, patientName: $patientName, relation: $relation, allergies: $allergies, dependentId: $dependentId, consentGiven: $consentGiven, consultType: $consultType, status: $status, paymentMethod: $paymentMethod, paymentStatus: $paymentStatus, isEmergency: $isEmergency, amount: $amount, platformFee: $platformFee, doctorNotes: $doctorNotes, travelStatus: $travelStatus, otpCode: $otpCode, otpVerifiedAt: $otpVerifiedAt, completedAt: $completedAt, doctorLat: $doctorLat, doctorLng: $doctorLng, doctorLocationUpdatedAt: $doctorLocationUpdatedAt, followUpOfId: $followUpOfId, scheduledAt: $scheduledAt, createdAt: $createdAt, patient: $patient, doctor: $doctor, review: $review, medicines: $medicines, attachments: $attachments, unreadMessageCount: $unreadMessageCount)';
}


}

/// @nodoc
abstract mixin class $AppointmentCopyWith<$Res>  {
  factory $AppointmentCopyWith(Appointment value, $Res Function(Appointment) _then) = _$AppointmentCopyWithImpl;
@useResult
$Res call({
 String id, String patientId, String doctorId, String symptoms, String? patientName, String relation, String? allergies, String? dependentId, bool consentGiven, String consultType, String status, String paymentMethod, String paymentStatus, bool isEmergency, double amount, double platformFee, String? doctorNotes, String travelStatus, String? otpCode, DateTime? otpVerifiedAt, DateTime? completedAt, double? doctorLat, double? doctorLng, DateTime? doctorLocationUpdatedAt, String? followUpOfId, DateTime scheduledAt, DateTime createdAt, PatientRef? patient, DoctorRef? doctor, Review? review, List<PrescriptionMedicine> medicines, List<PrescriptionAttachment> attachments, int unreadMessageCount
});


$PatientRefCopyWith<$Res>? get patient;$DoctorRefCopyWith<$Res>? get doctor;$ReviewCopyWith<$Res>? get review;

}
/// @nodoc
class _$AppointmentCopyWithImpl<$Res>
    implements $AppointmentCopyWith<$Res> {
  _$AppointmentCopyWithImpl(this._self, this._then);

  final Appointment _self;
  final $Res Function(Appointment) _then;

/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? patientId = null,Object? doctorId = null,Object? symptoms = null,Object? patientName = freezed,Object? relation = null,Object? allergies = freezed,Object? dependentId = freezed,Object? consentGiven = null,Object? consultType = null,Object? status = null,Object? paymentMethod = null,Object? paymentStatus = null,Object? isEmergency = null,Object? amount = null,Object? platformFee = null,Object? doctorNotes = freezed,Object? travelStatus = null,Object? otpCode = freezed,Object? otpVerifiedAt = freezed,Object? completedAt = freezed,Object? doctorLat = freezed,Object? doctorLng = freezed,Object? doctorLocationUpdatedAt = freezed,Object? followUpOfId = freezed,Object? scheduledAt = null,Object? createdAt = null,Object? patient = freezed,Object? doctor = freezed,Object? review = freezed,Object? medicines = null,Object? attachments = null,Object? unreadMessageCount = null,}) {
  return _then(Appointment(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,patientId: null == patientId ? _self.patientId : patientId // ignore: cast_nullable_to_non_nullable
as String,doctorId: null == doctorId ? _self.doctorId : doctorId // ignore: cast_nullable_to_non_nullable
as String,symptoms: null == symptoms ? _self.symptoms : symptoms // ignore: cast_nullable_to_non_nullable
as String,patientName: freezed == patientName ? _self.patientName : patientName // ignore: cast_nullable_to_non_nullable
as String?,relation: null == relation ? _self.relation : relation // ignore: cast_nullable_to_non_nullable
as String,allergies: freezed == allergies ? _self.allergies : allergies // ignore: cast_nullable_to_non_nullable
as String?,dependentId: freezed == dependentId ? _self.dependentId : dependentId // ignore: cast_nullable_to_non_nullable
as String?,consentGiven: null == consentGiven ? _self.consentGiven : consentGiven // ignore: cast_nullable_to_non_nullable
as bool,consultType: null == consultType ? _self.consultType : consultType // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,paymentMethod: null == paymentMethod ? _self.paymentMethod : paymentMethod // ignore: cast_nullable_to_non_nullable
as String,paymentStatus: null == paymentStatus ? _self.paymentStatus : paymentStatus // ignore: cast_nullable_to_non_nullable
as String,isEmergency: null == isEmergency ? _self.isEmergency : isEmergency // ignore: cast_nullable_to_non_nullable
as bool,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,platformFee: null == platformFee ? _self.platformFee : platformFee // ignore: cast_nullable_to_non_nullable
as double,doctorNotes: freezed == doctorNotes ? _self.doctorNotes : doctorNotes // ignore: cast_nullable_to_non_nullable
as String?,travelStatus: null == travelStatus ? _self.travelStatus : travelStatus // ignore: cast_nullable_to_non_nullable
as String,otpCode: freezed == otpCode ? _self.otpCode : otpCode // ignore: cast_nullable_to_non_nullable
as String?,otpVerifiedAt: freezed == otpVerifiedAt ? _self.otpVerifiedAt : otpVerifiedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,completedAt: freezed == completedAt ? _self.completedAt : completedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,doctorLat: freezed == doctorLat ? _self.doctorLat : doctorLat // ignore: cast_nullable_to_non_nullable
as double?,doctorLng: freezed == doctorLng ? _self.doctorLng : doctorLng // ignore: cast_nullable_to_non_nullable
as double?,doctorLocationUpdatedAt: freezed == doctorLocationUpdatedAt ? _self.doctorLocationUpdatedAt : doctorLocationUpdatedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,followUpOfId: freezed == followUpOfId ? _self.followUpOfId : followUpOfId // ignore: cast_nullable_to_non_nullable
as String?,scheduledAt: null == scheduledAt ? _self.scheduledAt : scheduledAt // ignore: cast_nullable_to_non_nullable
as DateTime,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,patient: freezed == patient ? _self.patient : patient // ignore: cast_nullable_to_non_nullable
as PatientRef?,doctor: freezed == doctor ? _self.doctor : doctor // ignore: cast_nullable_to_non_nullable
as DoctorRef?,review: freezed == review ? _self.review : review // ignore: cast_nullable_to_non_nullable
as Review?,medicines: null == medicines ? _self.medicines : medicines // ignore: cast_nullable_to_non_nullable
as List<PrescriptionMedicine>,attachments: null == attachments ? _self.attachments : attachments // ignore: cast_nullable_to_non_nullable
as List<PrescriptionAttachment>,unreadMessageCount: null == unreadMessageCount ? _self.unreadMessageCount : unreadMessageCount // ignore: cast_nullable_to_non_nullable
as int,
  ));
}
/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PatientRefCopyWith<$Res>? get patient {
    if (_self.patient == null) {
    return null;
  }

  return $PatientRefCopyWith<$Res>(_self.patient!, (value) {
    return _then(_self.copyWith(patient: value));
  });
}/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DoctorRefCopyWith<$Res>? get doctor {
    if (_self.doctor == null) {
    return null;
  }

  return $DoctorRefCopyWith<$Res>(_self.doctor!, (value) {
    return _then(_self.copyWith(doctor: value));
  });
}/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ReviewCopyWith<$Res>? get review {
    if (_self.review == null) {
    return null;
  }

  return $ReviewCopyWith<$Res>(_self.review!, (value) {
    return _then(_self.copyWith(review: value));
  });
}
}


/// Adds pattern-matching-related methods to [Appointment].
extension AppointmentPatterns on Appointment {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Appointment value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Appointment() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Appointment value)  $default,){
final _that = this;
switch (_that) {
case _Appointment():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Appointment value)?  $default,){
final _that = this;
switch (_that) {
case _Appointment() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String patientId,  String doctorId,  String symptoms,  String? patientName,  String relation,  String? allergies,  String? dependentId,  bool consentGiven,  String consultType,  String status,  String paymentMethod,  String paymentStatus,  bool isEmergency,  double amount,  double platformFee,  String? doctorNotes,  String travelStatus,  String? otpCode,  DateTime? otpVerifiedAt,  DateTime? completedAt,  double? doctorLat,  double? doctorLng,  DateTime? doctorLocationUpdatedAt,  String? followUpOfId,  DateTime scheduledAt,  DateTime createdAt,  PatientRef? patient,  DoctorRef? doctor,  Review? review,  List<PrescriptionMedicine> medicines,  List<PrescriptionAttachment> attachments,  int unreadMessageCount)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Appointment() when $default != null:
return $default(_that.id,_that.patientId,_that.doctorId,_that.symptoms,_that.patientName,_that.relation,_that.allergies,_that.dependentId,_that.consentGiven,_that.consultType,_that.status,_that.paymentMethod,_that.paymentStatus,_that.isEmergency,_that.amount,_that.platformFee,_that.doctorNotes,_that.travelStatus,_that.otpCode,_that.otpVerifiedAt,_that.completedAt,_that.doctorLat,_that.doctorLng,_that.doctorLocationUpdatedAt,_that.followUpOfId,_that.scheduledAt,_that.createdAt,_that.patient,_that.doctor,_that.review,_that.medicines,_that.attachments,_that.unreadMessageCount);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String patientId,  String doctorId,  String symptoms,  String? patientName,  String relation,  String? allergies,  String? dependentId,  bool consentGiven,  String consultType,  String status,  String paymentMethod,  String paymentStatus,  bool isEmergency,  double amount,  double platformFee,  String? doctorNotes,  String travelStatus,  String? otpCode,  DateTime? otpVerifiedAt,  DateTime? completedAt,  double? doctorLat,  double? doctorLng,  DateTime? doctorLocationUpdatedAt,  String? followUpOfId,  DateTime scheduledAt,  DateTime createdAt,  PatientRef? patient,  DoctorRef? doctor,  Review? review,  List<PrescriptionMedicine> medicines,  List<PrescriptionAttachment> attachments,  int unreadMessageCount)  $default,) {final _that = this;
switch (_that) {
case _Appointment():
return $default(_that.id,_that.patientId,_that.doctorId,_that.symptoms,_that.patientName,_that.relation,_that.allergies,_that.dependentId,_that.consentGiven,_that.consultType,_that.status,_that.paymentMethod,_that.paymentStatus,_that.isEmergency,_that.amount,_that.platformFee,_that.doctorNotes,_that.travelStatus,_that.otpCode,_that.otpVerifiedAt,_that.completedAt,_that.doctorLat,_that.doctorLng,_that.doctorLocationUpdatedAt,_that.followUpOfId,_that.scheduledAt,_that.createdAt,_that.patient,_that.doctor,_that.review,_that.medicines,_that.attachments,_that.unreadMessageCount);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String patientId,  String doctorId,  String symptoms,  String? patientName,  String relation,  String? allergies,  String? dependentId,  bool consentGiven,  String consultType,  String status,  String paymentMethod,  String paymentStatus,  bool isEmergency,  double amount,  double platformFee,  String? doctorNotes,  String travelStatus,  String? otpCode,  DateTime? otpVerifiedAt,  DateTime? completedAt,  double? doctorLat,  double? doctorLng,  DateTime? doctorLocationUpdatedAt,  String? followUpOfId,  DateTime scheduledAt,  DateTime createdAt,  PatientRef? patient,  DoctorRef? doctor,  Review? review,  List<PrescriptionMedicine> medicines,  List<PrescriptionAttachment> attachments,  int unreadMessageCount)?  $default,) {final _that = this;
switch (_that) {
case _Appointment() when $default != null:
return $default(_that.id,_that.patientId,_that.doctorId,_that.symptoms,_that.patientName,_that.relation,_that.allergies,_that.dependentId,_that.consentGiven,_that.consultType,_that.status,_that.paymentMethod,_that.paymentStatus,_that.isEmergency,_that.amount,_that.platformFee,_that.doctorNotes,_that.travelStatus,_that.otpCode,_that.otpVerifiedAt,_that.completedAt,_that.doctorLat,_that.doctorLng,_that.doctorLocationUpdatedAt,_that.followUpOfId,_that.scheduledAt,_that.createdAt,_that.patient,_that.doctor,_that.review,_that.medicines,_that.attachments,_that.unreadMessageCount);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Appointment implements Appointment {
  const _Appointment({required this.id, required this.patientId, required this.doctorId, required this.symptoms, this.patientName, this.relation = 'Self', this.allergies, this.dependentId, this.consentGiven = false, this.consultType = 'CLINIC', this.status = 'PENDING_APPROVAL', this.paymentMethod = 'CASH', this.paymentStatus = 'PENDING', this.isEmergency = false, this.amount = 0, this.platformFee = 0, this.doctorNotes, this.travelStatus = 'NOT_STARTED', this.otpCode, this.otpVerifiedAt, this.completedAt, this.doctorLat, this.doctorLng, this.doctorLocationUpdatedAt, this.followUpOfId, required this.scheduledAt, required this.createdAt, this.patient, this.doctor, this.review,  List<PrescriptionMedicine> medicines = const [],  List<PrescriptionAttachment> attachments = const [], this.unreadMessageCount = 0}): _medicines = medicines,_attachments = attachments;
  factory _Appointment.fromJson(Map<String, dynamic> json) => _$AppointmentFromJson(json);

@override final  String id;
@override final  String patientId;
@override final  String doctorId;
@override final  String symptoms;
@override final  String? patientName;
@override@JsonKey() final  String relation;
@override final  String? allergies;
@override final  String? dependentId;
@override@JsonKey() final  bool consentGiven;
@override@JsonKey() final  String consultType;
@override@JsonKey() final  String status;
@override@JsonKey() final  String paymentMethod;
@override@JsonKey() final  String paymentStatus;
@override@JsonKey() final  bool isEmergency;
@override@JsonKey() final  double amount;
@override@JsonKey() final  double platformFee;
@override final  String? doctorNotes;
@override@JsonKey() final  String travelStatus;
@override final  String? otpCode;
@override final  DateTime? otpVerifiedAt;
@override final  DateTime? completedAt;
@override final  double? doctorLat;
@override final  double? doctorLng;
@override final  DateTime? doctorLocationUpdatedAt;
@override final  String? followUpOfId;
@override final  DateTime scheduledAt;
@override final  DateTime createdAt;
@override final  PatientRef? patient;
@override final  DoctorRef? doctor;
@override final  Review? review;
 final  List<PrescriptionMedicine> _medicines;
@override@JsonKey() List<PrescriptionMedicine> get medicines {
  if (_medicines is EqualUnmodifiableListView) return _medicines;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_medicines);
}

 final  List<PrescriptionAttachment> _attachments;
@override@JsonKey() List<PrescriptionAttachment> get attachments {
  if (_attachments is EqualUnmodifiableListView) return _attachments;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_attachments);
}

@override@JsonKey() final  int unreadMessageCount;

/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AppointmentCopyWith<_Appointment> get copyWith => __$AppointmentCopyWithImpl<_Appointment>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AppointmentToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Appointment&&(identical(other.id, id) || other.id == id)&&(identical(other.patientId, patientId) || other.patientId == patientId)&&(identical(other.doctorId, doctorId) || other.doctorId == doctorId)&&(identical(other.symptoms, symptoms) || other.symptoms == symptoms)&&(identical(other.patientName, patientName) || other.patientName == patientName)&&(identical(other.relation, relation) || other.relation == relation)&&(identical(other.allergies, allergies) || other.allergies == allergies)&&(identical(other.dependentId, dependentId) || other.dependentId == dependentId)&&(identical(other.consentGiven, consentGiven) || other.consentGiven == consentGiven)&&(identical(other.consultType, consultType) || other.consultType == consultType)&&(identical(other.status, status) || other.status == status)&&(identical(other.paymentMethod, paymentMethod) || other.paymentMethod == paymentMethod)&&(identical(other.paymentStatus, paymentStatus) || other.paymentStatus == paymentStatus)&&(identical(other.isEmergency, isEmergency) || other.isEmergency == isEmergency)&&(identical(other.amount, amount) || other.amount == amount)&&(identical(other.platformFee, platformFee) || other.platformFee == platformFee)&&(identical(other.doctorNotes, doctorNotes) || other.doctorNotes == doctorNotes)&&(identical(other.travelStatus, travelStatus) || other.travelStatus == travelStatus)&&(identical(other.otpCode, otpCode) || other.otpCode == otpCode)&&(identical(other.otpVerifiedAt, otpVerifiedAt) || other.otpVerifiedAt == otpVerifiedAt)&&(identical(other.completedAt, completedAt) || other.completedAt == completedAt)&&(identical(other.doctorLat, doctorLat) || other.doctorLat == doctorLat)&&(identical(other.doctorLng, doctorLng) || other.doctorLng == doctorLng)&&(identical(other.doctorLocationUpdatedAt, doctorLocationUpdatedAt) || other.doctorLocationUpdatedAt == doctorLocationUpdatedAt)&&(identical(other.followUpOfId, followUpOfId) || other.followUpOfId == followUpOfId)&&(identical(other.scheduledAt, scheduledAt) || other.scheduledAt == scheduledAt)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.patient, patient) || other.patient == patient)&&(identical(other.doctor, doctor) || other.doctor == doctor)&&(identical(other.review, review) || other.review == review)&&const DeepCollectionEquality().equals(other._medicines, _medicines)&&const DeepCollectionEquality().equals(other._attachments, _attachments)&&(identical(other.unreadMessageCount, unreadMessageCount) || other.unreadMessageCount == unreadMessageCount));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,patientId,doctorId,symptoms,patientName,relation,allergies,dependentId,consentGiven,consultType,status,paymentMethod,paymentStatus,isEmergency,amount,platformFee,doctorNotes,travelStatus,otpCode,otpVerifiedAt,completedAt,doctorLat,doctorLng,doctorLocationUpdatedAt,followUpOfId,scheduledAt,createdAt,patient,doctor,review,const DeepCollectionEquality().hash(_medicines),const DeepCollectionEquality().hash(_attachments),unreadMessageCount]);

@override
String toString() {
  return 'Appointment(id: $id, patientId: $patientId, doctorId: $doctorId, symptoms: $symptoms, patientName: $patientName, relation: $relation, allergies: $allergies, dependentId: $dependentId, consentGiven: $consentGiven, consultType: $consultType, status: $status, paymentMethod: $paymentMethod, paymentStatus: $paymentStatus, isEmergency: $isEmergency, amount: $amount, platformFee: $platformFee, doctorNotes: $doctorNotes, travelStatus: $travelStatus, otpCode: $otpCode, otpVerifiedAt: $otpVerifiedAt, completedAt: $completedAt, doctorLat: $doctorLat, doctorLng: $doctorLng, doctorLocationUpdatedAt: $doctorLocationUpdatedAt, followUpOfId: $followUpOfId, scheduledAt: $scheduledAt, createdAt: $createdAt, patient: $patient, doctor: $doctor, review: $review, medicines: $medicines, attachments: $attachments, unreadMessageCount: $unreadMessageCount)';
}


}

/// @nodoc
abstract mixin class _$AppointmentCopyWith<$Res> implements $AppointmentCopyWith<$Res> {
  factory _$AppointmentCopyWith(_Appointment value, $Res Function(_Appointment) _then) = __$AppointmentCopyWithImpl;
@override @useResult
$Res call({
 String id, String patientId, String doctorId, String symptoms, String? patientName, String relation, String? allergies, String? dependentId, bool consentGiven, String consultType, String status, String paymentMethod, String paymentStatus, bool isEmergency, double amount, double platformFee, String? doctorNotes, String travelStatus, String? otpCode, DateTime? otpVerifiedAt, DateTime? completedAt, double? doctorLat, double? doctorLng, DateTime? doctorLocationUpdatedAt, String? followUpOfId, DateTime scheduledAt, DateTime createdAt, PatientRef? patient, DoctorRef? doctor, Review? review, List<PrescriptionMedicine> medicines, List<PrescriptionAttachment> attachments, int unreadMessageCount
});


@override $PatientRefCopyWith<$Res>? get patient;@override $DoctorRefCopyWith<$Res>? get doctor;@override $ReviewCopyWith<$Res>? get review;

}
/// @nodoc
class __$AppointmentCopyWithImpl<$Res>
    implements _$AppointmentCopyWith<$Res> {
  __$AppointmentCopyWithImpl(this._self, this._then);

  final _Appointment _self;
  final $Res Function(_Appointment) _then;

/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? patientId = null,Object? doctorId = null,Object? symptoms = null,Object? patientName = freezed,Object? relation = null,Object? allergies = freezed,Object? dependentId = freezed,Object? consentGiven = null,Object? consultType = null,Object? status = null,Object? paymentMethod = null,Object? paymentStatus = null,Object? isEmergency = null,Object? amount = null,Object? platformFee = null,Object? doctorNotes = freezed,Object? travelStatus = null,Object? otpCode = freezed,Object? otpVerifiedAt = freezed,Object? completedAt = freezed,Object? doctorLat = freezed,Object? doctorLng = freezed,Object? doctorLocationUpdatedAt = freezed,Object? followUpOfId = freezed,Object? scheduledAt = null,Object? createdAt = null,Object? patient = freezed,Object? doctor = freezed,Object? review = freezed,Object? medicines = null,Object? attachments = null,Object? unreadMessageCount = null,}) {
  return _then(_Appointment(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,patientId: null == patientId ? _self.patientId : patientId // ignore: cast_nullable_to_non_nullable
as String,doctorId: null == doctorId ? _self.doctorId : doctorId // ignore: cast_nullable_to_non_nullable
as String,symptoms: null == symptoms ? _self.symptoms : symptoms // ignore: cast_nullable_to_non_nullable
as String,patientName: freezed == patientName ? _self.patientName : patientName // ignore: cast_nullable_to_non_nullable
as String?,relation: null == relation ? _self.relation : relation // ignore: cast_nullable_to_non_nullable
as String,allergies: freezed == allergies ? _self.allergies : allergies // ignore: cast_nullable_to_non_nullable
as String?,dependentId: freezed == dependentId ? _self.dependentId : dependentId // ignore: cast_nullable_to_non_nullable
as String?,consentGiven: null == consentGiven ? _self.consentGiven : consentGiven // ignore: cast_nullable_to_non_nullable
as bool,consultType: null == consultType ? _self.consultType : consultType // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,paymentMethod: null == paymentMethod ? _self.paymentMethod : paymentMethod // ignore: cast_nullable_to_non_nullable
as String,paymentStatus: null == paymentStatus ? _self.paymentStatus : paymentStatus // ignore: cast_nullable_to_non_nullable
as String,isEmergency: null == isEmergency ? _self.isEmergency : isEmergency // ignore: cast_nullable_to_non_nullable
as bool,amount: null == amount ? _self.amount : amount // ignore: cast_nullable_to_non_nullable
as double,platformFee: null == platformFee ? _self.platformFee : platformFee // ignore: cast_nullable_to_non_nullable
as double,doctorNotes: freezed == doctorNotes ? _self.doctorNotes : doctorNotes // ignore: cast_nullable_to_non_nullable
as String?,travelStatus: null == travelStatus ? _self.travelStatus : travelStatus // ignore: cast_nullable_to_non_nullable
as String,otpCode: freezed == otpCode ? _self.otpCode : otpCode // ignore: cast_nullable_to_non_nullable
as String?,otpVerifiedAt: freezed == otpVerifiedAt ? _self.otpVerifiedAt : otpVerifiedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,completedAt: freezed == completedAt ? _self.completedAt : completedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,doctorLat: freezed == doctorLat ? _self.doctorLat : doctorLat // ignore: cast_nullable_to_non_nullable
as double?,doctorLng: freezed == doctorLng ? _self.doctorLng : doctorLng // ignore: cast_nullable_to_non_nullable
as double?,doctorLocationUpdatedAt: freezed == doctorLocationUpdatedAt ? _self.doctorLocationUpdatedAt : doctorLocationUpdatedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,followUpOfId: freezed == followUpOfId ? _self.followUpOfId : followUpOfId // ignore: cast_nullable_to_non_nullable
as String?,scheduledAt: null == scheduledAt ? _self.scheduledAt : scheduledAt // ignore: cast_nullable_to_non_nullable
as DateTime,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,patient: freezed == patient ? _self.patient : patient // ignore: cast_nullable_to_non_nullable
as PatientRef?,doctor: freezed == doctor ? _self.doctor : doctor // ignore: cast_nullable_to_non_nullable
as DoctorRef?,review: freezed == review ? _self.review : review // ignore: cast_nullable_to_non_nullable
as Review?,medicines: null == medicines ? _self._medicines : medicines // ignore: cast_nullable_to_non_nullable
as List<PrescriptionMedicine>,attachments: null == attachments ? _self._attachments : attachments // ignore: cast_nullable_to_non_nullable
as List<PrescriptionAttachment>,unreadMessageCount: null == unreadMessageCount ? _self.unreadMessageCount : unreadMessageCount // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PatientRefCopyWith<$Res>? get patient {
    if (_self.patient == null) {
    return null;
  }

  return $PatientRefCopyWith<$Res>(_self.patient!, (value) {
    return _then(_self.copyWith(patient: value));
  });
}/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DoctorRefCopyWith<$Res>? get doctor {
    if (_self.doctor == null) {
    return null;
  }

  return $DoctorRefCopyWith<$Res>(_self.doctor!, (value) {
    return _then(_self.copyWith(doctor: value));
  });
}/// Create a copy of Appointment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ReviewCopyWith<$Res>? get review {
    if (_self.review == null) {
    return null;
  }

  return $ReviewCopyWith<$Res>(_self.review!, (value) {
    return _then(_self.copyWith(review: value));
  });
}
}

// dart format on
