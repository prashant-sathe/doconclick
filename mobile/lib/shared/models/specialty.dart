import 'package:freezed_annotation/freezed_annotation.dart';

part 'specialty.freezed.dart';
part 'specialty.g.dart';

@freezed
abstract class Specialty with _$Specialty {
  const factory Specialty({
    required String name,
    required String color,
  }) = _Specialty;

  factory Specialty.fromJson(Map<String, dynamic> json) => _$SpecialtyFromJson(json);
}
