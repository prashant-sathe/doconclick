import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { walletTopupReceipt } from "@/lib/receipts";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: ReceiptData for a successful wallet top-up's PDF receipt (ReceiptDocument) —
// for the patient it belongs to, or an admin. Anyone else gets a 404.
export const GET = withErrorLocale(async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (authUser.role !== "PATIENT" && authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;
  const result = await walletTopupReceipt(id, authUser);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
});
