// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'settlement.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Settlement _$SettlementFromJson(Map<String, dynamic> json) => _Settlement(
  id: json['id'] as String,
  doctorId: json['doctorId'] as String,
  cashCount: (json['cashCount'] as num?)?.toInt() ?? 0,
  onlineCount: (json['onlineCount'] as num?)?.toInt() ?? 0,
  cashFeeOwed: (json['cashFeeOwed'] as num?)?.toDouble() ?? 0,
  onlinePayoutOwed: (json['onlinePayoutOwed'] as num?)?.toDouble() ?? 0,
  netAmount: (json['netAmount'] as num).toDouble(),
  note: json['note'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$SettlementToJson(_Settlement instance) =>
    <String, dynamic>{
      'id': instance.id,
      'doctorId': instance.doctorId,
      'cashCount': instance.cashCount,
      'onlineCount': instance.onlineCount,
      'cashFeeOwed': instance.cashFeeOwed,
      'onlinePayoutOwed': instance.onlinePayoutOwed,
      'netAmount': instance.netAmount,
      'note': instance.note,
      'createdAt': instance.createdAt.toIso8601String(),
    };
