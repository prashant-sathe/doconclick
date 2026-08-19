// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Review _$ReviewFromJson(Map<String, dynamic> json) => _Review(
  id: json['id'] as String,
  patientId: json['patientId'] as String,
  doctorId: json['doctorId'] as String,
  appointmentId: json['appointmentId'] as String,
  rating: (json['rating'] as num).toInt(),
  comment: json['comment'] as String?,
);

Map<String, dynamic> _$ReviewToJson(_Review instance) => <String, dynamic>{
  'id': instance.id,
  'patientId': instance.patientId,
  'doctorId': instance.doctorId,
  'appointmentId': instance.appointmentId,
  'rating': instance.rating,
  'comment': instance.comment,
};
