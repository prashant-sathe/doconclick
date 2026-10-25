import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ADMIN_AUDIT_OMIT } from "@/lib/appointmentView";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://doconclick:doconclick_secret@localhost:5433/doconclick_db";
  const adapter = new PrismaPg({ connectionString });
  // Admin audit fields never leave the server unless a query opts back in
  // (ADMIN_AUDIT_INCLUDE) — default-deny for every appointment read/write
  // result, nested includes too.
  return new PrismaClient({ adapter, omit: { appointment: ADMIN_AUDIT_OMIT } } as ConstructorParameters<typeof PrismaClient>[0]);
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
