import 'package:freezed_annotation/freezed_annotation.dart';

part 'message.freezed.dart';
part 'message.g.dart';

@freezed
abstract class ChatSender with _$ChatSender {
  const factory ChatSender({required String id, required String name, required String role}) = _ChatSender;
  factory ChatSender.fromJson(Map<String, dynamic> json) => _$ChatSenderFromJson(json);
}

/// Mirrors Prisma's `Message` model + the nested `sender` the API includes.
@freezed
abstract class ChatMessage with _$ChatMessage {
  const factory ChatMessage({
    required String id,
    required String appointmentId,
    required String senderId,
    required String text,
    DateTime? readAt,
    required DateTime createdAt,
    required ChatSender sender,
  }) = _ChatMessage;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => _$ChatMessageFromJson(json);
}
