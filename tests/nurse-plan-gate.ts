// Nurse plan gate (P3-24): nurseFeesOverdue decides when a nurse is treated
// like an out-of-plan doctor (403 SUBSCRIPTION_EXPIRED on accept/complete).
// Fee 0 (the default) must never gate. Pure logic, no server needed.
//
//   npm run test:nurse-plan-gate
import { nurseFeesOverdue } from "../src/lib/providerGuard";

let failures = 0;
function check(label: string, got: boolean, want: boolean) {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${got}, want ${want}`);
  if (!ok) failures++;
}
const day = 86400000;
const past = new Date(Date.now() - day);
const future = new Date(Date.now() + day);
const fees = (reg: number, sub: number) => ({ nurseRegistrationFee: reg, nurseSubscriptionFee: sub });

check("fees 0, never paid -> no gate", nurseFeesOverdue({ registrationFeePaid: false, subscriptionPaidUntil: null }, fees(0, 0)), false);
check("no settings row -> no gate", nurseFeesOverdue({ registrationFeePaid: false, subscriptionPaidUntil: null }, null), false);
check("sub fee>0, null paidUntil -> gate", nurseFeesOverdue({ registrationFeePaid: true, subscriptionPaidUntil: null }, fees(0, 100)), true);
check("sub fee>0, expired yesterday -> gate", nurseFeesOverdue({ registrationFeePaid: true, subscriptionPaidUntil: past }, fees(0, 100)), true);
check("sub fee>0, valid -> no gate", nurseFeesOverdue({ registrationFeePaid: true, subscriptionPaidUntil: future }, fees(0, 100)), false);
check("sub fee>0 as ISO string, valid -> no gate", nurseFeesOverdue({ registrationFeePaid: true, subscriptionPaidUntil: future.toISOString() }, fees(0, 100)), false);
check("reg fee>0 unpaid -> gate", nurseFeesOverdue({ registrationFeePaid: false, subscriptionPaidUntil: null }, fees(500, 0)), true);
check("reg fee>0 paid, sub fee 0 -> no gate", nurseFeesOverdue({ registrationFeePaid: true, subscriptionPaidUntil: null }, fees(500, 0)), false);
check("sub fee 0, expired date -> no gate", nurseFeesOverdue({ registrationFeePaid: true, subscriptionPaidUntil: past }, fees(0, 0)), false);

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\nAll passed");
