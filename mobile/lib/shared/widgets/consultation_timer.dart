import 'dart:async';

import 'package:flutter/material.dart';

/// Live-ticking (or frozen, once [endedAt] is set) elapsed time for a
/// consultation — starts counting from the moment the doctor verifies the
/// patient's OTP, and stops once the appointment is marked complete.
class ConsultationTimer extends StatefulWidget {
  const ConsultationTimer({super.key, required this.startedAt, this.endedAt});
  final DateTime startedAt;
  final DateTime? endedAt;

  @override
  State<ConsultationTimer> createState() => _ConsultationTimerState();
}

class _ConsultationTimerState extends State<ConsultationTimer> {
  Timer? _ticker;
  late Duration _elapsed = _computeElapsed();

  Duration _computeElapsed() {
    final end = widget.endedAt ?? DateTime.now();
    final diff = end.difference(widget.startedAt);
    return diff.isNegative ? Duration.zero : diff;
  }

  @override
  void initState() {
    super.initState();
    if (widget.endedAt == null) {
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => _elapsed = _computeElapsed());
      });
    }
  }

  @override
  void didUpdateWidget(covariant ConsultationTimer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.endedAt != null && _ticker != null) {
      _ticker!.cancel();
      _ticker = null;
    }
    _elapsed = _computeElapsed();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String get _formatted {
    final totalSeconds = _elapsed.inSeconds;
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    final seconds = totalSeconds % 60;
    final mm = minutes.toString().padLeft(2, '0');
    final ss = seconds.toString().padLeft(2, '0');
    return hours > 0 ? '$hours:$mm:$ss' : '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    final isLive = widget.endedAt == null;
    final color = isLive ? Colors.green[800] : Colors.grey[700];
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          isLive ? Icons.timer_outlined : Icons.timer,
          size: 15,
          color: color,
        ),
        const SizedBox(width: 6),
        Text(
          isLive
              ? 'Consultation in progress · $_formatted'
              : 'Consultation duration: $_formatted',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }
}
