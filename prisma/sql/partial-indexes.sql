-- Indexes Prisma's schema language can't express (partial indexes). Applied
-- after every `prisma db push` (npm run db:push, and the prod `migrate` job)
-- because db push treats indexes it doesn't know about as drift and drops
-- them. Every statement must be idempotent.

-- One live booking per provider per exact start time — the database's last
-- line of defence against two concurrent requests grabbing the same slot.
-- (Range overlap is checked in the app: src/lib/doctorSlots.ts.)
CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_doctorId_scheduledAt_live_key"
  ON "Appointment" ("doctorId", "scheduledAt")
  WHERE "status" IN ('PENDING_APPROVAL', 'SCHEDULED');

-- Specialty names are unique ignoring case. Prisma's @unique is case-sensitive,
-- so "Dentist" and "dentist" would otherwise both be allowed — two specialties
-- no filter can tell apart. The routes check first; this settles a race.
CREATE UNIQUE INDEX IF NOT EXISTS "Specialty_name_lower_key"
  ON "Specialty" (lower("name"));

-- SettlementPayoutCorrection is an append-only audit trail (P3-32/P3-36): no
-- row may ever be edited or removed, whatever code or hand-run SQL tries.
-- UPDATE and TRUNCATE are always rejected. DELETE is rejected too, unless the
-- transaction has set app.allow_correction_purge = 'on' — only the test suite
-- does that, to clean up its throwaway rows; no app code sets it. (A
-- settlement with corrections also can't be deleted: onDelete: Restrict.)
CREATE OR REPLACE FUNCTION "settlement_payout_correction_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_correction_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'SettlementPayoutCorrection is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "settlement_payout_correction_append_only" ON "SettlementPayoutCorrection";
CREATE TRIGGER "settlement_payout_correction_append_only"
  BEFORE UPDATE OR DELETE ON "SettlementPayoutCorrection"
  FOR EACH ROW EXECUTE FUNCTION "settlement_payout_correction_append_only"();

DROP TRIGGER IF EXISTS "settlement_payout_correction_no_truncate" ON "SettlementPayoutCorrection";
CREATE TRIGGER "settlement_payout_correction_no_truncate"
  BEFORE TRUNCATE ON "SettlementPayoutCorrection"
  FOR EACH STATEMENT EXECUTE FUNCTION "settlement_payout_correction_append_only"();
