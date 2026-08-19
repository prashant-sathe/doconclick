// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'patient_record.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PatientRecordPerson {

 String? get id; String get name; String? get mobile; String? get relation; int? get age; String? get gender; String? get bloodGroup; int? get height; int? get weight; String? get allergies; String? get chronicDiseases; String? get medications; String? get surgeries; String? get emergencyContactName; String? get emergencyContactPhone;
/// Create a copy of PatientRecordPerson
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PatientRecordPersonCopyWith<PatientRecordPerson> get copyWith => _$PatientRecordPersonCopyWithImpl<PatientRecordPerson>(this as PatientRecordPerson, _$identity);

  /// Serializes this PatientRecordPerson to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PatientRecordPerson&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.mobile, mobile) || other.mobile == mobile)&&(identical(other.relation, relation) || other.relation == relation)&&(identical(other.age, age) || other.age == age)&&(identical(other.gender, gender) || other.gender == gender)&&(identical(other.bloodGroup, bloodGroup) || other.bloodGroup == bloodGroup)&&(identical(other.height, height) || other.height == height)&&(identical(other.weight, weight) || other.weight == weight)&&(identical(other.allergies, allergies) || other.allergies == allergies)&&(identical(other.chronicDiseases, chronicDiseases) || other.chronicDiseases == chronicDiseases)&&(identical(other.medications, medications) || other.medications == medications)&&(identical(other.surgeries, surgeries) || other.surgeries == surgeries)&&(identical(other.emergencyContactName, emergencyContactName) || other.emergencyContactName == emergencyContactName)&&(identical(other.emergencyContactPhone, emergencyContactPhone) || other.emergencyContactPhone == emergencyContactPhone));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,mobile,relation,age,gender,bloodGroup,height,weight,allergies,chronicDiseases,medications,surgeries,emergencyContactName,emergencyContactPhone);

@override
String toString() {
  return 'PatientRecordPerson(id: $id, name: $name, mobile: $mobile, relation: $relation, age: $age, gender: $gender, bloodGroup: $bloodGroup, height: $height, weight: $weight, allergies: $allergies, chronicDiseases: $chronicDiseases, medications: $medications, surgeries: $surgeries, emergencyContactName: $emergencyContactName, emergencyContactPhone: $emergencyContactPhone)';
}


}

/// @nodoc
abstract mixin class $PatientRecordPersonCopyWith<$Res>  {
  factory $PatientRecordPersonCopyWith(PatientRecordPerson value, $Res Function(PatientRecordPerson) _then) = _$PatientRecordPersonCopyWithImpl;
@useResult
$Res call({
 String? id, String name, String? mobile, String? relation, int? age, String? gender, String? bloodGroup, int? height, int? weight, String? allergies, String? chronicDiseases, String? medications, String? surgeries, String? emergencyContactName, String? emergencyContactPhone
});




}
/// @nodoc
class _$PatientRecordPersonCopyWithImpl<$Res>
    implements $PatientRecordPersonCopyWith<$Res> {
  _$PatientRecordPersonCopyWithImpl(this._self, this._then);

  final PatientRecordPerson _self;
  final $Res Function(PatientRecordPerson) _then;

/// Create a copy of PatientRecordPerson
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = freezed,Object? name = null,Object? mobile = freezed,Object? relation = freezed,Object? age = freezed,Object? gender = freezed,Object? bloodGroup = freezed,Object? height = freezed,Object? weight = freezed,Object? allergies = freezed,Object? chronicDiseases = freezed,Object? medications = freezed,Object? surgeries = freezed,Object? emergencyContactName = freezed,Object? emergencyContactPhone = freezed,}) {
  return _then(PatientRecordPerson(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,mobile: freezed == mobile ? _self.mobile : mobile // ignore: cast_nullable_to_non_nullable
as String?,relation: freezed == relation ? _self.relation : relation // ignore: cast_nullable_to_non_nullable
as String?,age: freezed == age ? _self.age : age // ignore: cast_nullable_to_non_nullable
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


/// Adds pattern-matching-related methods to [PatientRecordPerson].
extension PatientRecordPersonPatterns on PatientRecordPerson {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PatientRecordPerson value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PatientRecordPerson() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PatientRecordPerson value)  $default,){
final _that = this;
switch (_that) {
case _PatientRecordPerson():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PatientRecordPerson value)?  $default,){
final _that = this;
switch (_that) {
case _PatientRecordPerson() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? id,  String name,  String? mobile,  String? relation,  int? age,  String? gender,  String? bloodGroup,  int? height,  int? weight,  String? allergies,  String? chronicDiseases,  String? medications,  String? surgeries,  String? emergencyContactName,  String? emergencyContactPhone)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PatientRecordPerson() when $default != null:
return $default(_that.id,_that.name,_that.mobile,_that.relation,_that.age,_that.gender,_that.bloodGroup,_that.height,_that.weight,_that.allergies,_that.chronicDiseases,_that.medications,_that.surgeries,_that.emergencyContactName,_that.emergencyContactPhone);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? id,  String name,  String? mobile,  String? relation,  int? age,  String? gender,  String? bloodGroup,  int? height,  int? weight,  String? allergies,  String? chronicDiseases,  String? medications,  String? surgeries,  String? emergencyContactName,  String? emergencyContactPhone)  $default,) {final _that = this;
switch (_that) {
case _PatientRecordPerson():
return $default(_that.id,_that.name,_that.mobile,_that.relation,_that.age,_that.gender,_that.bloodGroup,_that.height,_that.weight,_that.allergies,_that.chronicDiseases,_that.medications,_that.surgeries,_that.emergencyContactName,_that.emergencyContactPhone);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? id,  String name,  String? mobile,  String? relation,  int? age,  String? gender,  String? bloodGroup,  int? height,  int? weight,  String? allergies,  String? chronicDiseases,  String? medications,  String? surgeries,  String? emergencyContactName,  String? emergencyContactPhone)?  $default,) {final _that = this;
switch (_that) {
case _PatientRecordPerson() when $default != null:
return $default(_that.id,_that.name,_that.mobile,_that.relation,_that.age,_that.gender,_that.bloodGroup,_that.height,_that.weight,_that.allergies,_that.chronicDiseases,_that.medications,_that.surgeries,_that.emergencyContactName,_that.emergencyContactPhone);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PatientRecordPerson implements PatientRecordPerson {
  const _PatientRecordPerson({this.id, required this.name, this.mobile, this.relation, this.age, this.gender, this.bloodGroup, this.height, this.weight, this.allergies, this.chronicDiseases, this.medications, this.surgeries, this.emergencyContactName, this.emergencyContactPhone});
  factory _PatientRecordPerson.fromJson(Map<String, dynamic> json) => _$PatientRecordPersonFromJson(json);

@override final  String? id;
@override final  String name;
@override final  String? mobile;
@override final  String? relation;
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

/// Create a copy of PatientRecordPerson
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PatientRecordPersonCopyWith<_PatientRecordPerson> get copyWith => __$PatientRecordPersonCopyWithImpl<_PatientRecordPerson>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PatientRecordPersonToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PatientRecordPerson&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.mobile, mobile) || other.mobile == mobile)&&(identical(other.relation, relation) || other.relation == relation)&&(identical(other.age, age) || other.age == age)&&(identical(other.gender, gender) || other.gender == gender)&&(identical(other.bloodGroup, bloodGroup) || other.bloodGroup == bloodGroup)&&(identical(other.height, height) || other.height == height)&&(identical(other.weight, weight) || other.weight == weight)&&(identical(other.allergies, allergies) || other.allergies == allergies)&&(identical(other.chronicDiseases, chronicDiseases) || other.chronicDiseases == chronicDiseases)&&(identical(other.medications, medications) || other.medications == medications)&&(identical(other.surgeries, surgeries) || other.surgeries == surgeries)&&(identical(other.emergencyContactName, emergencyContactName) || other.emergencyContactName == emergencyContactName)&&(identical(other.emergencyContactPhone, emergencyContactPhone) || other.emergencyContactPhone == emergencyContactPhone));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,mobile,relation,age,gender,bloodGroup,height,weight,allergies,chronicDiseases,medications,surgeries,emergencyContactName,emergencyContactPhone);

@override
String toString() {
  return 'PatientRecordPerson(id: $id, name: $name, mobile: $mobile, relation: $relation, age: $age, gender: $gender, bloodGroup: $bloodGroup, height: $height, weight: $weight, allergies: $allergies, chronicDiseases: $chronicDiseases, medications: $medications, surgeries: $surgeries, emergencyContactName: $emergencyContactName, emergencyContactPhone: $emergencyContactPhone)';
}


}

/// @nodoc
abstract mixin class _$PatientRecordPersonCopyWith<$Res> implements $PatientRecordPersonCopyWith<$Res> {
  factory _$PatientRecordPersonCopyWith(_PatientRecordPerson value, $Res Function(_PatientRecordPerson) _then) = __$PatientRecordPersonCopyWithImpl;
@override @useResult
$Res call({
 String? id, String name, String? mobile, String? relation, int? age, String? gender, String? bloodGroup, int? height, int? weight, String? allergies, String? chronicDiseases, String? medications, String? surgeries, String? emergencyContactName, String? emergencyContactPhone
});




}
/// @nodoc
class __$PatientRecordPersonCopyWithImpl<$Res>
    implements _$PatientRecordPersonCopyWith<$Res> {
  __$PatientRecordPersonCopyWithImpl(this._self, this._then);

  final _PatientRecordPerson _self;
  final $Res Function(_PatientRecordPerson) _then;

/// Create a copy of PatientRecordPerson
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = freezed,Object? name = null,Object? mobile = freezed,Object? relation = freezed,Object? age = freezed,Object? gender = freezed,Object? bloodGroup = freezed,Object? height = freezed,Object? weight = freezed,Object? allergies = freezed,Object? chronicDiseases = freezed,Object? medications = freezed,Object? surgeries = freezed,Object? emergencyContactName = freezed,Object? emergencyContactPhone = freezed,}) {
  return _then(_PatientRecordPerson(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,mobile: freezed == mobile ? _self.mobile : mobile // ignore: cast_nullable_to_non_nullable
as String?,relation: freezed == relation ? _self.relation : relation // ignore: cast_nullable_to_non_nullable
as String?,age: freezed == age ? _self.age : age // ignore: cast_nullable_to_non_nullable
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


/// @nodoc
mixin _$PatientRecord {

 PatientRecordPerson get patient; PatientRecordPerson? get dependent; List<Appointment> get appointments;
/// Create a copy of PatientRecord
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PatientRecordCopyWith<PatientRecord> get copyWith => _$PatientRecordCopyWithImpl<PatientRecord>(this as PatientRecord, _$identity);

  /// Serializes this PatientRecord to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PatientRecord&&(identical(other.patient, patient) || other.patient == patient)&&(identical(other.dependent, dependent) || other.dependent == dependent)&&const DeepCollectionEquality().equals(other.appointments, appointments));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,patient,dependent,const DeepCollectionEquality().hash(appointments));

@override
String toString() {
  return 'PatientRecord(patient: $patient, dependent: $dependent, appointments: $appointments)';
}


}

/// @nodoc
abstract mixin class $PatientRecordCopyWith<$Res>  {
  factory $PatientRecordCopyWith(PatientRecord value, $Res Function(PatientRecord) _then) = _$PatientRecordCopyWithImpl;
@useResult
$Res call({
 PatientRecordPerson patient, PatientRecordPerson? dependent, List<Appointment> appointments
});


$PatientRecordPersonCopyWith<$Res> get patient;$PatientRecordPersonCopyWith<$Res>? get dependent;

}
/// @nodoc
class _$PatientRecordCopyWithImpl<$Res>
    implements $PatientRecordCopyWith<$Res> {
  _$PatientRecordCopyWithImpl(this._self, this._then);

  final PatientRecord _self;
  final $Res Function(PatientRecord) _then;

/// Create a copy of PatientRecord
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? patient = null,Object? dependent = freezed,Object? appointments = null,}) {
  return _then(PatientRecord(
patient: null == patient ? _self.patient : patient // ignore: cast_nullable_to_non_nullable
as PatientRecordPerson,dependent: freezed == dependent ? _self.dependent : dependent // ignore: cast_nullable_to_non_nullable
as PatientRecordPerson?,appointments: null == appointments ? _self.appointments : appointments // ignore: cast_nullable_to_non_nullable
as List<Appointment>,
  ));
}
/// Create a copy of PatientRecord
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PatientRecordPersonCopyWith<$Res> get patient {
  
  return $PatientRecordPersonCopyWith<$Res>(_self.patient, (value) {
    return _then(_self.copyWith(patient: value));
  });
}/// Create a copy of PatientRecord
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PatientRecordPersonCopyWith<$Res>? get dependent {
    if (_self.dependent == null) {
    return null;
  }

  return $PatientRecordPersonCopyWith<$Res>(_self.dependent!, (value) {
    return _then(_self.copyWith(dependent: value));
  });
}
}


/// Adds pattern-matching-related methods to [PatientRecord].
extension PatientRecordPatterns on PatientRecord {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PatientRecord value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PatientRecord() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PatientRecord value)  $default,){
final _that = this;
switch (_that) {
case _PatientRecord():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PatientRecord value)?  $default,){
final _that = this;
switch (_that) {
case _PatientRecord() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( PatientRecordPerson patient,  PatientRecordPerson? dependent,  List<Appointment> appointments)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PatientRecord() when $default != null:
return $default(_that.patient,_that.dependent,_that.appointments);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( PatientRecordPerson patient,  PatientRecordPerson? dependent,  List<Appointment> appointments)  $default,) {final _that = this;
switch (_that) {
case _PatientRecord():
return $default(_that.patient,_that.dependent,_that.appointments);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( PatientRecordPerson patient,  PatientRecordPerson? dependent,  List<Appointment> appointments)?  $default,) {final _that = this;
switch (_that) {
case _PatientRecord() when $default != null:
return $default(_that.patient,_that.dependent,_that.appointments);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PatientRecord implements PatientRecord {
  const _PatientRecord({required this.patient, this.dependent, required  List<Appointment> appointments}): _appointments = appointments;
  factory _PatientRecord.fromJson(Map<String, dynamic> json) => _$PatientRecordFromJson(json);

@override final  PatientRecordPerson patient;
@override final  PatientRecordPerson? dependent;
 final  List<Appointment> _appointments;
@override List<Appointment> get appointments {
  if (_appointments is EqualUnmodifiableListView) return _appointments;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_appointments);
}


/// Create a copy of PatientRecord
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PatientRecordCopyWith<_PatientRecord> get copyWith => __$PatientRecordCopyWithImpl<_PatientRecord>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PatientRecordToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PatientRecord&&(identical(other.patient, patient) || other.patient == patient)&&(identical(other.dependent, dependent) || other.dependent == dependent)&&const DeepCollectionEquality().equals(other._appointments, _appointments));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,patient,dependent,const DeepCollectionEquality().hash(_appointments));

@override
String toString() {
  return 'PatientRecord(patient: $patient, dependent: $dependent, appointments: $appointments)';
}


}

/// @nodoc
abstract mixin class _$PatientRecordCopyWith<$Res> implements $PatientRecordCopyWith<$Res> {
  factory _$PatientRecordCopyWith(_PatientRecord value, $Res Function(_PatientRecord) _then) = __$PatientRecordCopyWithImpl;
@override @useResult
$Res call({
 PatientRecordPerson patient, PatientRecordPerson? dependent, List<Appointment> appointments
});


@override $PatientRecordPersonCopyWith<$Res> get patient;@override $PatientRecordPersonCopyWith<$Res>? get dependent;

}
/// @nodoc
class __$PatientRecordCopyWithImpl<$Res>
    implements _$PatientRecordCopyWith<$Res> {
  __$PatientRecordCopyWithImpl(this._self, this._then);

  final _PatientRecord _self;
  final $Res Function(_PatientRecord) _then;

/// Create a copy of PatientRecord
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? patient = null,Object? dependent = freezed,Object? appointments = null,}) {
  return _then(_PatientRecord(
patient: null == patient ? _self.patient : patient // ignore: cast_nullable_to_non_nullable
as PatientRecordPerson,dependent: freezed == dependent ? _self.dependent : dependent // ignore: cast_nullable_to_non_nullable
as PatientRecordPerson?,appointments: null == appointments ? _self._appointments : appointments // ignore: cast_nullable_to_non_nullable
as List<Appointment>,
  ));
}

/// Create a copy of PatientRecord
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PatientRecordPersonCopyWith<$Res> get patient {
  
  return $PatientRecordPersonCopyWith<$Res>(_self.patient, (value) {
    return _then(_self.copyWith(patient: value));
  });
}/// Create a copy of PatientRecord
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PatientRecordPersonCopyWith<$Res>? get dependent {
    if (_self.dependent == null) {
    return null;
  }

  return $PatientRecordPersonCopyWith<$Res>(_self.dependent!, (value) {
    return _then(_self.copyWith(dependent: value));
  });
}
}

// dart format on
