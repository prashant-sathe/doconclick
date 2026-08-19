import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../network/api_client.dart';

part 'push_service.g.dart';

/// Set whenever a notification is tapped (foreground-local-notification tap,
/// background tap, or a cold start from a notification) — the appointment id
/// to deep-link to. The root app widget listens for this and navigates,
/// keeping this file decoupled from go_router (which itself depends on
/// auth_controller, which would otherwise create an import cycle).
@Riverpod(keepAlive: true)
class PendingNotificationTarget extends _$PendingNotificationTarget {
  @override
  String? build() => null;

  void set(String appointmentId) => state = appointmentId;
  void clear() => state = null;
}

/// Required by the firebase_messaging API contract for messages received
/// while the app is backgrounded/terminated. Deliberately does nothing
/// beyond re-initializing Firebase (a plugin requirement) — this app only
/// acts on a *tapped* notification (see [PushService._handleMessageTap]),
/// never on silent background receipt, so there's nothing else to do here.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

/// Wires up FCM: requests permission, registers the device token with our
/// backend (POST /api/mobile/notifications/device-token), shows a local
/// notification while the app is foregrounded (FCM doesn't auto-display
/// those), and deep-links a tapped notification to the relevant appointment
/// screen via `data.type`/`data.appointmentId` — the same event shapes the
/// backend's sendPushToUser() call sites attach (src/lib/pushNotifications.ts).
///
/// Entirely best-effort: if Firebase isn't configured for this build (no
/// google-services.json/GoogleService-Info.plist yet), every method below
/// no-ops instead of throwing — mirrors the backend's sendPushToUser(),
/// which silently no-ops when FCM env vars aren't set.
class PushService {
  PushService(this._ref);
  final Ref _ref;

  final _localNotifications = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Firebase not configured — push notifications disabled ($e)');
      return;
    }

    await _localNotifications.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
      onDidReceiveNotificationResponse: (response) {
        final appointmentId = response.payload;
        if (appointmentId != null) _navigateToAppointment(appointmentId);
      },
    );

    await FirebaseMessaging.instance.requestPermission();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    FirebaseMessaging.onMessage.listen(_showForegroundNotification);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);

    final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
    if (initialMessage != null) _handleMessageTap(initialMessage);
  }

  /// Call once the user is authenticated — registers this device's FCM
  /// token against the logged-in account.
  Future<void> registerDeviceToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await _ref.read(dioProvider).post('/api/mobile/notifications/device-token', data: {
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
      });
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
        _ref.read(dioProvider).post('/api/mobile/notifications/device-token', data: {
          'token': newToken,
          'platform': Platform.isIOS ? 'ios' : 'android',
        });
      });
    } catch (e) {
      debugPrint('Could not register device token: $e');
    }
  }

  /// Call on logout — best-effort unregister so the signed-out device stops
  /// receiving this account's notifications.
  Future<void> unregisterDeviceToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await _ref.read(dioProvider).delete('/api/mobile/notifications/device-token', data: {'token': token});
    } catch (e) {
      debugPrint('Could not unregister device token: $e');
    }
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;
    await _localNotifications.show(
      id: notification.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'doconclick_default',
          'Notifications',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: message.data['appointmentId'] as String?,
    );
  }

  void _handleMessageTap(RemoteMessage message) {
    final appointmentId = message.data['appointmentId'] as String?;
    if (appointmentId != null) _navigateToAppointment(appointmentId);
  }

  void _navigateToAppointment(String appointmentId) {
    _ref.read(pendingNotificationTargetProvider.notifier).set(appointmentId);
  }
}

// keepAlive: this is only ever reached via ref.read() (initialize(),
// registerDeviceToken(), unregisterDeviceToken()), never watch()/listen() —
// with the default autoDispose, Riverpod tears the provider down right
// after the synchronous read returns, cancelling the in-flight async work
// inside those methods (surfaced as "Cannot use the Ref of pushServiceProvider
// after it has been disposed").
@Riverpod(keepAlive: true)
PushService pushService(Ref ref) => PushService(ref);
