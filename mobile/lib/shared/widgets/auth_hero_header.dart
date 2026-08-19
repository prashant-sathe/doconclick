import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Gradient hero banner used at the top of auth screens (login/register/
/// complete-profile) — a curved-bottom gradient panel with a softly
/// pulsing logo mark, floating over two blurred accent blobs for depth.
class AuthHeroHeader extends StatelessWidget {
  const AuthHeroHeader({
    super.key,
    required this.title,
    required this.subtitle,
    this.icon = Icons.local_hospital_rounded,
    this.height = 260,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ClipPath(
      clipper: _CurvedBottomClipper(),
      child: Container(
        // A minimum rather than a fixed height — long subtitle text or a
        // deep SafeArea top inset (notches, punch-holes) can need more room
        // than `height` on some devices, so the header grows instead of
        // overflowing.
        constraints: BoxConstraints(minHeight: height),
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [scheme.primary, scheme.primary.withValues(alpha: 0.75), scheme.tertiary.withValues(alpha: 0.85)],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              top: -30,
              right: -30,
              child: _blob(color: Colors.white.withValues(alpha: 0.10), size: 140),
            ),
            Positioned(
              bottom: -20,
              left: -40,
              child: _blob(color: Colors.white.withValues(alpha: 0.08), size: 160),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Icon(icon, size: 32, color: Colors.white),
                    )
                        .animate()
                        .fadeIn(duration: 400.ms)
                        .scale(begin: const Offset(0.6, 0.6), curve: Curves.easeOutBack, duration: 500.ms)
                        .slideY(begin: -0.3, end: 0, curve: Curves.easeOutBack),
                    const SizedBox(height: 18),
                    Text(
                      title,
                      style: Theme.of(context)
                          .textTheme
                          .headlineMedium
                          ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                    ).animate().fadeIn(delay: 100.ms, duration: 400.ms).slideY(begin: 0.2, end: 0),
                    const SizedBox(height: 6),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.9)),
                    ).animate().fadeIn(delay: 180.ms, duration: 400.ms).slideY(begin: 0.2, end: 0),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _blob({required Color color, required double size}) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

class _CurvedBottomClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path()
      ..lineTo(0, size.height - 36)
      ..quadraticBezierTo(size.width / 2, size.height, size.width, size.height - 36)
      ..lineTo(size.width, 0)
      ..close();
    return path;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}
