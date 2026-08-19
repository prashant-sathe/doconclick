import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../shared/payments/cashfree_checkout.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../profile/data/doctor_profile_repository.dart';
import '../data/doctor_payments_repository.dart';

/// Monthly subscription renewal — required once the free trial or a prior
/// paid period lapses, to keep receiving new booking requests.
class SubscriptionPaymentScreen extends ConsumerStatefulWidget {
  const SubscriptionPaymentScreen({super.key});

  @override
  ConsumerState<SubscriptionPaymentScreen> createState() => _SubscriptionPaymentScreenState();
}

class _SubscriptionPaymentScreenState extends ConsumerState<SubscriptionPaymentScreen> {
  bool _paying = false;

  Future<void> _pay() async {
    setState(() => _paying = true);
    try {
      final order = await ref.read(doctorPaymentsRepositoryProvider).createSubscriptionOrder();
      if (!mounted) return;
      CashfreeCheckout.start(
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
        onSuccess: (_) {
          ref.invalidate(doctorAccountProvider);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Subscription renewed.')));
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
      appBar: const GradientAppBar(title: 'Subscription'),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.workspace_premium_outlined, size: 48),
            const SizedBox(height: 16),
            const Text(
              'Renew your monthly plan to keep receiving new booking requests from patients.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _paying ? null : _pay,
              child: _paying
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Renew subscription'),
            ),
          ],
        ),
      ),
    );
  }
}
