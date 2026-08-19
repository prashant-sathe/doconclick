// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'prescription.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PrescriptionMedicine {

 String? get id; String? get appointmentId; String get name; String get dosage; String get frequency; String get duration; String? get instructions;
/// Create a copy of PrescriptionMedicine
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PrescriptionMedicineCopyWith<PrescriptionMedicine> get copyWith => _$PrescriptionMedicineCopyWithImpl<PrescriptionMedicine>(this as PrescriptionMedicine, _$identity);

  /// Serializes this PrescriptionMedicine to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PrescriptionMedicine&&(identical(other.id, id) || other.id == id)&&(identical(other.appointmentId, appointmentId) || other.appointmentId == appointmentId)&&(identical(other.name, name) || other.name == name)&&(identical(other.dosage, dosage) || other.dosage == dosage)&&(identical(other.frequency, frequency) || other.frequency == frequency)&&(identical(other.duration, duration) || other.duration == duration)&&(identical(other.instructions, instructions) || other.instructions == instructions));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,appointmentId,name,dosage,frequency,duration,instructions);

@override
String toString() {
  return 'PrescriptionMedicine(id: $id, appointmentId: $appointmentId, name: $name, dosage: $dosage, frequency: $frequency, duration: $duration, instructions: $instructions)';
}


}

/// @nodoc
abstract mixin class $PrescriptionMedicineCopyWith<$Res>  {
  factory $PrescriptionMedicineCopyWith(PrescriptionMedicine value, $Res Function(PrescriptionMedicine) _then) = _$PrescriptionMedicineCopyWithImpl;
@useResult
$Res call({
 String? id, String? appointmentId, String name, String dosage, String frequency, String duration, String? instructions
});




}
/// @nodoc
class _$PrescriptionMedicineCopyWithImpl<$Res>
    implements $PrescriptionMedicineCopyWith<$Res> {
  _$PrescriptionMedicineCopyWithImpl(this._self, this._then);

  final PrescriptionMedicine _self;
  final $Res Function(PrescriptionMedicine) _then;

/// Create a copy of PrescriptionMedicine
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = freezed,Object? appointmentId = freezed,Object? name = null,Object? dosage = null,Object? frequency = null,Object? duration = null,Object? instructions = freezed,}) {
  return _then(PrescriptionMedicine(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,appointmentId: freezed == appointmentId ? _self.appointmentId : appointmentId // ignore: cast_nullable_to_non_nullable
as String?,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,dosage: null == dosage ? _self.dosage : dosage // ignore: cast_nullable_to_non_nullable
as String,frequency: null == frequency ? _self.frequency : frequency // ignore: cast_nullable_to_non_nullable
as String,duration: null == duration ? _self.duration : duration // ignore: cast_nullable_to_non_nullable
as String,instructions: freezed == instructions ? _self.instructions : instructions // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [PrescriptionMedicine].
extension PrescriptionMedicinePatterns on PrescriptionMedicine {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PrescriptionMedicine value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PrescriptionMedicine() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PrescriptionMedicine value)  $default,){
final _that = this;
switch (_that) {
case _PrescriptionMedicine():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PrescriptionMedicine value)?  $default,){
final _that = this;
switch (_that) {
case _PrescriptionMedicine() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? id,  String? appointmentId,  String name,  String dosage,  String frequency,  String duration,  String? instructions)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PrescriptionMedicine() when $default != null:
return $default(_that.id,_that.appointmentId,_that.name,_that.dosage,_that.frequency,_that.duration,_that.instructions);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? id,  String? appointmentId,  String name,  String dosage,  String frequency,  String duration,  String? instructions)  $default,) {final _that = this;
switch (_that) {
case _PrescriptionMedicine():
return $default(_that.id,_that.appointmentId,_that.name,_that.dosage,_that.frequency,_that.duration,_that.instructions);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? id,  String? appointmentId,  String name,  String dosage,  String frequency,  String duration,  String? instructions)?  $default,) {final _that = this;
switch (_that) {
case _PrescriptionMedicine() when $default != null:
return $default(_that.id,_that.appointmentId,_that.name,_that.dosage,_that.frequency,_that.duration,_that.instructions);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PrescriptionMedicine implements PrescriptionMedicine {
  const _PrescriptionMedicine({this.id, this.appointmentId, required this.name, this.dosage = '', this.frequency = '', this.duration = '', this.instructions});
  factory _PrescriptionMedicine.fromJson(Map<String, dynamic> json) => _$PrescriptionMedicineFromJson(json);

@override final  String? id;
@override final  String? appointmentId;
@override final  String name;
@override@JsonKey() final  String dosage;
@override@JsonKey() final  String frequency;
@override@JsonKey() final  String duration;
@override final  String? instructions;

/// Create a copy of PrescriptionMedicine
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PrescriptionMedicineCopyWith<_PrescriptionMedicine> get copyWith => __$PrescriptionMedicineCopyWithImpl<_PrescriptionMedicine>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PrescriptionMedicineToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PrescriptionMedicine&&(identical(other.id, id) || other.id == id)&&(identical(other.appointmentId, appointmentId) || other.appointmentId == appointmentId)&&(identical(other.name, name) || other.name == name)&&(identical(other.dosage, dosage) || other.dosage == dosage)&&(identical(other.frequency, frequency) || other.frequency == frequency)&&(identical(other.duration, duration) || other.duration == duration)&&(identical(other.instructions, instructions) || other.instructions == instructions));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,appointmentId,name,dosage,frequency,duration,instructions);

@override
String toString() {
  return 'PrescriptionMedicine(id: $id, appointmentId: $appointmentId, name: $name, dosage: $dosage, frequency: $frequency, duration: $duration, instructions: $instructions)';
}


}

/// @nodoc
abstract mixin class _$PrescriptionMedicineCopyWith<$Res> implements $PrescriptionMedicineCopyWith<$Res> {
  factory _$PrescriptionMedicineCopyWith(_PrescriptionMedicine value, $Res Function(_PrescriptionMedicine) _then) = __$PrescriptionMedicineCopyWithImpl;
@override @useResult
$Res call({
 String? id, String? appointmentId, String name, String dosage, String frequency, String duration, String? instructions
});




}
/// @nodoc
class __$PrescriptionMedicineCopyWithImpl<$Res>
    implements _$PrescriptionMedicineCopyWith<$Res> {
  __$PrescriptionMedicineCopyWithImpl(this._self, this._then);

  final _PrescriptionMedicine _self;
  final $Res Function(_PrescriptionMedicine) _then;

/// Create a copy of PrescriptionMedicine
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = freezed,Object? appointmentId = freezed,Object? name = null,Object? dosage = null,Object? frequency = null,Object? duration = null,Object? instructions = freezed,}) {
  return _then(_PrescriptionMedicine(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,appointmentId: freezed == appointmentId ? _self.appointmentId : appointmentId // ignore: cast_nullable_to_non_nullable
as String?,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,dosage: null == dosage ? _self.dosage : dosage // ignore: cast_nullable_to_non_nullable
as String,frequency: null == frequency ? _self.frequency : frequency // ignore: cast_nullable_to_non_nullable
as String,duration: null == duration ? _self.duration : duration // ignore: cast_nullable_to_non_nullable
as String,instructions: freezed == instructions ? _self.instructions : instructions // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$PrescriptionAttachment {

 String get id; String get appointmentId; String get url; String? get fileName;
/// Create a copy of PrescriptionAttachment
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PrescriptionAttachmentCopyWith<PrescriptionAttachment> get copyWith => _$PrescriptionAttachmentCopyWithImpl<PrescriptionAttachment>(this as PrescriptionAttachment, _$identity);

  /// Serializes this PrescriptionAttachment to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PrescriptionAttachment&&(identical(other.id, id) || other.id == id)&&(identical(other.appointmentId, appointmentId) || other.appointmentId == appointmentId)&&(identical(other.url, url) || other.url == url)&&(identical(other.fileName, fileName) || other.fileName == fileName));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,appointmentId,url,fileName);

@override
String toString() {
  return 'PrescriptionAttachment(id: $id, appointmentId: $appointmentId, url: $url, fileName: $fileName)';
}


}

/// @nodoc
abstract mixin class $PrescriptionAttachmentCopyWith<$Res>  {
  factory $PrescriptionAttachmentCopyWith(PrescriptionAttachment value, $Res Function(PrescriptionAttachment) _then) = _$PrescriptionAttachmentCopyWithImpl;
@useResult
$Res call({
 String id, String appointmentId, String url, String? fileName
});




}
/// @nodoc
class _$PrescriptionAttachmentCopyWithImpl<$Res>
    implements $PrescriptionAttachmentCopyWith<$Res> {
  _$PrescriptionAttachmentCopyWithImpl(this._self, this._then);

  final PrescriptionAttachment _self;
  final $Res Function(PrescriptionAttachment) _then;

/// Create a copy of PrescriptionAttachment
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? appointmentId = null,Object? url = null,Object? fileName = freezed,}) {
  return _then(PrescriptionAttachment(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,appointmentId: null == appointmentId ? _self.appointmentId : appointmentId // ignore: cast_nullable_to_non_nullable
as String,url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,fileName: freezed == fileName ? _self.fileName : fileName // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [PrescriptionAttachment].
extension PrescriptionAttachmentPatterns on PrescriptionAttachment {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PrescriptionAttachment value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PrescriptionAttachment() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PrescriptionAttachment value)  $default,){
final _that = this;
switch (_that) {
case _PrescriptionAttachment():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PrescriptionAttachment value)?  $default,){
final _that = this;
switch (_that) {
case _PrescriptionAttachment() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String appointmentId,  String url,  String? fileName)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PrescriptionAttachment() when $default != null:
return $default(_that.id,_that.appointmentId,_that.url,_that.fileName);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String appointmentId,  String url,  String? fileName)  $default,) {final _that = this;
switch (_that) {
case _PrescriptionAttachment():
return $default(_that.id,_that.appointmentId,_that.url,_that.fileName);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String appointmentId,  String url,  String? fileName)?  $default,) {final _that = this;
switch (_that) {
case _PrescriptionAttachment() when $default != null:
return $default(_that.id,_that.appointmentId,_that.url,_that.fileName);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PrescriptionAttachment implements PrescriptionAttachment {
  const _PrescriptionAttachment({required this.id, required this.appointmentId, required this.url, this.fileName});
  factory _PrescriptionAttachment.fromJson(Map<String, dynamic> json) => _$PrescriptionAttachmentFromJson(json);

@override final  String id;
@override final  String appointmentId;
@override final  String url;
@override final  String? fileName;

/// Create a copy of PrescriptionAttachment
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PrescriptionAttachmentCopyWith<_PrescriptionAttachment> get copyWith => __$PrescriptionAttachmentCopyWithImpl<_PrescriptionAttachment>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PrescriptionAttachmentToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PrescriptionAttachment&&(identical(other.id, id) || other.id == id)&&(identical(other.appointmentId, appointmentId) || other.appointmentId == appointmentId)&&(identical(other.url, url) || other.url == url)&&(identical(other.fileName, fileName) || other.fileName == fileName));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,appointmentId,url,fileName);

@override
String toString() {
  return 'PrescriptionAttachment(id: $id, appointmentId: $appointmentId, url: $url, fileName: $fileName)';
}


}

/// @nodoc
abstract mixin class _$PrescriptionAttachmentCopyWith<$Res> implements $PrescriptionAttachmentCopyWith<$Res> {
  factory _$PrescriptionAttachmentCopyWith(_PrescriptionAttachment value, $Res Function(_PrescriptionAttachment) _then) = __$PrescriptionAttachmentCopyWithImpl;
@override @useResult
$Res call({
 String id, String appointmentId, String url, String? fileName
});




}
/// @nodoc
class __$PrescriptionAttachmentCopyWithImpl<$Res>
    implements _$PrescriptionAttachmentCopyWith<$Res> {
  __$PrescriptionAttachmentCopyWithImpl(this._self, this._then);

  final _PrescriptionAttachment _self;
  final $Res Function(_PrescriptionAttachment) _then;

/// Create a copy of PrescriptionAttachment
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? appointmentId = null,Object? url = null,Object? fileName = freezed,}) {
  return _then(_PrescriptionAttachment(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,appointmentId: null == appointmentId ? _self.appointmentId : appointmentId // ignore: cast_nullable_to_non_nullable
as String,url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,fileName: freezed == fileName ? _self.fileName : fileName // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$PrescriptionDetail {

 String get id; DateTime get scheduledAt; String? get patientName; String get accountHolderName; String get relation; int? get patientAge; String? get patientGender; String get doctorName; String? get doctorQualification; String? get doctorRegNo; String get doctorSpecialty; String? get doctorNotes; DateTime? get consultationStartedAt; DateTime? get consultationEndedAt; List<PrescriptionMedicine> get medicines;
/// Create a copy of PrescriptionDetail
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PrescriptionDetailCopyWith<PrescriptionDetail> get copyWith => _$PrescriptionDetailCopyWithImpl<PrescriptionDetail>(this as PrescriptionDetail, _$identity);

  /// Serializes this PrescriptionDetail to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PrescriptionDetail&&(identical(other.id, id) || other.id == id)&&(identical(other.scheduledAt, scheduledAt) || other.scheduledAt == scheduledAt)&&(identical(other.patientName, patientName) || other.patientName == patientName)&&(identical(other.accountHolderName, accountHolderName) || other.accountHolderName == accountHolderName)&&(identical(other.relation, relation) || other.relation == relation)&&(identical(other.patientAge, patientAge) || other.patientAge == patientAge)&&(identical(other.patientGender, patientGender) || other.patientGender == patientGender)&&(identical(other.doctorName, doctorName) || other.doctorName == doctorName)&&(identical(other.doctorQualification, doctorQualification) || other.doctorQualification == doctorQualification)&&(identical(other.doctorRegNo, doctorRegNo) || other.doctorRegNo == doctorRegNo)&&(identical(other.doctorSpecialty, doctorSpecialty) || other.doctorSpecialty == doctorSpecialty)&&(identical(other.doctorNotes, doctorNotes) || other.doctorNotes == doctorNotes)&&(identical(other.consultationStartedAt, consultationStartedAt) || other.consultationStartedAt == consultationStartedAt)&&(identical(other.consultationEndedAt, consultationEndedAt) || other.consultationEndedAt == consultationEndedAt)&&const DeepCollectionEquality().equals(other.medicines, medicines));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,scheduledAt,patientName,accountHolderName,relation,patientAge,patientGender,doctorName,doctorQualification,doctorRegNo,doctorSpecialty,doctorNotes,consultationStartedAt,consultationEndedAt,const DeepCollectionEquality().hash(medicines));

@override
String toString() {
  return 'PrescriptionDetail(id: $id, scheduledAt: $scheduledAt, patientName: $patientName, accountHolderName: $accountHolderName, relation: $relation, patientAge: $patientAge, patientGender: $patientGender, doctorName: $doctorName, doctorQualification: $doctorQualification, doctorRegNo: $doctorRegNo, doctorSpecialty: $doctorSpecialty, doctorNotes: $doctorNotes, consultationStartedAt: $consultationStartedAt, consultationEndedAt: $consultationEndedAt, medicines: $medicines)';
}


}

/// @nodoc
abstract mixin class $PrescriptionDetailCopyWith<$Res>  {
  factory $PrescriptionDetailCopyWith(PrescriptionDetail value, $Res Function(PrescriptionDetail) _then) = _$PrescriptionDetailCopyWithImpl;
@useResult
$Res call({
 String id, DateTime scheduledAt, String? patientName, String accountHolderName, String relation, int? patientAge, String? patientGender, String doctorName, String? doctorQualification, String? doctorRegNo, String doctorSpecialty, String? doctorNotes, DateTime? consultationStartedAt, DateTime? consultationEndedAt, List<PrescriptionMedicine> medicines
});




}
/// @nodoc
class _$PrescriptionDetailCopyWithImpl<$Res>
    implements $PrescriptionDetailCopyWith<$Res> {
  _$PrescriptionDetailCopyWithImpl(this._self, this._then);

  final PrescriptionDetail _self;
  final $Res Function(PrescriptionDetail) _then;

/// Create a copy of PrescriptionDetail
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? scheduledAt = null,Object? patientName = freezed,Object? accountHolderName = null,Object? relation = null,Object? patientAge = freezed,Object? patientGender = freezed,Object? doctorName = null,Object? doctorQualification = freezed,Object? doctorRegNo = freezed,Object? doctorSpecialty = null,Object? doctorNotes = freezed,Object? consultationStartedAt = freezed,Object? consultationEndedAt = freezed,Object? medicines = null,}) {
  return _then(PrescriptionDetail(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,scheduledAt: null == scheduledAt ? _self.scheduledAt : scheduledAt // ignore: cast_nullable_to_non_nullable
as DateTime,patientName: freezed == patientName ? _self.patientName : patientName // ignore: cast_nullable_to_non_nullable
as String?,accountHolderName: null == accountHolderName ? _self.accountHolderName : accountHolderName // ignore: cast_nullable_to_non_nullable
as String,relation: null == relation ? _self.relation : relation // ignore: cast_nullable_to_non_nullable
as String,patientAge: freezed == patientAge ? _self.patientAge : patientAge // ignore: cast_nullable_to_non_nullable
as int?,patientGender: freezed == patientGender ? _self.patientGender : patientGender // ignore: cast_nullable_to_non_nullable
as String?,doctorName: null == doctorName ? _self.doctorName : doctorName // ignore: cast_nullable_to_non_nullable
as String,doctorQualification: freezed == doctorQualification ? _self.doctorQualification : doctorQualification // ignore: cast_nullable_to_non_nullable
as String?,doctorRegNo: freezed == doctorRegNo ? _self.doctorRegNo : doctorRegNo // ignore: cast_nullable_to_non_nullable
as String?,doctorSpecialty: null == doctorSpecialty ? _self.doctorSpecialty : doctorSpecialty // ignore: cast_nullable_to_non_nullable
as String,doctorNotes: freezed == doctorNotes ? _self.doctorNotes : doctorNotes // ignore: cast_nullable_to_non_nullable
as String?,consultationStartedAt: freezed == consultationStartedAt ? _self.consultationStartedAt : consultationStartedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,consultationEndedAt: freezed == consultationEndedAt ? _self.consultationEndedAt : consultationEndedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,medicines: null == medicines ? _self.medicines : medicines // ignore: cast_nullable_to_non_nullable
as List<PrescriptionMedicine>,
  ));
}

}


/// Adds pattern-matching-related methods to [PrescriptionDetail].
extension PrescriptionDetailPatterns on PrescriptionDetail {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PrescriptionDetail value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PrescriptionDetail() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PrescriptionDetail value)  $default,){
final _that = this;
switch (_that) {
case _PrescriptionDetail():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PrescriptionDetail value)?  $default,){
final _that = this;
switch (_that) {
case _PrescriptionDetail() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  DateTime scheduledAt,  String? patientName,  String accountHolderName,  String relation,  int? patientAge,  String? patientGender,  String doctorName,  String? doctorQualification,  String? doctorRegNo,  String doctorSpecialty,  String? doctorNotes,  DateTime? consultationStartedAt,  DateTime? consultationEndedAt,  List<PrescriptionMedicine> medicines)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PrescriptionDetail() when $default != null:
return $default(_that.id,_that.scheduledAt,_that.patientName,_that.accountHolderName,_that.relation,_that.patientAge,_that.patientGender,_that.doctorName,_that.doctorQualification,_that.doctorRegNo,_that.doctorSpecialty,_that.doctorNotes,_that.consultationStartedAt,_that.consultationEndedAt,_that.medicines);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  DateTime scheduledAt,  String? patientName,  String accountHolderName,  String relation,  int? patientAge,  String? patientGender,  String doctorName,  String? doctorQualification,  String? doctorRegNo,  String doctorSpecialty,  String? doctorNotes,  DateTime? consultationStartedAt,  DateTime? consultationEndedAt,  List<PrescriptionMedicine> medicines)  $default,) {final _that = this;
switch (_that) {
case _PrescriptionDetail():
return $default(_that.id,_that.scheduledAt,_that.patientName,_that.accountHolderName,_that.relation,_that.patientAge,_that.patientGender,_that.doctorName,_that.doctorQualification,_that.doctorRegNo,_that.doctorSpecialty,_that.doctorNotes,_that.consultationStartedAt,_that.consultationEndedAt,_that.medicines);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  DateTime scheduledAt,  String? patientName,  String accountHolderName,  String relation,  int? patientAge,  String? patientGender,  String doctorName,  String? doctorQualification,  String? doctorRegNo,  String doctorSpecialty,  String? doctorNotes,  DateTime? consultationStartedAt,  DateTime? consultationEndedAt,  List<PrescriptionMedicine> medicines)?  $default,) {final _that = this;
switch (_that) {
case _PrescriptionDetail() when $default != null:
return $default(_that.id,_that.scheduledAt,_that.patientName,_that.accountHolderName,_that.relation,_that.patientAge,_that.patientGender,_that.doctorName,_that.doctorQualification,_that.doctorRegNo,_that.doctorSpecialty,_that.doctorNotes,_that.consultationStartedAt,_that.consultationEndedAt,_that.medicines);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PrescriptionDetail implements PrescriptionDetail {
  const _PrescriptionDetail({required this.id, required this.scheduledAt, this.patientName, required this.accountHolderName, required this.relation, this.patientAge, this.patientGender, required this.doctorName, this.doctorQualification, this.doctorRegNo, this.doctorSpecialty = 'General Physician', this.doctorNotes, this.consultationStartedAt, this.consultationEndedAt, required  List<PrescriptionMedicine> medicines}): _medicines = medicines;
  factory _PrescriptionDetail.fromJson(Map<String, dynamic> json) => _$PrescriptionDetailFromJson(json);

@override final  String id;
@override final  DateTime scheduledAt;
@override final  String? patientName;
@override final  String accountHolderName;
@override final  String relation;
@override final  int? patientAge;
@override final  String? patientGender;
@override final  String doctorName;
@override final  String? doctorQualification;
@override final  String? doctorRegNo;
@override@JsonKey() final  String doctorSpecialty;
@override final  String? doctorNotes;
@override final  DateTime? consultationStartedAt;
@override final  DateTime? consultationEndedAt;
 final  List<PrescriptionMedicine> _medicines;
@override List<PrescriptionMedicine> get medicines {
  if (_medicines is EqualUnmodifiableListView) return _medicines;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_medicines);
}


/// Create a copy of PrescriptionDetail
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PrescriptionDetailCopyWith<_PrescriptionDetail> get copyWith => __$PrescriptionDetailCopyWithImpl<_PrescriptionDetail>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PrescriptionDetailToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PrescriptionDetail&&(identical(other.id, id) || other.id == id)&&(identical(other.scheduledAt, scheduledAt) || other.scheduledAt == scheduledAt)&&(identical(other.patientName, patientName) || other.patientName == patientName)&&(identical(other.accountHolderName, accountHolderName) || other.accountHolderName == accountHolderName)&&(identical(other.relation, relation) || other.relation == relation)&&(identical(other.patientAge, patientAge) || other.patientAge == patientAge)&&(identical(other.patientGender, patientGender) || other.patientGender == patientGender)&&(identical(other.doctorName, doctorName) || other.doctorName == doctorName)&&(identical(other.doctorQualification, doctorQualification) || other.doctorQualification == doctorQualification)&&(identical(other.doctorRegNo, doctorRegNo) || other.doctorRegNo == doctorRegNo)&&(identical(other.doctorSpecialty, doctorSpecialty) || other.doctorSpecialty == doctorSpecialty)&&(identical(other.doctorNotes, doctorNotes) || other.doctorNotes == doctorNotes)&&(identical(other.consultationStartedAt, consultationStartedAt) || other.consultationStartedAt == consultationStartedAt)&&(identical(other.consultationEndedAt, consultationEndedAt) || other.consultationEndedAt == consultationEndedAt)&&const DeepCollectionEquality().equals(other._medicines, _medicines));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,scheduledAt,patientName,accountHolderName,relation,patientAge,patientGender,doctorName,doctorQualification,doctorRegNo,doctorSpecialty,doctorNotes,consultationStartedAt,consultationEndedAt,const DeepCollectionEquality().hash(_medicines));

@override
String toString() {
  return 'PrescriptionDetail(id: $id, scheduledAt: $scheduledAt, patientName: $patientName, accountHolderName: $accountHolderName, relation: $relation, patientAge: $patientAge, patientGender: $patientGender, doctorName: $doctorName, doctorQualification: $doctorQualification, doctorRegNo: $doctorRegNo, doctorSpecialty: $doctorSpecialty, doctorNotes: $doctorNotes, consultationStartedAt: $consultationStartedAt, consultationEndedAt: $consultationEndedAt, medicines: $medicines)';
}


}

/// @nodoc
abstract mixin class _$PrescriptionDetailCopyWith<$Res> implements $PrescriptionDetailCopyWith<$Res> {
  factory _$PrescriptionDetailCopyWith(_PrescriptionDetail value, $Res Function(_PrescriptionDetail) _then) = __$PrescriptionDetailCopyWithImpl;
@override @useResult
$Res call({
 String id, DateTime scheduledAt, String? patientName, String accountHolderName, String relation, int? patientAge, String? patientGender, String doctorName, String? doctorQualification, String? doctorRegNo, String doctorSpecialty, String? doctorNotes, DateTime? consultationStartedAt, DateTime? consultationEndedAt, List<PrescriptionMedicine> medicines
});




}
/// @nodoc
class __$PrescriptionDetailCopyWithImpl<$Res>
    implements _$PrescriptionDetailCopyWith<$Res> {
  __$PrescriptionDetailCopyWithImpl(this._self, this._then);

  final _PrescriptionDetail _self;
  final $Res Function(_PrescriptionDetail) _then;

/// Create a copy of PrescriptionDetail
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? scheduledAt = null,Object? patientName = freezed,Object? accountHolderName = null,Object? relation = null,Object? patientAge = freezed,Object? patientGender = freezed,Object? doctorName = null,Object? doctorQualification = freezed,Object? doctorRegNo = freezed,Object? doctorSpecialty = null,Object? doctorNotes = freezed,Object? consultationStartedAt = freezed,Object? consultationEndedAt = freezed,Object? medicines = null,}) {
  return _then(_PrescriptionDetail(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,scheduledAt: null == scheduledAt ? _self.scheduledAt : scheduledAt // ignore: cast_nullable_to_non_nullable
as DateTime,patientName: freezed == patientName ? _self.patientName : patientName // ignore: cast_nullable_to_non_nullable
as String?,accountHolderName: null == accountHolderName ? _self.accountHolderName : accountHolderName // ignore: cast_nullable_to_non_nullable
as String,relation: null == relation ? _self.relation : relation // ignore: cast_nullable_to_non_nullable
as String,patientAge: freezed == patientAge ? _self.patientAge : patientAge // ignore: cast_nullable_to_non_nullable
as int?,patientGender: freezed == patientGender ? _self.patientGender : patientGender // ignore: cast_nullable_to_non_nullable
as String?,doctorName: null == doctorName ? _self.doctorName : doctorName // ignore: cast_nullable_to_non_nullable
as String,doctorQualification: freezed == doctorQualification ? _self.doctorQualification : doctorQualification // ignore: cast_nullable_to_non_nullable
as String?,doctorRegNo: freezed == doctorRegNo ? _self.doctorRegNo : doctorRegNo // ignore: cast_nullable_to_non_nullable
as String?,doctorSpecialty: null == doctorSpecialty ? _self.doctorSpecialty : doctorSpecialty // ignore: cast_nullable_to_non_nullable
as String,doctorNotes: freezed == doctorNotes ? _self.doctorNotes : doctorNotes // ignore: cast_nullable_to_non_nullable
as String?,consultationStartedAt: freezed == consultationStartedAt ? _self.consultationStartedAt : consultationStartedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,consultationEndedAt: freezed == consultationEndedAt ? _self.consultationEndedAt : consultationEndedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,medicines: null == medicines ? _self._medicines : medicines // ignore: cast_nullable_to_non_nullable
as List<PrescriptionMedicine>,
  ));
}


}

// dart format on
