import 'dart:async';

import 'package:flutter/services.dart';

/// Mirrors src/lib/playNotificationSound.ts's alert design (the web
/// synthesizes tones via Web Audio API — there's no sound asset to port).
/// On mobile there's no oscillator API without adding an audio-playback
/// package, so this uses the platform's built-in system alert sound
/// (`SystemSound.play`) instead — same trigger conditions and timing
/// (repeat every 1.8s, capped at 60s) as the web, just a different tone.
class NotificationSound {
  NotificationSound._();

  static const _ringInterval = Duration(milliseconds: 1800);
  static const _ringMaxDuration = Duration(seconds: 60);

  static Future<void> playChime() => SystemSound.play(SystemSoundType.click);

  /// Starts a repeating alert (fires immediately, then every 1.8s, auto-stops
  /// after 60s so it never rings forever if nobody acts). Returns a function
  /// that stops it early — call this once the triggering event is handled
  /// (e.g. the doctor accepts/rejects, or the patient opens the appointment).
  static VoidCallback startRingingAlert() {
    SystemSound.play(SystemSoundType.alert);
    final timer = Timer.periodic(_ringInterval, (_) => SystemSound.play(SystemSoundType.alert));
    final capTimer = Timer(_ringMaxDuration, timer.cancel);
    return () {
      timer.cancel();
      capTimer.cancel();
    };
  }
}
