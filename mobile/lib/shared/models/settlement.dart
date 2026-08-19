import 'package:freezed_annotation/freezed_annotation.dart';

part 'settlement.freezed.dart';
part 'settlement.g.dart';

@freezed
abstract class Settlement with _$Settlement {
  const factory Settlement({
    required String id,
    required String doctorId,
    @Default(0) int cashCount,
    @Default(0) int onlineCount,
    @Default(0) double cashFeeOwed,
    @Default(0) double onlinePayoutOwed,
    required double netAmount,
    String? note,
    required DateTime createdAt,
  }) = _Settlement;

  factory Settlement.fromJson(Map<String, dynamic> json) => _$SettlementFromJson(json);
}
