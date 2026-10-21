// Rupee amounts in API responses (BUG-TRACKER #57). Float sums drift
// (0.1 + 0.2 = 0.30000000000000004, ₹1,029.9999…), so money is summed in
// whole paise and rounded to 2 decimals on the way out. Non-finite values
// (a corrupt row) count as 0, like safeNum.

const paise = (n: unknown): number => {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  // 12.345 * 100 is 1234.4999… in floating point — trim that noise before
  // rounding, and round the magnitude so −12.345 mirrors 12.345.
  const cents = Number((Math.abs(v) * 100).toPrecision(12));
  return Math.sign(v) * Math.round(cents);
};

/** One amount, rounded to paise. */
export function money(n: unknown): number {
  return paise(n) / 100;
}

/** A sum of amounts, added exactly in paise. */
export function sumMoney(values: Iterable<unknown>): number {
  let total = 0;
  for (const v of values) total += paise(v);
  return total / 100;
}

/** `obj` with the listed fields rounded to paise (others untouched). */
export function moneyFields<T extends Record<string, unknown>>(obj: T, keys: readonly (keyof T)[]): T {
  const out = { ...obj };
  for (const k of keys) out[k] = money(obj[k]) as T[keyof T];
  return out;
}
