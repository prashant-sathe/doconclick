import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/auth_hero_header.dart';
import '../../../shared/widgets/google_sign_in_button.dart';
import '../data/auth_repository.dart';
import '../data/google_auth_service.dart';
import 'auth_controller.dart';

/// Mirrors the web's forgot-password flow: identity is proven via a fresh
/// Google sign-in against the account's email (no OTP/email-link flow
/// exists on the backend), then a new password can be set.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  bool _verifiedViaGoogle = false;
  bool _busy = false;
  String? _error;
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _verifyWithGoogle() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final idToken = await GoogleAuthService.instance.signIn();
      if (idToken == null) {
        setState(() => _busy = false);
        return;
      }
      await ref.read(authControllerProvider.notifier).continueWithGoogle(idToken: idToken, intent: 'reset');
      final state = ref.read(authControllerProvider);
      if (state.hasError) {
        setState(() => _error = state.error.toString());
      } else {
        setState(() => _verifiedViaGoogle = true);
      }
    } catch (e) {
      setState(() => _error = 'Could not verify your identity with Google. $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitNewPassword() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).resetPassword(_passwordController.text);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Password updated. You are now signed in.')),
        );
      }
      // Auth state already holds a valid session from the Google step above —
      // the router will redirect to the role home automatically.
    } on ApiError catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Stack(
              children: [
                const AuthHeroHeader(
                  title: 'Reset password',
                  subtitle: 'Verify it\'s you, then choose a new password.',
                  icon: Icons.lock_reset_rounded,
                  height: 220,
                ),
                SafeArea(
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ),
                  if (!_verifiedViaGoogle) ...[
                    Text(
                      'To reset your password, verify it\'s you by signing in with the Google account linked to your profile.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ).animate().fadeIn(duration: 300.ms),
                    const SizedBox(height: 20),
                    GoogleSignInButton(
                      onPressed: _verifyWithGoogle,
                      loading: _busy,
                      label: 'Verify with Google',
                    ).animate().fadeIn(delay: 100.ms, duration: 300.ms).slideY(begin: 0.1, end: 0),
                  ] else ...[
                    Text('Identity verified. Set a new password.', style: Theme.of(context).textTheme.bodyMedium)
                        .animate()
                        .fadeIn(duration: 300.ms),
                    const SizedBox(height: 20),
                    Form(
                      key: _formKey,
                      child: TextFormField(
                        controller: _passwordController,
                        obscureText: true,
                        decoration: const InputDecoration(labelText: 'New password', prefixIcon: Icon(Icons.lock_outline)),
                        validator: (v) => (v == null || v.length < 6) ? 'At least 6 characters' : null,
                      ),
                    ).animate().fadeIn(delay: 100.ms, duration: 300.ms),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: _busy ? null : _submitNewPassword,
                      child: _busy
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                            )
                          : const Text('Set new password'),
                    ).animate().fadeIn(delay: 150.ms, duration: 300.ms),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
