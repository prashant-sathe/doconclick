// Limits on admin wallet adjustments (POST /api/admin/wallets/[userId]/adjust),
// client-safe (no Prisma) so the admin wallets page can check the same rules
// before the confirm dialog. One adjustment can't exceed MAX_ADMIN_ADJUSTMENT;
// the reason is stored on the ledger row and shown to the patient in their
// wallet history.
export const MAX_ADMIN_ADJUSTMENT = 50000;
export const ADJUSTMENT_REASON_MIN = 5;
export const ADJUSTMENT_REASON_MAX = 300;
