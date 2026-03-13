// POST /api/wheel/registration — Registrierungs-Glücksrad drehen (nur 1x)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { spinRegistrationWheel } from "@/lib/wheel";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // IP-Adresse extrahieren
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || undefined;

    const result = await spinRegistrationWheel(session.user.id, ip);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, amount: result.amount },
        { status: 400 }
      );
    }

    return NextResponse.json({
      amount: result.amount,
      userNumber: result.userNumber,
      message: `Du hast ${result.amount} Checkos gewonnen!`,
    });
  } catch (error) {
    console.error("Registration wheel error:", error);
    return NextResponse.json(
      { error: "Fehler beim Drehen des Glücksrads." },
      { status: 500 }
    );
  }
}
