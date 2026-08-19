import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../shared/payments/cashfree_checkout.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../profile/data/doctor_profile_repository.dart';
import '../data/doctor_payments_repository.dart';

/// One-time registration fee — gate before admin verification begins.
/// Reachable from the doctor profile screen while registrationFeePaid=false.
class RegistrationPaymentScreen extends ConsumerStatefulWidget {
  const RegistrationPaymentScreen({super.key});

  @override
  ConsumerState<RegistrationPaymentScreen> createState() => _RegistrationPaymentScreenState();
}

class _RegistrationPaymentScreenState extends ConsumerState<RegistrationPaymentScreen> {
  bool _paying = false;

  Future<void> _pay() async {
    setState(() => _paying = true);
    try {
      final order = await ref.read(doctorPaymentsRepositoryProvider).createRegistrationFeeOrder();
      if (!mounted) return;
      CashfreeCheckout.start(
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
        onSuccess: (_) {
          ref.invalidate(doctorAccountProvider);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment successful.')));
            Navigator.of(context).pop();
          }
        },
        onError: (message) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
        },
      );
    } on DoctorPaymentApiError catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const GradientAppBar(title: 'Registration fee'),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.verified_outlined, size: 48),
            const SizedBox(height: 16),
            const Text(
              'A one-time registration fee is required before your profile can be reviewed for verification.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _paying ? null : _pay,
              child: _paying
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Pay registration fee'),
            ),
          ],
        ),
      ),
    );
  }
}
