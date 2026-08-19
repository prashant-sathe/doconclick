import 'package:flutter_cashfree_pg_sdk/api/cfpayment/cfwebcheckoutpayment.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpaymentgateway/cfpaymentgatewayservice.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfsession/cfsession.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfenums.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfexceptions.dart';

/// Thin wrapper around the Cashfree Flutter SDK's drop-in checkout —
/// mirrors the web's @cashfreepayments/cashfree-js usage (same
/// paymentSessionId contract from our backend's create-order endpoints),
/// hardcoded to PRODUCTION to match the web checkout page (which has no
/// sandbox toggle either — see CASHFREE_ENV comment in .env.production.example).
class CashfreeCheckout {
  CashfreeCheckout._();

  static final _service = CFPaymentGatewayService();

  /// Launches the native checkout sheet. [onSuccess]/[onError] fire once the
  /// user completes or abandons/fails the payment sheet — actual payment
  /// confirmation still happens server-side via the Cashfree webhook, same
  /// as the web flow; these callbacks only drive local UI state.
  static void start({
    required String orderId,
    required String paymentSessionId,
    required void Function(String orderId) onSuccess,
    required void Function(String message) onError,
  }) {
    _service.setCallback(
      (verifiedOrderId) => onSuccess(verifiedOrderId),
      (error, _) => onError(error.getMessage() ?? 'Payment failed.'),
    );

    try {
      final session = CFSessionBuilder()
          .setEnvironment(CFEnvironment.PRODUCTION)
          .setOrderId(orderId)
          .setPaymentSessionId(paymentSessionId)
          .build();

      final payment = CFWebCheckoutPaymentBuilder().setSession(session).build();
      _service.doPayment(payment);
    } on CFException catch (e) {
      onError(e.message);
    }
  }
}
