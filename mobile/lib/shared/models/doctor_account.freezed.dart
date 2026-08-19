// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'doctor_account.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$DoctorAccount {

 String get id; String get name; String get mobile; String? get email; DoctorFullProfile? get doctorProfile;
/// Create a copy of DoctorAccount
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DoctorAccountCopyWith<DoctorAccount> get copyWith => _$DoctorAccountCopyWithImpl<DoctorAccount>(this as DoctorAccount, _$identity);

  /// Serializes this DoctorAccount to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DoctorAccount&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.mobile, mobile) || other.mobile == mobile)&&(identical(other.email, email) || other.email == email)&&(identical(other.doctorProfile, doctorProfile) || other.doctorProfile == doctorProfile));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,mobile,email,doctorProfile);

@override
String toString() {
  return 'DoctorAccount(id: $id, name: $name, mobile: $mobile, email: $email, doctorProfile: $doctorProfile)';
}


}

/// @nodoc
abstract mixin class $DoctorAccountCopyWith<$Res>  {
  factory $DoctorAccountCopyWith(DoctorAccount value, $Res Function(DoctorAccount) _then) = _$DoctorAccountCopyWithImpl;
@useResult
$Res call({
 String id, String name, String mobile, String? email, DoctorFullProfile? doctorProfile
});


$DoctorFullProfileCopyWith<$Res>? get doctorProfile;

}
/// @nodoc
class _$DoctorAccountCopyWithImpl<$Res>
    implements $DoctorAccountCopyWith<$Res> {
  _$DoctorAccountCopyWithImpl(this._self, this._then);

  final DoctorAccount _self;
  final $Res Function(DoctorAccount) _then;

/// Create a copy of DoctorAccount
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? mobile = null,Object? email = freezed,Object? doctorProfile = freezed,}) {
  return _then(DoctorAccount(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,mobile: null == mobile ? _self.mobile : mobile // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,doctorProfile: freezed == doctorProfile ? _self.doctorProfile : doctorProfile // ignore: cast_nullable_to_non_nullable
as DoctorFullProfile?,
  ));
}
/// Create a copy of DoctorAccount
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DoctorFullProfileCopyWith<$Res>? get doctorProfile {
    if (_self.doctorProfile == null) {
    return null;
  }

  return $DoctorFullProfileCopyWith<$Res>(_self.doctorProfile!, (value) {
    return _then(_self.copyWith(doctorProfile: value));
  });
}
}


/// Adds pattern-matching-related methods to [DoctorAccount].
extension DoctorAccountPatterns on DoctorAccount {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DoctorAccount value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DoctorAccount() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DoctorAccount value)  $default,){
final _that = this;
switch (_that) {
case _DoctorAccount():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DoctorAccount value)?  $default,){
final _that = this;
switch (_that) {
case _DoctorAccount() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String mobile,  String? email,  DoctorFullProfile? doctorProfile)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DoctorAccount() when $default != null:
return $default(_that.id,_that.name,_that.mobile,_that.email,_that.doctorProfile);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String mobile,  String? email,  DoctorFullProfile? doctorProfile)  $default,) {final _that = this;
switch (_that) {
case _DoctorAccount():
return $default(_that.id,_that.name,_that.mobile,_that.email,_that.doctorProfile);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String mobile,  String? email,  DoctorFullProfile? doctorProfile)?  $default,) {final _that = this;
switch (_that) {
case _DoctorAccount() when $default != null:
return $default(_that.id,_that.name,_that.mobile,_that.email,_that.doctorProfile);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DoctorAccount implements DoctorAccount {
  const _DoctorAccount({required this.id, required this.name, required this.mobile, this.email, this.doctorProfile});
  factory _DoctorAccount.fromJson(Map<String, dynamic> json) => _$DoctorAccountFromJson(json);

@override final  String id;
@override final  String name;
@override final  String mobile;
@override final  String? email;
@override final  DoctorFullProfile? doctorProfile;

/// Create a copy of DoctorAccount
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DoctorAccountCopyWith<_DoctorAccount> get copyWith => __$DoctorAccountCopyWithImpl<_DoctorAccount>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DoctorAccountToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DoctorAccount&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.mobile, mobile) || other.mobile == mobile)&&(identical(other.email, email) || other.email == email)&&(identical(other.doctorProfile, doctorProfile) || other.doctorProfile == doctorProfile));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,mobile,email,doctorProfile);

@override
String toString() {
  return 'DoctorAccount(id: $id, name: $name, mobile: $mobile, email: $email, doctorProfile: $doctorProfile)';
}


}

/// @nodoc
abstract mixin class _$DoctorAccountCopyWith<$Res> implements $DoctorAccountCopyWith<$Res> {
  factory _$DoctorAccountCopyWith(_DoctorAccount value, $Res Function(_DoctorAccount) _then) = __$DoctorAccountCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String mobile, String? email, DoctorFullProfile? doctorProfile
});


@override $DoctorFullProfileCopyWith<$Res>? get doctorProfile;

}
/// @nodoc
class __$DoctorAccountCopyWithImpl<$Res>
    implements _$DoctorAccountCopyWith<$Res> {
  __$DoctorAccountCopyWithImpl(this._self, this._then);

  final _DoctorAccount _self;
  final $Res Function(_DoctorAccount) _then;

/// Create a copy of DoctorAccount
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? mobile = null,Object? email = freezed,Object? doctorProfile = freezed,}) {
  return _then(_DoctorAccount(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,mobile: null == mobile ? _self.mobile : mobile // ignore: cast_nullable_to_non_nullable
as String,email: freezed == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String?,doctorProfile: freezed == doctorProfile ? _self.doctorProfile : doctorProfile // ignore: cast_nullable_to_non_nullable
as DoctorFullProfile?,
  ));
}

/// Create a copy of DoctorAccount
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DoctorFullProfileCopyWith<$Res>? get doctorProfile {
    if (_self.doctorProfile == null) {
    return null;
  }

  return $DoctorFullProfileCopyWith<$Res>(_self.doctorProfile!, (value) {
    return _then(_self.copyWith(doctorProfile: value));
  });
}
}


/// @nodoc
mixin _$DoctorFullProfile {

 String? get photoUrl; String? get qualification; String? get medRegNo; String get specialty; int get experience; double get consultFee; double get videoFee; double get homeVisitFee; String get availability; int get radius; double? get lat; double? get lng; String get languages; String? get bio; bool get offersHomeVisit; bool get isVerified; double get avgRating; int get totalReviews; String? get bankDetails; String get status; bool get registrationFeePaid; String get registrationFeeStatus; String? get medRegCertUrl; String? get degreeCertUrl; String? get kycDocUrl; String? get address; String? get clinicName; String? get clinicPhotoUrl; DateTime? get trialEndsAt; DateTime? get subscriptionPaidUntil;
/// Create a copy of DoctorFullProfile
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DoctorFullProfileCopyWith<DoctorFullProfile> get copyWith => _$DoctorFullProfileCopyWithImpl<DoctorFullProfile>(this as DoctorFullProfile, _$identity);

  /// Serializes this DoctorFullProfile to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DoctorFullProfile&&(identical(other.photoUrl, photoUrl) || other.photoUrl == photoUrl)&&(identical(other.qualification, qualification) || other.qualification == qualification)&&(identical(other.medRegNo, medRegNo) || other.medRegNo == medRegNo)&&(identical(other.specialty, specialty) || other.specialty == specialty)&&(identical(other.experience, experience) || other.experience == experience)&&(identical(other.consultFee, consultFee) || other.consultFee == consultFee)&&(identical(other.videoFee, videoFee) || other.videoFee == videoFee)&&(identical(other.homeVisitFee, homeVisitFee) || other.homeVisitFee == homeVisitFee)&&(identical(other.availability, availability) || other.availability == availability)&&(identical(other.radius, radius) || other.radius == radius)&&(identical(other.lat, lat) || other.lat == lat)&&(identical(other.lng, lng) || other.lng == lng)&&(identical(other.languages, languages) || other.languages == languages)&&(identical(other.bio, bio) || other.bio == bio)&&(identical(other.offersHomeVisit, offersHomeVisit) || other.offersHomeVisit == offersHomeVisit)&&(identical(other.isVerified, isVerified) || other.isVerified == isVerified)&&(identical(other.avgRating, avgRating) || other.avgRating == avgRating)&&(identical(other.totalReviews, totalReviews) || other.totalReviews == totalReviews)&&(identical(other.bankDetails, bankDetails) || other.bankDetails == bankDetails)&&(identical(other.status, status) || other.status == status)&&(identical(other.registrationFeePaid, registrationFeePaid) || other.registrationFeePaid == registrationFeePaid)&&(identical(other.registrationFeeStatus, registrationFeeStatus) || other.registrationFeeStatus == registrationFeeStatus)&&(identical(other.medRegCertUrl, medRegCertUrl) || other.medRegCertUrl == medRegCertUrl)&&(identical(other.degreeCertUrl, degreeCertUrl) || other.degreeCertUrl == degreeCertUrl)&&(identical(other.kycDocUrl, kycDocUrl) || other.kycDocUrl == kycDocUrl)&&(identical(other.address, address) || other.address == address)&&(identical(other.clinicName, clinicName) || other.clinicName == clinicName)&&(identical(other.clinicPhotoUrl, clinicPhotoUrl) || other.clinicPhotoUrl == clinicPhotoUrl)&&(identical(other.trialEndsAt, trialEndsAt) || other.trialEndsAt == trialEndsAt)&&(identical(other.subscriptionPaidUntil, subscriptionPaidUntil) || other.subscriptionPaidUntil == subscriptionPaidUntil));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,photoUrl,qualification,medRegNo,specialty,experience,consultFee,videoFee,homeVisitFee,availability,radius,lat,lng,languages,bio,offersHomeVisit,isVerified,avgRating,totalReviews,bankDetails,status,registrationFeePaid,registrationFeeStatus,medRegCertUrl,degreeCertUrl,kycDocUrl,address,clinicName,clinicPhotoUrl,trialEndsAt,subscriptionPaidUntil]);

@override
String toString() {
  return 'DoctorFullProfile(photoUrl: $photoUrl, qualification: $qualification, medRegNo: $medRegNo, specialty: $specialty, experience: $experience, consultFee: $consultFee, videoFee: $videoFee, homeVisitFee: $homeVisitFee, availability: $availability, radius: $radius, lat: $lat, lng: $lng, languages: $languages, bio: $bio, offersHomeVisit: $offersHomeVisit, isVerified: $isVerified, avgRating: $avgRating, totalReviews: $totalReviews, bankDetails: $bankDetails, status: $status, registrationFeePaid: $registrationFeePaid, registrationFeeStatus: $registrationFeeStatus, medRegCertUrl: $medRegCertUrl, degreeCertUrl: $degreeCertUrl, kycDocUrl: $kycDocUrl, address: $address, clinicName: $clinicName, clinicPhotoUrl: $clinicPhotoUrl, trialEndsAt: $trialEndsAt, subscriptionPaidUntil: $subscriptionPaidUntil)';
}


}

/// @nodoc
abstract mixin class $DoctorFullProfileCopyWith<$Res>  {
  factory $DoctorFullProfileCopyWith(DoctorFullProfile value, $Res Function(DoctorFullProfile) _then) = _$DoctorFullProfileCopyWithImpl;
@useResult
$Res call({
 String? photoUrl, String? qualification, String? medRegNo, String specialty, int experience, double consultFee, double videoFee, double homeVisitFee, String availability, int radius, double? lat, double? lng, String languages, String? bio, bool offersHomeVisit, bool isVerified, double avgRating, int totalReviews, String? bankDetails, String status, bool registrationFeePaid, String registrationFeeStatus, String? medRegCertUrl, String? degreeCertUrl, String? kycDocUrl, String? address, String? clinicName, String? clinicPhotoUrl, DateTime? trialEndsAt, DateTime? subscriptionPaidUntil
});




}
/// @nodoc
class _$DoctorFullProfileCopyWithImpl<$Res>
    implements $DoctorFullProfileCopyWith<$Res> {
  _$DoctorFullProfileCopyWithImpl(this._self, this._then);

  final DoctorFullProfile _self;
  final $Res Function(DoctorFullProfile) _then;

/// Create a copy of DoctorFullProfile
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? photoUrl = freezed,Object? qualification = freezed,Object? medRegNo = freezed,Object? specialty = null,Object? experience = null,Object? consultFee = null,Object? videoFee = null,Object? homeVisitFee = null,Object? availability = null,Object? radius = null,Object? lat = freezed,Object? lng = freezed,Object? languages = null,Object? bio = freezed,Object? offersHomeVisit = null,Object? isVerified = null,Object? avgRating = null,Object? totalReviews = null,Object? bankDetails = freezed,Object? status = null,Object? registrationFeePaid = null,Object? registrationFeeStatus = null,Object? medRegCertUrl = freezed,Object? degreeCertUrl = freezed,Object? kycDocUrl = freezed,Object? address = freezed,Object? clinicName = freezed,Object? clinicPhotoUrl = freezed,Object? trialEndsAt = freezed,Object? subscriptionPaidUntil = freezed,}) {
  return _then(DoctorFullProfile(
photoUrl: freezed == photoUrl ? _self.photoUrl : photoUrl // ignore: cast_nullable_to_non_nullable
as String?,qualification: freezed == qualification ? _self.qualification : qualification // ignore: cast_nullable_to_non_nullable
as String?,medRegNo: freezed == medRegNo ? _self.medRegNo : medRegNo // ignore: cast_nullable_to_non_nullable
as String?,specialty: null == specialty ? _self.specialty : specialty // ignore: cast_nullable_to_non_nullable
as String,experience: null == experience ? _self.experience : experience // ignore: cast_nullable_to_non_nullable
as int,consultFee: null == consultFee ? _self.consultFee : consultFee // ignore: cast_nullable_to_non_nullable
as double,videoFee: null == videoFee ? _self.videoFee : videoFee // ignore: cast_nullable_to_non_nullable
as double,homeVisitFee: null == homeVisitFee ? _self.homeVisitFee : homeVisitFee // ignore: cast_nullable_to_non_nullable
as double,availability: null == availability ? _self.availability : availability // ignore: cast_nullable_to_non_nullable
as String,radius: null == radius ? _self.radius : radius // ignore: cast_nullable_to_non_nullable
as int,lat: freezed == lat ? _self.lat : lat // ignore: cast_nullable_to_non_nullable
as double?,lng: freezed == lng ? _self.lng : lng // ignore: cast_nullable_to_non_nullable
as double?,languages: null == languages ? _self.languages : languages // ignore: cast_nullable_to_non_nullable
as String,bio: freezed == bio ? _self.bio : bio // ignore: cast_nullable_to_non_nullable
as String?,offersHomeVisit: null == offersHomeVisit ? _self.offersHomeVisit : offersHomeVisit // ignore: cast_nullable_to_non_nullable
as bool,isVerified: null == isVerified ? _self.isVerified : isVerified // ignore: cast_nullable_to_non_nullable
as bool,avgRating: null == avgRating ? _self.avgRating : avgRating // ignore: cast_nullable_to_non_nullable
as double,totalReviews: null == totalReviews ? _self.totalReviews : totalReviews // ignore: cast_nullable_to_non_nullable
as int,bankDetails: freezed == bankDetails ? _self.bankDetails : bankDetails // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,registrationFeePaid: null == registrationFeePaid ? _self.registrationFeePaid : registrationFeePaid // ignore: cast_nullable_to_non_nullable
as bool,registrationFeeStatus: null == registrationFeeStatus ? _self.registrationFeeStatus : registrationFeeStatus // ignore: cast_nullable_to_non_nullable
as String,medRegCertUrl: freezed == medRegCertUrl ? _self.medRegCertUrl : medRegCertUrl // ignore: cast_nullable_to_non_nullable
as String?,degreeCertUrl: freezed == degreeCertUrl ? _self.degreeCertUrl : degreeCertUrl // ignore: cast_nullable_to_non_nullable
as String?,kycDocUrl: freezed == kycDocUrl ? _self.kycDocUrl : kycDocUrl // ignore: cast_nullable_to_non_nullable
as String?,address: freezed == address ? _self.address : address // ignore: cast_nullable_to_non_nullable
as String?,clinicName: freezed == clinicName ? _self.clinicName : clinicName // ignore: cast_nullable_to_non_nullable
as String?,clinicPhotoUrl: freezed == clinicPhotoUrl ? _self.clinicPhotoUrl : clinicPhotoUrl // ignore: cast_nullable_to_non_nullable
as String?,trialEndsAt: freezed == trialEndsAt ? _self.trialEndsAt : trialEndsAt // ignore: cast_nullable_to_non_nullable
as DateTime?,subscriptionPaidUntil: freezed == subscriptionPaidUntil ? _self.subscriptionPaidUntil : subscriptionPaidUntil // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

}


/// Adds pattern-matching-related methods to [DoctorFullProfile].
extension DoctorFullProfilePatterns on DoctorFullProfile {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DoctorFullProfile value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DoctorFullProfile() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DoctorFullProfile value)  $default,){
final _that = this;
switch (_that) {
case _DoctorFullProfile():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DoctorFullProfile value)?  $default,){
final _that = this;
switch (_that) {
case _DoctorFullProfile() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? photoUrl,  String? qualification,  String? medRegNo,  String specialty,  int experience,  double consultFee,  double videoFee,  double homeVisitFee,  String availability,  int radius,  double? lat,  double? lng,  String languages,  String? bio,  bool offersHomeVisit,  bool isVerified,  double avgRating,  int totalReviews,  String? bankDetails,  String status,  bool registrationFeePaid,  String registrationFeeStatus,  String? medRegCertUrl,  String? degreeCertUrl,  String? kycDocUrl,  String? address,  String? clinicName,  String? clinicPhotoUrl,  DateTime? trialEndsAt,  DateTime? subscriptionPaidUntil)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DoctorFullProfile() when $default != null:
return $default(_that.photoUrl,_that.qualification,_that.medRegNo,_that.specialty,_that.experience,_that.consultFee,_that.videoFee,_that.homeVisitFee,_that.availability,_that.radius,_that.lat,_that.lng,_that.languages,_that.bio,_that.offersHomeVisit,_that.isVerified,_that.avgRating,_that.totalReviews,_that.bankDetails,_that.status,_that.registrationFeePaid,_that.registrationFeeStatus,_that.medRegCertUrl,_that.degreeCertUrl,_that.kycDocUrl,_that.address,_that.clinicName,_that.clinicPhotoUrl,_that.trialEndsAt,_that.subscriptionPaidUntil);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? photoUrl,  String? qualification,  String? medRegNo,  String specialty,  int experience,  double consultFee,  double videoFee,  double homeVisitFee,  String availability,  int radius,  double? lat,  double? lng,  String languages,  String? bio,  bool offersHomeVisit,  bool isVerified,  double avgRating,  int totalReviews,  String? bankDetails,  String status,  bool registrationFeePaid,  String registrationFeeStatus,  String? medRegCertUrl,  String? degreeCertUrl,  String? kycDocUrl,  String? address,  String? clinicName,  String? clinicPhotoUrl,  DateTime? trialEndsAt,  DateTime? subscriptionPaidUntil)  $default,) {final _that = this;
switch (_that) {
case _DoctorFullProfile():
return $default(_that.photoUrl,_that.qualification,_that.medRegNo,_that.specialty,_that.experience,_that.consultFee,_that.videoFee,_that.homeVisitFee,_that.availability,_that.radius,_that.lat,_that.lng,_that.languages,_that.bio,_that.offersHomeVisit,_that.isVerified,_that.avgRating,_that.totalReviews,_that.bankDetails,_that.status,_that.registrationFeePaid,_that.registrationFeeStatus,_that.medRegCertUrl,_that.degreeCertUrl,_that.kycDocUrl,_that.address,_that.clinicName,_that.clinicPhotoUrl,_that.trialEndsAt,_that.subscriptionPaidUntil);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? photoUrl,  String? qualification,  String? medRegNo,  String specialty,  int experience,  double consultFee,  double videoFee,  double homeVisitFee,  String availability,  int radius,  double? lat,  double? lng,  String languages,  String? bio,  bool offersHomeVisit,  bool isVerified,  double avgRating,  int totalReviews,  String? bankDetails,  String status,  bool registrationFeePaid,  String registrationFeeStatus,  String? medRegCertUrl,  String? degreeCertUrl,  String? kycDocUrl,  String? address,  String? clinicName,  String? clinicPhotoUrl,  DateTime? trialEndsAt,  DateTime? subscriptionPaidUntil)?  $default,) {final _that = this;
switch (_that) {
case _DoctorFullProfile() when $default != null:
return $default(_that.photoUrl,_that.qualification,_that.medRegNo,_that.specialty,_that.experience,_that.consultFee,_that.videoFee,_that.homeVisitFee,_that.availability,_that.radius,_that.lat,_that.lng,_that.languages,_that.bio,_that.offersHomeVisit,_that.isVerified,_that.avgRating,_that.totalReviews,_that.bankDetails,_that.status,_that.registrationFeePaid,_that.registrationFeeStatus,_that.medRegCertUrl,_that.degreeCertUrl,_that.kycDocUrl,_that.address,_that.clinicName,_that.clinicPhotoUrl,_that.trialEndsAt,_that.subscriptionPaidUntil);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DoctorFullProfile implements DoctorFullProfile {
  const _DoctorFullProfile({this.photoUrl, this.qualification, this.medRegNo, this.specialty = 'General Physician', this.experience = 0, this.consultFee = 0, this.videoFee = 0, this.homeVisitFee = 0, this.availability = 'Mon-Fri, 9AM-5PM', this.radius = 10, this.lat, this.lng, this.languages = 'English, Hindi', this.bio, this.offersHomeVisit = true, this.isVerified = false, this.avgRating = 0, this.totalReviews = 0, this.bankDetails, this.status = 'PENDING', this.registrationFeePaid = false, this.registrationFeeStatus = 'PENDING', this.medRegCertUrl, this.degreeCertUrl, this.kycDocUrl, this.address, this.clinicName, this.clinicPhotoUrl, this.trialEndsAt, this.subscriptionPaidUntil});
  factory _DoctorFullProfile.fromJson(Map<String, dynamic> json) => _$DoctorFullProfileFromJson(json);

@override final  String? photoUrl;
@override final  String? qualification;
@override final  String? medRegNo;
@override@JsonKey() final  String specialty;
@override@JsonKey() final  int experience;
@override@JsonKey() final  double consultFee;
@override@JsonKey() final  double videoFee;
@override@JsonKey() final  double homeVisitFee;
@override@JsonKey() final  String availability;
@override@JsonKey() final  int radius;
@override final  double? lat;
@override final  double? lng;
@override@JsonKey() final  String languages;
@override final  String? bio;
@override@JsonKey() final  bool offersHomeVisit;
@override@JsonKey() final  bool isVerified;
@override@JsonKey() final  double avgRating;
@override@JsonKey() final  int totalReviews;
@override final  String? bankDetails;
@override@JsonKey() final  String status;
@override@JsonKey() final  bool registrationFeePaid;
@override@JsonKey() final  String registrationFeeStatus;
@override final  String? medRegCertUrl;
@override final  String? degreeCertUrl;
@override final  String? kycDocUrl;
@override final  String? address;
@override final  String? clinicName;
@override final  String? clinicPhotoUrl;
@override final  DateTime? trialEndsAt;
@override final  DateTime? subscriptionPaidUntil;

/// Create a copy of DoctorFullProfile
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DoctorFullProfileCopyWith<_DoctorFullProfile> get copyWith => __$DoctorFullProfileCopyWithImpl<_DoctorFullProfile>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DoctorFullProfileToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DoctorFullProfile&&(identical(other.photoUrl, photoUrl) || other.photoUrl == photoUrl)&&(identical(other.qualification, qualification) || other.qualification == qualification)&&(identical(other.medRegNo, medRegNo) || other.medRegNo == medRegNo)&&(identical(other.specialty, specialty) || other.specialty == specialty)&&(identical(other.experience, experience) || other.experience == experience)&&(identical(other.consultFee, consultFee) || other.consultFee == consultFee)&&(identical(other.videoFee, videoFee) || other.videoFee == videoFee)&&(identical(other.homeVisitFee, homeVisitFee) || other.homeVisitFee == homeVisitFee)&&(identical(other.availability, availability) || other.availability == availability)&&(identical(other.radius, radius) || other.radius == radius)&&(identical(other.lat, lat) || other.lat == lat)&&(identical(other.lng, lng) || other.lng == lng)&&(identical(other.languages, languages) || other.languages == languages)&&(identical(other.bio, bio) || other.bio == bio)&&(identical(other.offersHomeVisit, offersHomeVisit) || other.offersHomeVisit == offersHomeVisit)&&(identical(other.isVerified, isVerified) || other.isVerified == isVerified)&&(identical(other.avgRating, avgRating) || other.avgRating == avgRating)&&(identical(other.totalReviews, totalReviews) || other.totalReviews == totalReviews)&&(identical(other.bankDetails, bankDetails) || other.bankDetails == bankDetails)&&(identical(other.status, status) || other.status == status)&&(identical(other.registrationFeePaid, registrationFeePaid) || other.registrationFeePaid == registrationFeePaid)&&(identical(other.registrationFeeStatus, registrationFeeStatus) || other.registrationFeeStatus == registrationFeeStatus)&&(identical(other.medRegCertUrl, medRegCertUrl) || other.medRegCertUrl == medRegCertUrl)&&(identical(other.degreeCertUrl, degreeCertUrl) || other.degreeCertUrl == degreeCertUrl)&&(identical(other.kycDocUrl, kycDocUrl) || other.kycDocUrl == kycDocUrl)&&(identical(other.address, address) || other.address == address)&&(identical(other.clinicName, clinicName) || other.clinicName == clinicName)&&(identical(other.clinicPhotoUrl, clinicPhotoUrl) || other.clinicPhotoUrl == clinicPhotoUrl)&&(identical(other.trialEndsAt, trialEndsAt) || other.trialEndsAt == trialEndsAt)&&(identical(other.subscriptionPaidUntil, subscriptionPaidUntil) || other.subscriptionPaidUntil == subscriptionPaidUntil));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,photoUrl,qualification,medRegNo,specialty,experience,consultFee,videoFee,homeVisitFee,availability,radius,lat,lng,languages,bio,offersHomeVisit,isVerified,avgRating,totalReviews,bankDetails,status,registrationFeePaid,registrationFeeStatus,medRegCertUrl,degreeCertUrl,kycDocUrl,address,clinicName,clinicPhotoUrl,trialEndsAt,subscriptionPaidUntil]);

@override
String toString() {
  return 'DoctorFullProfile(photoUrl: $photoUrl, qualification: $qualification, medRegNo: $medRegNo, specialty: $specialty, experience: $experience, consultFee: $consultFee, videoFee: $videoFee, homeVisitFee: $homeVisitFee, availability: $availability, radius: $radius, lat: $lat, lng: $lng, languages: $languages, bio: $bio, offersHomeVisit: $offersHomeVisit, isVerified: $isVerified, avgRating: $avgRating, totalReviews: $totalReviews, bankDetails: $bankDetails, status: $status, registrationFeePaid: $registrationFeePaid, registrationFeeStatus: $registrationFeeStatus, medRegCertUrl: $medRegCertUrl, degreeCertUrl: $degreeCertUrl, kycDocUrl: $kycDocUrl, address: $address, clinicName: $clinicName, clinicPhotoUrl: $clinicPhotoUrl, trialEndsAt: $trialEndsAt, subscriptionPaidUntil: $subscriptionPaidUntil)';
}


}

/// @nodoc
abstract mixin class _$DoctorFullProfileCopyWith<$Res> implements $DoctorFullProfileCopyWith<$Res> {
  factory _$DoctorFullProfileCopyWith(_DoctorFullProfile value, $Res Function(_DoctorFullProfile) _then) = __$DoctorFullProfileCopyWithImpl;
@override @useResult
$Res call({
 String? photoUrl, String? qualification, String? medRegNo, String specialty, int experience, double consultFee, double videoFee, double homeVisitFee, String availability, int radius, double? lat, double? lng, String languages, String? bio, bool offersHomeVisit, bool isVerified, double avgRating, int totalReviews, String? bankDetails, String status, bool registrationFeePaid, String registrationFeeStatus, String? medRegCertUrl, String? degreeCertUrl, String? kycDocUrl, String? address, String? clinicName, String? clinicPhotoUrl, DateTime? trialEndsAt, DateTime? subscriptionPaidUntil
});




}
/// @nodoc
class __$DoctorFullProfileCopyWithImpl<$Res>
    implements _$DoctorFullProfileCopyWith<$Res> {
  __$DoctorFullProfileCopyWithImpl(this._self, this._then);

  final _DoctorFullProfile _self;
  final $Res Function(_DoctorFullProfile) _then;

/// Create a copy of DoctorFullProfile
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? photoUrl = freezed,Object? qualification = freezed,Object? medRegNo = freezed,Object? specialty = null,Object? experience = null,Object? consultFee = null,Object? videoFee = null,Object? homeVisitFee = null,Object? availability = null,Object? radius = null,Object? lat = freezed,Object? lng = freezed,Object? languages = null,Object? bio = freezed,Object? offersHomeVisit = null,Object? isVerified = null,Object? avgRating = null,Object? totalReviews = null,Object? bankDetails = freezed,Object? status = null,Object? registrationFeePaid = null,Object? registrationFeeStatus = null,Object? medRegCertUrl = freezed,Object? degreeCertUrl = freezed,Object? kycDocUrl = freezed,Object? address = freezed,Object? clinicName = freezed,Object? clinicPhotoUrl = freezed,Object? trialEndsAt = freezed,Object? subscriptionPaidUntil = freezed,}) {
  return _then(_DoctorFullProfile(
photoUrl: freezed == photoUrl ? _self.photoUrl : photoUrl // ignore: cast_nullable_to_non_nullable
as String?,qualification: freezed == qualification ? _self.qualification : qualification // ignore: cast_nullable_to_non_nullable
as String?,medRegNo: freezed == medRegNo ? _self.medRegNo : medRegNo // ignore: cast_nullable_to_non_nullable
as String?,specialty: null == specialty ? _self.specialty : specialty // ignore: cast_nullable_to_non_nullable
as String,experience: null == experience ? _self.experience : experience // ignore: cast_nullable_to_non_nullable
as int,consultFee: null == consultFee ? _self.consultFee : consultFee // ignore: cast_nullable_to_non_nullable
as double,videoFee: null == videoFee ? _self.videoFee : videoFee // ignore: cast_nullable_to_non_nullable
as double,homeVisitFee: null == homeVisitFee ? _self.homeVisitFee : homeVisitFee // ignore: cast_nullable_to_non_nullable
as double,availability: null == availability ? _self.availability : availability // ignore: cast_nullable_to_non_nullable
as String,radius: null == radius ? _self.radius : radius // ignore: cast_nullable_to_non_nullable
as int,lat: freezed == lat ? _self.lat : lat // ignore: cast_nullable_to_non_nullable
as double?,lng: freezed == lng ? _self.lng : lng // ignore: cast_nullable_to_non_nullable
as double?,languages: null == languages ? _self.languages : languages // ignore: cast_nullable_to_non_nullable
as String,bio: freezed == bio ? _self.bio : bio // ignore: cast_nullable_to_non_nullable
as String?,offersHomeVisit: null == offersHomeVisit ? _self.offersHomeVisit : offersHomeVisit // ignore: cast_nullable_to_non_nullable
as bool,isVerified: null == isVerified ? _self.isVerified : isVerified // ignore: cast_nullable_to_non_nullable
as bool,avgRating: null == avgRating ? _self.avgRating : avgRating // ignore: cast_nullable_to_non_nullable
as double,totalReviews: null == totalReviews ? _self.totalReviews : totalReviews // ignore: cast_nullable_to_non_nullable
as int,bankDetails: freezed == bankDetails ? _self.bankDetails : bankDetails // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,registrationFeePaid: null == registrationFeePaid ? _self.registrationFeePaid : registrationFeePaid // ignore: cast_nullable_to_non_nullable
as bool,registrationFeeStatus: null == registrationFeeStatus ? _self.registrationFeeStatus : registrationFeeStatus // ignore: cast_nullable_to_non_nullable
as String,medRegCertUrl: freezed == medRegCertUrl ? _self.medRegCertUrl : medRegCertUrl // ignore: cast_nullable_to_non_nullable
as String?,degreeCertUrl: freezed == degreeCertUrl ? _self.degreeCertUrl : degreeCertUrl // ignore: cast_nullable_to_non_nullable
as String?,kycDocUrl: freezed == kycDocUrl ? _self.kycDocUrl : kycDocUrl // ignore: cast_nullable_to_non_nullable
as String?,address: freezed == address ? _self.address : address // ignore: cast_nullable_to_non_nullable
as String?,clinicName: freezed == clinicName ? _self.clinicName : clinicName // ignore: cast_nullable_to_non_nullable
as String?,clinicPhotoUrl: freezed == clinicPhotoUrl ? _self.clinicPhotoUrl : clinicPhotoUrl // ignore: cast_nullable_to_non_nullable
as String?,trialEndsAt: freezed == trialEndsAt ? _self.trialEndsAt : trialEndsAt // ignore: cast_nullable_to_non_nullable
as DateTime?,subscriptionPaidUntil: freezed == subscriptionPaidUntil ? _self.subscriptionPaidUntil : subscriptionPaidUntil // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}


}

// dart format on
