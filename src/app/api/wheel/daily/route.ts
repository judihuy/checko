// POST /api/wheel/daily — Tägliches Glücksrad drehen
// GET /api/wheel/daily — Status abfragen

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { spinDailyWheel, getDailyWheelStatus } from "@/lib/wheel";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const status = await getDailyWheelStatus(session.user.id);
    return NextResponse.json(status);
  } catch (error) {
    console.error("Daily wheel status error:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden des Status." },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const result = await spinDailyWheel(session.user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, nextSpinAt: result.nextSpinAt },
        { status: 400 }
      );
    }

    return NextResponse.json({
      amount: result.amount,
      message: `Du hast ${result.amount} Checkos gewonnen!`,
    });
  } catch (error) {
    console.error("Daily wheel error:", error);
    return NextResponse.json(
      { error: "Fehler beim Drehen des Glücksrads." },
      { status: 500 }
    );
  }
}
