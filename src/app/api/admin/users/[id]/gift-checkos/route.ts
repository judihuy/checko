// Admin API: Checkos verschenken
// POST — Gift checkos to a user

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { giftCheckos } from "@/lib/checkos";
import { logAdminAction } from "@/lib/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const { id: userId } = await params;
    const { amount, description } = await request.json();

    // Validierung
    if (!amount || typeof amount !== "number" || amount <= 0 || amount > 10000) {
      return NextResponse.json(
        { error: "Ungültiger Betrag (1-10'000 Checkos)" },
        { status: 400 }
      );
    }

    if (description && typeof description !== "string") {
      return NextResponse.json(
        { error: "Ungültige Beschreibung" },
        { status: 400 }
      );
    }

    const result = await giftCheckos(
      userId,
      amount,
      session.user.id,
      description || undefined
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // AuditLog
    await logAdminAction(
      session.user.id,
      "CHECKOS_GIFTED",
      userId,
      `${amount} Checkos geschenkt. Neuer Stand: ${result.newBalance}${
        description ? `. Grund: ${description}` : ""
      }`
    );

    return NextResponse.json({
      success: true,
      newBalance: result.newBalance,
    });
  } catch (error) {
    console.error("Gift checkos error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
