import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LAB_TESTS } from "@/lib/labTestPriceList";
import { resolveLabTest } from "@/lib/labTestMatch";

export { DEFAULT_LAB_TESTS };
export { LAB_ALIASES, labTestKey, labTestPrice, resolveLabTest } from "@/lib/labTestMatch";

// Lab tests: the admin-owned catalogue (/admin/lab-tests). The patient price
// is the B2B price plus the commission on top, rounded to the rupee.

export const DEFAULT_LAB_COMMISSION_PERCENT = 50;
export const MAX_LAB_PRICE = 100_000;

/** Writes the default price list the first time — never again, so admin deletes stick. */
export async function ensureLabTests() {
  const settings = (await prisma.platformSettings.findFirst()) ?? (await prisma.platformSettings.create({ data: {} }));
  if (settings.labTestsSeeded) return;
  if ((await prisma.labTest.count()) === 0) {
    await prisma.labTest.createMany({
      data: DEFAULT_LAB_TESTS.map(([name, b2bPrice], i) => ({ name, b2bPrice, commissionPercent: DEFAULT_LAB_COMMISSION_PERCENT, sortOrder: i })),
      skipDuplicates: true,
    });
  }
  await prisma.platformSettings.update({ where: { id: settings.id }, data: { labTestsSeeded: true } });
}

/** Validates the admin's add/edit body. On create, name + b2bPrice are required. */
export function parseLabTestInput(body: unknown, creating: boolean):
  | { data: { name?: string; b2bPrice?: number; commissionPercent?: number; isActive?: boolean } }
  | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data: { name?: string; b2bPrice?: number; commissionPercent?: number; isActive?: boolean } = {};

  if (b.name !== undefined || creating) {
    const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return { error: "Test name is required." };
    if (name.length > 200) return { error: "Test name is too long (max 200 characters)." };
    data.name = name;
  }
  if (b.b2bPrice !== undefined || creating) {
    const price = Number(b.b2bPrice);
    if (b.b2bPrice === "" || b.b2bPrice === null || !Number.isFinite(price) || price <= 0) return { error: "B2B price must be more than ₹0." };
    if (price > MAX_LAB_PRICE) return { error: `B2B price can't be more than ₹${MAX_LAB_PRICE.toLocaleString("en-IN")}.` };
    data.b2bPrice = Math.round(price * 100) / 100;
  }
  if (b.commissionPercent !== undefined) {
    const pct = Number(b.commissionPercent);
    if (b.commissionPercent === "" || b.commissionPercent === null || !Number.isFinite(pct) || pct < 0 || pct > 500) {
      return { error: "Commission must be between 0% and 500%." };
    }
    data.commissionPercent = Math.round(pct * 100) / 100;
  } else if (creating) {
    data.commissionPercent = DEFAULT_LAB_COMMISSION_PERCENT;
  }
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") return { error: "isActive must be true or false." };
    data.isActive = b.isActive;
  }
  return { data };
}

/**
 * Links each prescription test to the active catalogue test it means
 * (resolveLabTest). Unmatched rows (X-ray, ECG, free text…) stay on the
 * prescription but can't be booked here.
 */
export async function matchLabTests<T extends { name: string }>(
  client: typeof prisma | Prisma.TransactionClient,
  tests: T[],
): Promise<(T & { labTestId: string | null })[]> {
  if (tests.length === 0) return [];
  const catalogue = await client.labTest.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  return tests.map((t) => ({ ...t, labTestId: resolveLabTest(t.name, catalogue)?.id ?? null }));
}
