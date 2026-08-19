import 'package:flutter/material.dart';

/// Google's official "Sign in with Google" button style: white surface,
/// subtle border, the multi-color "G" mark, dark neutral label text —
/// consistent regardless of app theme/dark-mode per Google's brand guidelines.
class GoogleSignInButton extends StatelessWidget {
  const GoogleSignInButton({super.key, required this.onPressed, required this.loading, this.label = 'Continue with Google'});

  final VoidCallback? onPressed;
  final bool loading;
  final String label;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: OutlinedButton(
        onPressed: loading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: Colors.white,
          side: BorderSide(color: Colors.grey.shade300),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: loading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.black54),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const _GoogleMark(),
                  const SizedBox(width: 12),
                  Text(label, style: const TextStyle(color: Colors.black87, fontSize: 15, fontWeight: FontWeight.w600)),
                ],
              ),
      ),
    );
  }
}

/// The four-color "G" mark, drawn from paths so no image asset is needed.
class _GoogleMark extends StatelessWidget {
  const _GoogleMark();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 20,
      height: 20,
      child: CustomPaint(painter: _GoogleGPainter()),
    );
  }
}

class _GoogleGPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final paint = Paint()..style = PaintingStyle.fill;
    final center = Offset(s / 2, s / 2);
    final radius = s / 2;

    void arc(Color color, double startDeg, double sweepDeg) {
      paint.color = color;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startDeg * 3.14159265 / 180,
        sweepDeg * 3.14159265 / 180,
        true,
        paint,
      );
    }

    arc(const Color(0xFF4285F4), -50, 100); // blue (right)
    arc(const Color(0xFF34A853), 50, 90); // green (bottom)
    arc(const Color(0xFFFBBC05), 140, 70); // yellow (left)
    arc(const Color(0xFFEA4335), 210, 100); // red (top)

    // Punch the center hole + horizontal bar to form the "G" shape.
    final holePaint = Paint()..color = Colors.white;
    canvas.drawCircle(center, radius * 0.55, holePaint);
    canvas.drawRect(Rect.fromLTWH(center.dx, center.dy - radius * 0.16, radius * 1.05, radius * 0.32), holePaint);

    paint.color = const Color(0xFF4285F4);
    canvas.drawRect(Rect.fromLTWH(center.dx + radius * 0.15, center.dy - radius * 0.16, radius * 0.9, radius * 0.32), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
