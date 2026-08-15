// @cashfreepayments/cashfree-js ships no TypeScript types of its own.
declare module "@cashfreepayments/cashfree-js" {
  export interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_top" | "_modal" | string;
  }

  export interface Cashfree {
    checkout(options: CashfreeCheckoutOptions): Promise<void>;
  }

  export function load(config: { mode: "sandbox" | "production" }): Promise<Cashfree>;
}
