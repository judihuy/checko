// Deprecated: Subscription API entfernt — Checkos-System aktiv
// Redirect auf Transactions

import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rl = checkRateLimit(request, "admin-subscriptions", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;
  return NextResponse.json(
    { error: "Subscriptions entfernt. Nutze /api/admin/transactions" },
    { status: 410 }
  );
}
