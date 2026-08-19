import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../core/network/api_client.dart';
import '../models/message.dart';

part 'chat_repository.g.dart';

/// Shared by both patient and doctor chat screens — same underlying
/// `/api/appointments/[id]/messages` endpoint and message shape for both.
class ChatRepository {
  ChatRepository(this._dio);
  final Dio _dio;

  Future<List<ChatMessage>> listMessages(String appointmentId) async {
    final res = await _dio.get('/api/appointments/$appointmentId/messages');
    return (res.data as List).map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<ChatMessage> sendMessage(String appointmentId, String text) async {
    final res = await _dio.post('/api/appointments/$appointmentId/messages', data: {'text': text});
    return ChatMessage.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> markRead(String appointmentId) {
    return _dio.patch('/api/appointments/$appointmentId/messages/read');
  }
}

@riverpod
ChatRepository chatRepository(Ref ref) => ChatRepository(ref.watch(dioProvider));

/// Polls every 4s, matching the web's ChatThread.tsx polling interval.
@riverpod
Stream<List<ChatMessage>> chatMessages(Ref ref, String appointmentId) async* {
  final repo = ref.watch(chatRepositoryProvider);
  while (true) {
    yield await repo.listMessages(appointmentId);
    await Future.delayed(const Duration(seconds: 4));
  }
}
