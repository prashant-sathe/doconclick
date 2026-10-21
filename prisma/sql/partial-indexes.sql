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
