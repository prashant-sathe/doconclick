import 'package:flutter/material.dart';

/// Drop-in replacement for `AppBar` that paints the same primary→tertiary
/// gradient used on the auth screens (see `AuthHeroHeader`), so every
/// screen in the app shares one visual identity instead of auth being the
/// only "designed" part and everything else falling back to a flat white
/// bar + white body.
class GradientAppBar extends StatelessWidget implements PreferredSizeWidget {
  const GradientAppBar({
    super.key,
    required this.title,
    this.actions,
    this.leading,
    this.bottom,
    this.centerTitle = false,
  });

  final String title;
  final List<Widget>? actions;
  final Widget? leading;
  final PreferredSizeWidget? bottom;
  final bool centerTitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AppBar(
      title: Text(title),
      leading: leading,
      actions: actions,
      centerTitle: centerTitle,
      foregroundColor: Colors.white,
      backgroundColor: Colors.transparent,
      elevation: 0,
      bottom: bottom,
      flexibleSpace: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [scheme.primary, scheme.primary.withValues(alpha: 0.85), scheme.tertiary.withValues(alpha: 0.85)],
          ),
        ),
      ),
    );
  }

  @override
  Size get preferredSize => Size.fromHeight(kToolbarHeight + (bottom?.preferredSize.height ?? 0));
}
