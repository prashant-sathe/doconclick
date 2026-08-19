// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'doctor_profile.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$DoctorProfile {

 String? get photoUrl; String? get clinicName; String? get clinicPhotoUrl; String? get qualification; String? get medRegNo; String get specialty; int get experience; double get consultFee; double get videoFee; double get homeVisitFee; String get availability; int? get radius; double? get lat; double? get lng; String get languages; String? get bio; bool get offersHomeVisit; bool get isVerified; double get avgRating; int get totalReviews;
/// Create a copy of DoctorProfile
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DoctorProfileCopyWith<DoctorProfile> get copyWith => _$DoctorProfileCopyWithImpl<DoctorProfile>(this as DoctorProfile, _$identity);

  /// Serializes this DoctorProfile to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DoctorProfile&&(identical(other.photoUrl, photoUrl) || other.photoUrl == photoUrl)&&(identical(other.clinicName, clinicName) || other.clinicName == clinicName)&&(identical(other.clinicPhotoUrl, clinicPhotoUrl) || other.clinicPhotoUrl == clinicPhotoUrl)&&(identical(other.qualification, qualification) || other.qualification == qualification)&&(identical(other.medRegNo, medRegNo) || other.medRegNo == medRegNo)&&(identical(other.specialty, specialty) || other.specialty == specialty)&&(identical(other.experience, experience) || other.experience == experience)&&(identical(other.consultFee, consultFee) || other.consultFee == consultFee)&&(identical(other.videoFee, videoFee) || other.videoFee == videoFee)&&(identical(other.homeVisitFee, homeVisitFee) || other.homeVisitFee == homeVisitFee)&&(identical(other.availability, availability) || other.availability == availability)&&(identical(other.radius, radius) || other.radius == radius)&&(identical(other.lat, lat) || other.lat == lat)&&(identical(other.lng, lng) || other.lng == lng)&&(identical(other.languages, languages) || other.languages == languages)&&(identical(other.bio, bio) || other.bio == bio)&&(identical(other.offersHomeVisit, offersHomeVisit) || other.offersHomeVisit == offersHomeVisit)&&(identical(other.isVerified, isVerified) || other.isVerified == isVerified)&&(identical(other.avgRating, avgRating) || other.avgRating == avgRating)&&(identical(other.totalReviews, totalReviews) || other.totalReviews == totalReviews));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,photoUrl,clinicName,clinicPhotoUrl,qualification,medRegNo,specialty,experience,consultFee,videoFee,homeVisitFee,availability,radius,lat,lng,languages,bio,offersHomeVisit,isVerified,avgRating,totalReviews]);

@override
String toString() {
  return 'DoctorProfile(photoUrl: $photoUrl, clinicName: $clinicName, clinicPhotoUrl: $clinicPhotoUrl, qualification: $qualification, medRegNo: $medRegNo, specialty: $specialty, experience: $experience, consultFee: $consultFee, videoFee: $videoFee, homeVisitFee: $homeVisitFee, availability: $availability, radius: $radius, lat: $lat, lng: $lng, languages: $languages, bio: $bio, offersHomeVisit: $offersHomeVisit, isVerified: $isVerified, avgRating: $avgRating, totalReviews: $totalReviews)';
}


}

/// @nodoc
abstract mixin class $DoctorProfileCopyWith<$Res>  {
  factory $DoctorProfileCopyWith(DoctorProfile value, $Res Function(DoctorProfile) _then) = _$DoctorProfileCopyWithImpl;
@useResult
$Res call({
 String? photoUrl, String? clinicName, String? clinicPhotoUrl, String? qualification, String? medRegNo, String specialty, int experience, double consultFee, double videoFee, double homeVisitFee, String availability, int? radius, double? lat, double? lng, String languages, String? bio, bool offersHomeVisit, bool isVerified, double avgRating, int totalReviews
});




}
/// @nodoc
class _$DoctorProfileCopyWithImpl<$Res>
    implements $DoctorProfileCopyWith<$Res> {
  _$DoctorProfileCopyWithImpl(this._self, this._then);

  final DoctorProfile _self;
  final $Res Function(DoctorProfile) _then;

/// Create a copy of DoctorProfile
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? photoUrl = freezed,Object? clinicName = freezed,Object? clinicPhotoUrl = freezed,Object? qualification = freezed,Object? medRegNo = freezed,Object? specialty = null,Object? experience = null,Object? consultFee = null,Object? videoFee = null,Object? homeVisitFee = null,Object? availability = null,Object? radius = freezed,Object? lat = freezed,Object? lng = freezed,Object? languages = null,Object? bio = freezed,Object? offersHomeVisit = null,Object? isVerified = null,Object? avgRating = null,Object? totalReviews = null,}) {
  return _then(DoctorProfile(
photoUrl: freezed == photoUrl ? _self.photoUrl : photoUrl // ignore: cast_nullable_to_non_nullable
as String?,clinicName: freezed == clinicName ? _self.clinicName : clinicName // ignore: cast_nullable_to_non_nullable
as String?,clinicPhotoUrl: freezed == clinicPhotoUrl ? _self.clinicPhotoUrl : clinicPhotoUrl // ignore: cast_nullable_to_non_nullable
as String?,qualification: freezed == qualification ? _self.qualification : qualification // ignore: cast_nullable_to_non_nullable
as String?,medRegNo: freezed == medRegNo ? _self.medRegNo : medRegNo // ignore: cast_nullable_to_non_nullable
as String?,specialty: null == specialty ? _self.specialty : specialty // ignore: cast_nullable_to_non_nullable
as String,experience: null == experience ? _self.experience : experience // ignore: cast_nullable_to_non_nullable
as int,consultFee: null == consultFee ? _self.consultFee : consultFee // ignore: cast_nullable_to_non_nullable
as double,videoFee: null == videoFee ? _self.videoFee : videoFee // ignore: cast_nullable_to_non_nullable
as double,homeVisitFee: null == homeVisitFee ? _self.homeVisitFee : homeVisitFee // ignore: cast_nullable_to_non_nullable
as double,availability: null == availability ? _self.availability : availability // ignore: cast_nullable_to_non_nullable
as String,radius: freezed == radius ? _self.radius : radius // ignore: cast_nullable_to_non_nullable
as int?,lat: freezed == lat ? _self.lat : lat // ignore: cast_nullable_to_non_nullable
as double?,lng: freezed == lng ? _self.lng : lng // ignore: cast_nullable_to_non_nullable
as double?,languages: null == languages ? _self.languages : languages // ignore: cast_nullable_to_non_nullable
as String,bio: freezed == bio ? _self.bio : bio // ignore: cast_nullable_to_non_nullable
as String?,offersHomeVisit: null == offersHomeVisit ? _self.offersHomeVisit : offersHomeVisit // ignore: cast_nullable_to_non_nullable
as bool,isVerified: null == isVerified ? _self.isVerified : isVerified // ignore: cast_nullable_to_non_nullable
as bool,avgRating: null == avgRating ? _self.avgRating : avgRating // ignore: cast_nullable_to_non_nullable
as double,totalReviews: null == totalReviews ? _self.totalReviews : totalReviews // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [DoctorProfile].
extension DoctorProfilePatterns on DoctorProfile {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DoctorProfile value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DoctorProfile() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DoctorProfile value)  $default,){
final _that = this;
switch (_that) {
case _DoctorProfile():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DoctorProfile value)?  $default,){
final _that = this;
switch (_that) {
case _DoctorProfile() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? photoUrl,  String? clinicName,  String? clinicPhotoUrl,  String? qualification,  String? medRegNo,  String specialty,  int experience,  double consultFee,  double videoFee,  double homeVisitFee,  String availability,  int? radius,  double? lat,  double? lng,  String languages,  String? bio,  bool offersHomeVisit,  bool isVerified,  double avgRating,  int totalReviews)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DoctorProfile() when $default != null:
return $default(_that.photoUrl,_that.clinicName,_that.clinicPhotoUrl,_that.qualification,_that.medRegNo,_that.specialty,_that.experience,_that.consultFee,_that.videoFee,_that.homeVisitFee,_that.availability,_that.radius,_that.lat,_that.lng,_that.languages,_that.bio,_that.offersHomeVisit,_that.isVerified,_that.avgRating,_that.totalReviews);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? photoUrl,  String? clinicName,  String? clinicPhotoUrl,  String? qualification,  String? medRegNo,  String specialty,  int experience,  double consultFee,  double videoFee,  double homeVisitFee,  String availability,  int? radius,  double? lat,  double? lng,  String languages,  String? bio,  bool offersHomeVisit,  bool isVerified,  double avgRating,  int totalReviews)  $default,) {final _that = this;
switch (_that) {
case _DoctorProfile():
return $default(_that.photoUrl,_that.clinicName,_that.clinicPhotoUrl,_that.qualification,_that.medRegNo,_that.specialty,_that.experience,_that.consultFee,_that.videoFee,_that.homeVisitFee,_that.availability,_that.radius,_that.lat,_that.lng,_that.languages,_that.bio,_that.offersHomeVisit,_that.isVerified,_that.avgRating,_that.totalReviews);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? photoUrl,  String? clinicName,  String? clinicPhotoUrl,  String? qualification,  String? medRegNo,  String specialty,  int experience,  double consultFee,  double videoFee,  double homeVisitFee,  String availability,  int? radius,  double? lat,  double? lng,  String languages,  String? bio,  bool offersHomeVisit,  bool isVerified,  double avgRating,  int totalReviews)?  $default,) {final _that = this;
switch (_that) {
case _DoctorProfile() when $default != null:
return $default(_that.photoUrl,_that.clinicName,_that.clinicPhotoUrl,_that.qualification,_that.medRegNo,_that.specialty,_that.experience,_that.consultFee,_that.videoFee,_that.homeVisitFee,_that.availability,_that.radius,_that.lat,_that.lng,_that.languages,_that.bio,_that.offersHomeVisit,_that.isVerified,_that.avgRating,_that.totalReviews);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DoctorProfile implements DoctorProfile {
  const _DoctorProfile({this.photoUrl, this.clinicName, this.clinicPhotoUrl, this.qualification, this.medRegNo, this.specialty = 'General Physician', this.experience = 0, this.consultFee = 0, this.videoFee = 0, this.homeVisitFee = 0, this.availability = 'Mon-Fri, 9AM-5PM', this.radius, this.lat, this.lng, this.languages = 'English, Hindi', this.bio, this.offersHomeVisit = true, this.isVerified = false, this.avgRating = 0, this.totalReviews = 0});
  factory _DoctorProfile.fromJson(Map<String, dynamic> json) => _$DoctorProfileFromJson(json);

@override final  String? photoUrl;
@override final  String? clinicName;
@override final  String? clinicPhotoUrl;
@override final  String? qualification;
@override final  String? medRegNo;
@override@JsonKey() final  String specialty;
@override@JsonKey() final  int experience;
@override@JsonKey() final  double consultFee;
@override@JsonKey() final  double videoFee;
@override@JsonKey() final  double homeVisitFee;
@override@JsonKey() final  String availability;
@override final  int? radius;
@override final  double? lat;
@override final  double? lng;
@override@JsonKey() final  String languages;
@override final  String? bio;
@override@JsonKey() final  bool offersHomeVisit;
@override@JsonKey() final  bool isVerified;
@override@JsonKey() final  double avgRating;
@override@JsonKey() final  int totalReviews;

/// Create a copy of DoctorProfile
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DoctorProfileCopyWith<_DoctorProfile> get copyWith => __$DoctorProfileCopyWithImpl<_DoctorProfile>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DoctorProfileToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DoctorProfile&&(identical(other.photoUrl, photoUrl) || other.photoUrl == photoUrl)&&(identical(other.clinicName, clinicName) || other.clinicName == clinicName)&&(identical(other.clinicPhotoUrl, clinicPhotoUrl) || other.clinicPhotoUrl == clinicPhotoUrl)&&(identical(other.qualification, qualification) || other.qualification == qualification)&&(identical(other.medRegNo, medRegNo) || other.medRegNo == medRegNo)&&(identical(other.specialty, specialty) || other.specialty == specialty)&&(identical(other.experience, experience) || other.experience == experience)&&(identical(other.consultFee, consultFee) || other.consultFee == consultFee)&&(identical(other.videoFee, videoFee) || other.videoFee == videoFee)&&(identical(other.homeVisitFee, homeVisitFee) || other.homeVisitFee == homeVisitFee)&&(identical(other.availability, availability) || other.availability == availability)&&(identical(other.radius, radius) || other.radius == radius)&&(identical(other.lat, lat) || other.lat == lat)&&(identical(other.lng, lng) || other.lng == lng)&&(identical(other.languages, languages) || other.languages == languages)&&(identical(other.bio, bio) || other.bio == bio)&&(identical(other.offersHomeVisit, offersHomeVisit) || other.offersHomeVisit == offersHomeVisit)&&(identical(other.isVerified, isVerified) || other.isVerified == isVerified)&&(identical(other.avgRating, avgRating) || other.avgRating == avgRating)&&(identical(other.totalReviews, totalReviews) || other.totalReviews == totalReviews));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,photoUrl,clinicName,clinicPhotoUrl,qualification,medRegNo,specialty,experience,consultFee,videoFee,homeVisitFee,availability,radius,lat,lng,languages,bio,offersHomeVisit,isVerified,avgRating,totalReviews]);

@override
String toString() {
  return 'DoctorProfile(photoUrl: $photoUrl, clinicName: $clinicName, clinicPhotoUrl: $clinicPhotoUrl, qualification: $qualification, medRegNo: $medRegNo, specialty: $specialty, experience: $experience, consultFee: $consultFee, videoFee: $videoFee, homeVisitFee: $homeVisitFee, availability: $availability, radius: $radius, lat: $lat, lng: $lng, languages: $languages, bio: $bio, offersHomeVisit: $offersHomeVisit, isVerified: $isVerified, avgRating: $avgRating, totalReviews: $totalReviews)';
}


}

/// @nodoc
abstract mixin class _$DoctorProfileCopyWith<$Res> implements $DoctorProfileCopyWith<$Res> {
  factory _$DoctorProfileCopyWith(_DoctorProfile value, $Res Function(_DoctorProfile) _then) = __$DoctorProfileCopyWithImpl;
@override @useResult
$Res call({
 String? photoUrl, String? clinicName, String? clinicPhotoUrl, String? qualification, String? medRegNo, String specialty, int experience, double consultFee, double videoFee, double homeVisitFee, String availability, int? radius, double? lat, double? lng, String languages, String? bio, bool offersHomeVisit, bool isVerified, double avgRating, int totalReviews
});




}
/// @nodoc
class __$DoctorProfileCopyWithImpl<$Res>
    implements _$DoctorProfileCopyWith<$Res> {
  __$DoctorProfileCopyWithImpl(this._self, this._then);

  final _DoctorProfile _self;
  final $Res Function(_DoctorProfile) _then;

/// Create a copy of DoctorProfile
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? photoUrl = freezed,Object? clinicName = freezed,Object? clinicPhotoUrl = freezed,Object? qualification = freezed,Object? medRegNo = freezed,Object? specialty = null,Object? experience = null,Object? consultFee = null,Object? videoFee = null,Object? homeVisitFee = null,Object? availability = null,Object? radius = freezed,Object? lat = freezed,Object? lng = freezed,Object? languages = null,Object? bio = freezed,Object? offersHomeVisit = null,Object? isVerified = null,Object? avgRating = null,Object? totalReviews = null,}) {
  return _then(_DoctorProfile(
photoUrl: freezed == photoUrl ? _self.photoUrl : photoUrl // ignore: cast_nullable_to_non_nullable
as String?,clinicName: freezed == clinicName ? _self.clinicName : clinicName // ignore: cast_nullable_to_non_nullable
as String?,clinicPhotoUrl: freezed == clinicPhotoUrl ? _self.clinicPhotoUrl : clinicPhotoUrl // ignore: cast_nullable_to_non_nullable
as String?,qualification: freezed == qualification ? _self.qualification : qualification // ignore: cast_nullable_to_non_nullable
as String?,medRegNo: freezed == medRegNo ? _self.medRegNo : medRegNo // ignore: cast_nullable_to_non_nullable
as String?,specialty: null == specialty ? _self.specialty : specialty // ignore: cast_nullable_to_non_nullable
as String,experience: null == experience ? _self.experience : experience // ignore: cast_nullable_to_non_nullable
as int,consultFee: null == consultFee ? _self.consultFee : consultFee // ignore: cast_nullable_to_non_nullable
as double,videoFee: null == videoFee ? _self.videoFee : videoFee // ignore: cast_nullable_to_non_nullable
as double,homeVisitFee: null == homeVisitFee ? _self.homeVisitFee : homeVisitFee // ignore: cast_nullable_to_non_nullable
as double,availability: null == availability ? _self.availability : availability // ignore: cast_nullable_to_non_nullable
as String,radius: freezed == radius ? _self.radius : radius // ignore: cast_nullable_to_non_nullable
as int?,lat: freezed == lat ? _self.lat : lat // ignore: cast_nullable_to_non_nullable
as double?,lng: freezed == lng ? _self.lng : lng // ignore: cast_nullable_to_non_nullable
as double?,languages: null == languages ? _self.languages : languages // ignore: cast_nullable_to_non_nullable
as String,bio: freezed == bio ? _self.bio : bio // ignore: cast_nullable_to_non_nullable
as String?,offersHomeVisit: null == offersHomeVisit ? _self.offersHomeVisit : offersHomeVisit // ignore: cast_nullable_to_non_nullable
as bool,isVerified: null == isVerified ? _self.isVerified : isVerified // ignore: cast_nullable_to_non_nullable
as bool,avgRating: null == avgRating ? _self.avgRating : avgRating // ignore: cast_nullable_to_non_nullable
as double,totalReviews: null == totalReviews ? _self.totalReviews : totalReviews // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$Doctor {

 String get id; String get name; DoctorProfile get doctorProfile;
/// Create a copy of Doctor
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DoctorCopyWith<Doctor> get copyWith => _$DoctorCopyWithImpl<Doctor>(this as Doctor, _$identity);

  /// Serializes this Doctor to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Doctor&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.doctorProfile, doctorProfile) || other.doctorProfile == doctorProfile));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,doctorProfile);

@override
String toString() {
  return 'Doctor(id: $id, name: $name, doctorProfile: $doctorProfile)';
}


}

/// @nodoc
abstract mixin class $DoctorCopyWith<$Res>  {
  factory $DoctorCopyWith(Doctor value, $Res Function(Doctor) _then) = _$DoctorCopyWithImpl;
@useResult
$Res call({
 String id, String name, DoctorProfile doctorProfile
});


$DoctorProfileCopyWith<$Res> get doctorProfile;

}
/// @nodoc
class _$DoctorCopyWithImpl<$Res>
    implements $DoctorCopyWith<$Res> {
  _$DoctorCopyWithImpl(this._self, this._then);

  final Doctor _self;
  final $Res Function(Doctor) _then;

/// Create a copy of Doctor
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? doctorProfile = null,}) {
  return _then(Doctor(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,doctorProfile: null == doctorProfile ? _self.doctorProfile : doctorProfile // ignore: cast_nullable_to_non_nullable
as DoctorProfile,
  ));
}
/// Create a copy of Doctor
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DoctorProfileCopyWith<$Res> get doctorProfile {
  
  return $DoctorProfileCopyWith<$Res>(_self.doctorProfile, (value) {
    return _then(_self.copyWith(doctorProfile: value));
  });
}
}


/// Adds pattern-matching-related methods to [Doctor].
extension DoctorPatterns on Doctor {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Doctor value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Doctor() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Doctor value)  $default,){
final _that = this;
switch (_that) {
case _Doctor():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Doctor value)?  $default,){
final _that = this;
switch (_that) {
case _Doctor() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  DoctorProfile doctorProfile)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Doctor() when $default != null:
return $default(_that.id,_that.name,_that.doctorProfile);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  DoctorProfile doctorProfile)  $default,) {final _that = this;
switch (_that) {
case _Doctor():
return $default(_that.id,_that.name,_that.doctorProfile);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  DoctorProfile doctorProfile)?  $default,) {final _that = this;
switch (_that) {
case _Doctor() when $default != null:
return $default(_that.id,_that.name,_that.doctorProfile);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Doctor implements Doctor {
  const _Doctor({required this.id, required this.name, required this.doctorProfile});
  factory _Doctor.fromJson(Map<String, dynamic> json) => _$DoctorFromJson(json);

@override final  String id;
@override final  String name;
@override final  DoctorProfile doctorProfile;

/// Create a copy of Doctor
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DoctorCopyWith<_Doctor> get copyWith => __$DoctorCopyWithImpl<_Doctor>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DoctorToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Doctor&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.doctorProfile, doctorProfile) || other.doctorProfile == doctorProfile));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,doctorProfile);

@override
String toString() {
  return 'Doctor(id: $id, name: $name, doctorProfile: $doctorProfile)';
}


}

/// @nodoc
abstract mixin class _$DoctorCopyWith<$Res> implements $DoctorCopyWith<$Res> {
  factory _$DoctorCopyWith(_Doctor value, $Res Function(_Doctor) _then) = __$DoctorCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, DoctorProfile doctorProfile
});


@override $DoctorProfileCopyWith<$Res> get doctorProfile;

}
/// @nodoc
class __$DoctorCopyWithImpl<$Res>
    implements _$DoctorCopyWith<$Res> {
  __$DoctorCopyWithImpl(this._self, this._then);

  final _Doctor _self;
  final $Res Function(_Doctor) _then;

/// Create a copy of Doctor
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? doctorProfile = null,}) {
  return _then(_Doctor(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,doctorProfile: null == doctorProfile ? _self.doctorProfile : doctorProfile // ignore: cast_nullable_to_non_nullable
as DoctorProfile,
  ));
}

/// Create a copy of Doctor
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DoctorProfileCopyWith<$Res> get doctorProfile {
  
  return $DoctorProfileCopyWith<$Res>(_self.doctorProfile, (value) {
    return _then(_self.copyWith(doctorProfile: value));
  });
}
}

// dart format on
