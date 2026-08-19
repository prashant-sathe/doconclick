// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'patient_dependent.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PatientDependent {

 String get id; String get patientProfileId; String get name; String get relation; int? get age; String? get gender; String? get bloodGroup; int? get height; int? get weight; String? get allergies; String? get chronicDiseases; String? get medications; String? get surgeries; String? get emergencyContactName; String? get emergencyContactPhone;
/// Create a copy of PatientDependent
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PatientDependentCopyWith<PatientDependent> get copyWith => _$PatientDependentCopyWithImpl<PatientDependent>(this as PatientDependent, _$identity);

  /// Serializes this PatientDependent to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PatientDependent&&(identical(other.id, id) || other.id == id)&&(identical(other.patientProfileId, patientProfileId) || other.patientProfileId == patientProfileId)&&(identical(other.name, name) || other.name == name)&&(identical(other.relation, relation) || other.relation == relation)&&(identical(other.age, age) || other.age == age)&&(identical(other.gender, gender) || other.gender == gender)&&(identical(other.bloodGroup, bloodGroup) || other.bloodGroup == bloodGroup)&&(identical(other.height, height) || other.height == height)&&(identical(other.weight, weight) || other.weight == weight)&&(identical(other.allergies, allergies) || other.allergies == allergies)&&(identical(other.chronicDiseases, chronicDiseases) || other.chronicDiseases == chronicDiseases)&&(identical(other.medications, medications) || other.medications == medications)&&(identical(other.surgeries, surgeries) || other.surgeries == surgeries)&&(identical(other.emergencyContactName, emergencyContactName) || other.emergencyContactName == emergencyContactName)&&(identical(other.emergencyContactPhone, emergencyContactPhone) || other.emergencyContactPhone == emergencyContactPhone));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,patientProfileId,name,relation,age,gender,bloodGroup,height,weight,allergies,chronicDiseases,medications,surgeries,emergencyContactName,emergencyContactPhone);

@override
String toString() {
  return 'PatientDependent(id: $id, patientProfileId: $patientProfileId, name: $name, relation: $relation, age: $age, gender: $gender, bloodGroup: $bloodGroup, height: $height, weight: $weight, allergies: $allergies, chronicDiseases: $chronicDiseases, medications: $medications, surgeries: $surgeries, emergencyContactName: $emergencyContactName, emergencyContactPhone: $emergencyContactPhone)';
}


}

/// @nodoc
abstract mixin class $PatientDependentCopyWith<$Res>  {
  factory $PatientDependentCopyWith(PatientDependent value, $Res Function(PatientDependent) _then) = _$PatientDependentCopyWithImpl;
@useResult
$Res call({
 String id, String patientProfileId, String name, String relation, int? age, String? gender, String? bloodGroup, int? height, int? weight, String? allergies, String? chronicDiseases, String? medications, String? surgeries, String? emergencyContactName, String? emergencyContactPhone
});




}
/// @nodoc
class _$PatientDependentCopyWithImpl<$Res>
    implements $PatientDependentCopyWith<$Res> {
  _$PatientDependentCopyWithImpl(this._self, this._then);

  final PatientDependent _self;
  final $Res Function(PatientDependent) _then;

/// Create a copy of PatientDependent
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? patientProfileId = null,Object? name = null,Object? relation = null,Object? age = freezed,Object? gender = freezed,Object? bloodGroup = freezed,Object? height = freezed,Object? weight = freezed,Object? allergies = freezed,Object? chronicDiseases = freezed,Object? medications = freezed,Object? surgeries = freezed,Object? emergencyContactName = freezed,Object? emergencyContactPhone = freezed,}) {
  return _then(PatientDependent(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,patientProfileId: null == patientProfileId ? _self.patientProfileId : patientProfileId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,relation: null == relation ? _self.relation : relation // ignore: cast_nullable_to_non_nullable
as String,age: freezed == age ? _self.age : age // ignore: cast_nullable_to_non_nullable
as int?,gender: freezed == gender ? _self.gender : gender // ignore: cast_nullable_to_non_nullable
as String?,bloodGroup: freezed == bloodGroup ? _self.bloodGroup : bloodGroup // ignore: cast_nullable_to_non_nullable
as String?,height: freezed == height ? _self.height : height // ignore: cast_nullable_to_non_nullable
as int?,weight: freezed == weight ? _self.weight : weight // ignore: cast_nullable_to_non_nullable
as int?,allergies: freezed == allergies ? _self.allergies : allergies // ignore: cast_nullable_to_non_nullable
as String?,chronicDiseases: freezed == chronicDiseases ? _self.chronicDiseases : chronicDiseases // ignore: cast_nullable_to_non_nullable
as String?,medications: freezed == medications ? _self.medications : medications // ignore: cast_nullable_to_non_nullable
as String?,surgeries: freezed == surgeries ? _self.surgeries : surgeries // ignore: cast_nullable_to_non_nullable
as String?,emergencyContactName: freezed == emergencyContactName ? _self.emergencyContactName : emergencyContactName // ignore: cast_nullable_to_non_nullable
as String?,emergencyContactPhone: freezed == emergencyContactPhone ? _self.emergencyContactPhone : emergencyContactPhone // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [PatientDependent].
extension PatientDependentPatterns on PatientDependent {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PatientDependent value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PatientDependent() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PatientDependent value)  $default,){
final _that = this;
switch (_that) {
case _PatientDependent():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PatientDependent value)?  $default,){
final _that = this;
switch (_that) {
case _PatientDependent() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String patientProfileId,  String name,  String relation,  int? age,  String? gender,  String? bloodGroup,  int? height,  int? weight,  String? allergies,  String? chronicDiseases,  String? medications,  String? surgeries,  String? emergencyContactName,  String? emergencyContactPhone)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PatientDependent() when $default != null:
return $default(_that.id,_that.patientProfileId,_that.name,_that.relation,_that.age,_that.gender,_that.bloodGroup,_that.height,_that.weight,_that.allergies,_that.chronicDiseases,_that.medications,_that.surgeries,_that.emergencyContactName,_that.emergencyContactPhone);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String patientProfileId,  String name,  String relation,  int? age,  String? gender,  String? bloodGroup,  int? height,  int? weight,  String? allergies,  String? chronicDiseases,  String? medications,  String? surgeries,  String? emergencyContactName,  String? emergencyContactPhone)  $default,) {final _that = this;
switch (_that) {
case _PatientDependent():
return $default(_that.id,_that.patientProfileId,_that.name,_that.relation,_that.age,_that.gender,_that.bloodGroup,_that.height,_that.weight,_that.allergies,_that.chronicDiseases,_that.medications,_that.surgeries,_that.emergencyContactName,_that.emergencyContactPhone);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String patientProfileId,  String name,  String relation,  int? age,  String? gender,  String? bloodGroup,  int? height,  int? weight,  String? allergies,  String? chronicDiseases,  String? medications,  String? surgeries,  String? emergencyContactName,  String? emergencyContactPhone)?  $default,) {final _that = this;
switch (_that) {
case _PatientDependent() when $default != null:
return $default(_that.id,_that.patientProfileId,_that.name,_that.relation,_that.age,_that.gender,_that.bloodGroup,_that.height,_that.weight,_that.allergies,_that.chronicDiseases,_that.medications,_that.surgeries,_that.emergencyContactName,_that.emergencyContactPhone);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PatientDependent implements PatientDependent {
  const _PatientDependent({required this.id, required this.patientProfileId, required this.name, required this.relation, this.age, this.gender, this.bloodGroup, this.height, this.weight, this.allergies, this.chronicDiseases, this.medications, this.surgeries, this.emergencyContactName, this.emergencyContactPhone});
  factory _PatientDependent.fromJson(Map<String, dynamic> json) => _$PatientDependentFromJson(json);

@override final  String id;
@override final  String patientProfileId;
@override final  String name;
@override final  String relation;
@override final  int? age;
@override final  String? gender;
@override final  String? bloodGroup;
@override final  int? height;
@override final  int? weight;
@override final  String? allergies;
@override final  String? chronicDiseases;
@override final  String? medications;
@override final  String? surgeries;
@override final  String? emergencyContactName;
@override final  String? emergencyContactPhone;

/// Create a copy of PatientDependent
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PatientDependentCopyWith<_PatientDependent> get copyWith => __$PatientDependentCopyWithImpl<_PatientDependent>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PatientDependentToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PatientDependent&&(identical(other.id, id) || other.id == id)&&(identical(other.patientProfileId, patientProfileId) || other.patientProfileId == patientProfileId)&&(identical(other.name, name) || other.name == name)&&(identical(other.relation, relation) || other.relation == relation)&&(identical(other.age, age) || other.age == age)&&(identical(other.gender, gender) || other.gender == gender)&&(identical(other.bloodGroup, bloodGroup) || other.bloodGroup == bloodGroup)&&(identical(other.height, height) || other.height == height)&&(identical(other.weight, weight) || other.weight == weight)&&(identical(other.allergies, allergies) || other.allergies == allergies)&&(identical(other.chronicDiseases, chronicDiseases) || other.chronicDiseases == chronicDiseases)&&(identical(other.medications, medications) || other.medications == medications)&&(identical(other.surgeries, surgeries) || other.surgeries == surgeries)&&(identical(other.emergencyContactName, emergencyContactName) || other.emergencyContactName == emergencyContactName)&&(identical(other.emergencyContactPhone, emergencyContactPhone) || other.emergencyContactPhone == emergencyContactPhone));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,patientProfileId,name,relation,age,gender,bloodGroup,height,weight,allergies,chronicDiseases,medications,surgeries,emergencyContactName,emergencyContactPhone);

@override
String toString() {
  return 'PatientDependent(id: $id, patientProfileId: $patientProfileId, name: $name, relation: $relation, age: $age, gender: $gender, bloodGroup: $bloodGroup, height: $height, weight: $weight, allergies: $allergies, chronicDiseases: $chronicDiseases, medications: $medications, surgeries: $surgeries, emergencyContactName: $emergencyContactName, emergencyContactPhone: $emergencyContactPhone)';
}


}

/// @nodoc
abstract mixin class _$PatientDependentCopyWith<$Res> implements $PatientDependentCopyWith<$Res> {
  factory _$PatientDependentCopyWith(_PatientDependent value, $Res Function(_PatientDependent) _then) = __$PatientDependentCopyWithImpl;
@override @useResult
$Res call({
 String id, String patientProfileId, String name, String relation, int? age, String? gender, String? bloodGroup, int? height, int? weight, String? allergies, String? chronicDiseases, String? medications, String? surgeries, String? emergencyContactName, String? emergencyContactPhone
});




}
/// @nodoc
class __$PatientDependentCopyWithImpl<$Res>
    implements _$PatientDependentCopyWith<$Res> {
  __$PatientDependentCopyWithImpl(this._self, this._then);

  final _PatientDependent _self;
  final $Res Function(_PatientDependent) _then;

/// Create a copy of PatientDependent
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? patientProfileId = null,Object? name = null,Object? relation = null,Object? age = freezed,Object? gender = freezed,Object? bloodGroup = freezed,Object? height = freezed,Object? weight = freezed,Object? allergies = freezed,Object? chronicDiseases = freezed,Object? medications = freezed,Object? surgeries = freezed,Object? emergencyContactName = freezed,Object? emergencyContactPhone = freezed,}) {
  return _then(_PatientDependent(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,patientProfileId: null == patientProfileId ? _self.patientProfileId : patientProfileId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,relation: null == relation ? _self.relation : relation // ignore: cast_nullable_to_non_nullable
as String,age: freezed == age ? _self.age : age // ignore: cast_nullable_to_non_nullable
as int?,gender: freezed == gender ? _self.gender : gender // ignore: cast_nullable_to_non_nullable
as String?,bloodGroup: freezed == bloodGroup ? _self.bloodGroup : bloodGroup // ignore: cast_nullable_to_non_nullable
as String?,height: freezed == height ? _self.height : height // ignore: cast_nullable_to_non_nullable
as int?,weight: freezed == weight ? _self.weight : weight // ignore: cast_nullable_to_non_nullable
as int?,allergies: freezed == allergies ? _self.allergies : allergies // ignore: cast_nullable_to_non_nullable
as String?,chronicDiseases: freezed == chronicDiseases ? _self.chronicDiseases : chronicDiseases // ignore: cast_nullable_to_non_nullable
as String?,medications: freezed == medications ? _self.medications : medications // ignore: cast_nullable_to_non_nullable
as String?,surgeries: freezed == surgeries ? _self.surgeries : surgeries // ignore: cast_nullable_to_non_nullable
as String?,emergencyContactName: freezed == emergencyContactName ? _self.emergencyContactName : emergencyContactName // ignore: cast_nullable_to_non_nullable
as String?,emergencyContactPhone: freezed == emergencyContactPhone ? _self.emergencyContactPhone : emergencyContactPhone // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
