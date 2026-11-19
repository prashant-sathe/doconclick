import type { PayuCheckout } from "@/lib/payu";

// Sends the browser (or the Capacitor WebView) to PayU's hosted checkout by
// submitting the server-signed form. Navigates the current page, as the old
// redirectTarget "_self" did; PayU returns to /api/payments/payu-return.
export function startPayuCheckout(checkout: PayuCheckout) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.action;
  form.style.display = "none";
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
