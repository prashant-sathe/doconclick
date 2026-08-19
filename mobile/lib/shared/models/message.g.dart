// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'message.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ChatSender _$ChatSenderFromJson(Map<String, dynamic> json) => _ChatSender(
  id: json['id'] as String,
  name: json['name'] as String,
  role: json['role'] as String,
);

Map<String, dynamic> _$ChatSenderToJson(_ChatSender instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'role': instance.role,
    };

_ChatMessage _$ChatMessageFromJson(Map<String, dynamic> json) => _ChatMessage(
  id: json['id'] as String,
  appointmentId: json['appointmentId'] as String,
  senderId: json['senderId'] as String,
  text: json['text'] as String,
  readAt: json['readAt'] == null
      ? null
      : DateTime.parse(json['readAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  sender: ChatSender.fromJson(json['sender'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ChatMessageToJson(_ChatMessage instance) =>
    <String, dynamic>{
      'id': instance.id,
      'appointmentId': instance.appointmentId,
      'senderId': instance.senderId,
      'text': instance.text,
      'readAt': instance.readAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'sender': instance.sender,
    };
