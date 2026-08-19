// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'settlement.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Settlement {

 String get id; String get doctorId; int get cashCount; int get onlineCount; double get cashFeeOwed; double get onlinePayoutOwed; double get netAmount; String? get note; DateTime get createdAt;
/// Create a copy of Settlement
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SettlementCopyWith<Settlement> get copyWith => _$SettlementCopyWithImpl<Settlement>(this as Settlement, _$identity);

  /// Serializes this Settlement to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Settlement&&(identical(other.id, id) || other.id == id)&&(identical(other.doctorId, doctorId) || other.doctorId == doctorId)&&(identical(other.cashCount, cashCount) || other.cashCount == cashCount)&&(identical(other.onlineCount, onlineCount) || other.onlineCount == onlineCount)&&(identical(other.cashFeeOwed, cashFeeOwed) || other.cashFeeOwed == cashFeeOwed)&&(identical(other.onlinePayoutOwed, onlinePayoutOwed) || other.onlinePayoutOwed == onlinePayoutOwed)&&(identical(other.netAmount, netAmount) || other.netAmount == netAmount)&&(identical(other.note, note) || other.note == note)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,doctorId,cashCount,onlineCount,cashFeeOwed,onlinePayoutOwed,netAmount,note,createdAt);

@override
String toString() {
  return 'Settlement(id: $id, doctorId: $doctorId, cashCount: $cashCount, onlineCount: $onlineCount, cashFeeOwed: $cashFeeOwed, onlinePayoutOwed: $onlinePayoutOwed, netAmount: $netAmount, note: $note, createdAt: $createdAt)';
}


}

/// @nodoc
abstract mixin class $SettlementCopyWith<$Res>  {
  factory $SettlementCopyWith(Settlement value, $Res Function(Settlement) _then) = _$SettlementCopyWithImpl;
@useResult
$Res call({
 String id, String doctorId, int cashCount, int onlineCount, double cashFeeOwed, double onlinePayoutOwed, double netAmount, String? note, DateTime createdAt
});




}
/// @nodoc
class _$SettlementCopyWithImpl<$Res>
    implements $SettlementCopyWith<$Res> {
  _$SettlementCopyWithImpl(this._self, this._then);

  final Settlement _self;
  final $Res Function(Settlement) _then;

/// Create a copy of Settlement
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? doctorId = null,Object? cashCount = null,Object? onlineCount = null,Object? cashFeeOwed = null,Object? onlinePayoutOwed = null,Object? netAmount = null,Object? note = freezed,Object? createdAt = null,}) {
  return _then(Settlement(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,doctorId: null == doctorId ? _self.doctorId : doctorId // ignore: cast_nullable_to_non_nullable
as String,cashCount: null == cashCount ? _self.cashCount : cashCount // ignore: cast_nullable_to_non_nullable
as int,onlineCount: null == onlineCount ? _self.onlineCount : onlineCount // ignore: cast_nullable_to_non_nullable
as int,cashFeeOwed: null == cashFeeOwed ? _self.cashFeeOwed : cashFeeOwed // ignore: cast_nullable_to_non_nullable
as double,onlinePayoutOwed: null == onlinePayoutOwed ? _self.onlinePayoutOwed : onlinePayoutOwed // ignore: cast_nullable_to_non_nullable
as double,netAmount: null == netAmount ? _self.netAmount : netAmount // ignore: cast_nullable_to_non_nullable
as double,note: freezed == note ? _self.note : note // ignore: cast_nullable_to_non_nullable
as String?,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}

}


/// Adds pattern-matching-related methods to [Settlement].
extension SettlementPatterns on Settlement {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Settlement value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Settlement() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Settlement value)  $default,){
final _that = this;
switch (_that) {
case _Settlement():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Settlement value)?  $default,){
final _that = this;
switch (_that) {
case _Settlement() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String doctorId,  int cashCount,  int onlineCount,  double cashFeeOwed,  double onlinePayoutOwed,  double netAmount,  String? note,  DateTime createdAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Settlement() when $default != null:
return $default(_that.id,_that.doctorId,_that.cashCount,_that.onlineCount,_that.cashFeeOwed,_that.onlinePayoutOwed,_that.netAmount,_that.note,_that.createdAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String doctorId,  int cashCount,  int onlineCount,  double cashFeeOwed,  double onlinePayoutOwed,  double netAmount,  String? note,  DateTime createdAt)  $default,) {final _that = this;
switch (_that) {
case _Settlement():
return $default(_that.id,_that.doctorId,_that.cashCount,_that.onlineCount,_that.cashFeeOwed,_that.onlinePayoutOwed,_that.netAmount,_that.note,_that.createdAt);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String doctorId,  int cashCount,  int onlineCount,  double cashFeeOwed,  double onlinePayoutOwed,  double netAmount,  String? note,  DateTime createdAt)?  $default,) {final _that = this;
switch (_that) {
case _Settlement() when $default != null:
return $default(_that.id,_that.doctorId,_that.cashCount,_that.onlineCount,_that.cashFeeOwed,_that.onlinePayoutOwed,_that.netAmount,_that.note,_that.createdAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Settlement implements Settlement {
  const _Settlement({required this.id, required this.doctorId, this.cashCount = 0, this.onlineCount = 0, this.cashFeeOwed = 0, this.onlinePayoutOwed = 0, required this.netAmount, this.note, required this.createdAt});
  factory _Settlement.fromJson(Map<String, dynamic> json) => _$SettlementFromJson(json);

@override final  String id;
@override final  String doctorId;
@override@JsonKey() final  int cashCount;
@override@JsonKey() final  int onlineCount;
@override@JsonKey() final  double cashFeeOwed;
@override@JsonKey() final  double onlinePayoutOwed;
@override final  double netAmount;
@override final  String? note;
@override final  DateTime createdAt;

/// Create a copy of Settlement
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SettlementCopyWith<_Settlement> get copyWith => __$SettlementCopyWithImpl<_Settlement>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SettlementToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Settlement&&(identical(other.id, id) || other.id == id)&&(identical(other.doctorId, doctorId) || other.doctorId == doctorId)&&(identical(other.cashCount, cashCount) || other.cashCount == cashCount)&&(identical(other.onlineCount, onlineCount) || other.onlineCount == onlineCount)&&(identical(other.cashFeeOwed, cashFeeOwed) || other.cashFeeOwed == cashFeeOwed)&&(identical(other.onlinePayoutOwed, onlinePayoutOwed) || other.onlinePayoutOwed == onlinePayoutOwed)&&(identical(other.netAmount, netAmount) || other.netAmount == netAmount)&&(identical(other.note, note) || other.note == note)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,doctorId,cashCount,onlineCount,cashFeeOwed,onlinePayoutOwed,netAmount,note,createdAt);

@override
String toString() {
  return 'Settlement(id: $id, doctorId: $doctorId, cashCount: $cashCount, onlineCount: $onlineCount, cashFeeOwed: $cashFeeOwed, onlinePayoutOwed: $onlinePayoutOwed, netAmount: $netAmount, note: $note, createdAt: $createdAt)';
}


}

/// @nodoc
abstract mixin class _$SettlementCopyWith<$Res> implements $SettlementCopyWith<$Res> {
  factory _$SettlementCopyWith(_Settlement value, $Res Function(_Settlement) _then) = __$SettlementCopyWithImpl;
@override @useResult
$Res call({
 String id, String doctorId, int cashCount, int onlineCount, double cashFeeOwed, double onlinePayoutOwed, double netAmount, String? note, DateTime createdAt
});




}
/// @nodoc
class __$SettlementCopyWithImpl<$Res>
    implements _$SettlementCopyWith<$Res> {
  __$SettlementCopyWithImpl(this._self, this._then);

  final _Settlement _self;
  final $Res Function(_Settlement) _then;

/// Create a copy of Settlement
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? doctorId = null,Object? cashCount = null,Object? onlineCount = null,Object? cashFeeOwed = null,Object? onlinePayoutOwed = null,Object? netAmount = null,Object? note = freezed,Object? createdAt = null,}) {
  return _then(_Settlement(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,doctorId: null == doctorId ? _self.doctorId : doctorId // ignore: cast_nullable_to_non_nullable
as String,cashCount: null == cashCount ? _self.cashCount : cashCount // ignore: cast_nullable_to_non_nullable
as int,onlineCount: null == onlineCount ? _self.onlineCount : onlineCount // ignore: cast_nullable_to_non_nullable
as int,cashFeeOwed: null == cashFeeOwed ? _self.cashFeeOwed : cashFeeOwed // ignore: cast_nullable_to_non_nullable
as double,onlinePayoutOwed: null == onlinePayoutOwed ? _self.onlinePayoutOwed : onlinePayoutOwed // ignore: cast_nullable_to_non_nullable
as double,netAmount: null == netAmount ? _self.netAmount : netAmount // ignore: cast_nullable_to_non_nullable
as double,note: freezed == note ? _self.note : note // ignore: cast_nullable_to_non_nullable
as String?,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}


}

// dart format on
