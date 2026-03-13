// Deprecated: Subscription API entfernt — Checkos-System aktiv
// Redirect auf Transactions

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Subscriptions entfernt. Nutze /api/admin/transactions" },
    { status: 410 }
  );
}
