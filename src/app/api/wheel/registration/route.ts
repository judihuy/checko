// POST /api/wheel/registration — Registrierungs-Glücksrad drehen (nur 1x)
// GET /api/wheel/registration — Status abfragen (inkl. regEnabled)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { spinRegistrationWheel } from "@/lib/wheel";
import { prisma } from "@/lib/prisma";
import { getWheelEnabledSettings } from "@/lib/settings";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const { regEnabled } = await getWheelEnabledSettings();

    // Prüfe ob User bereits gedreht hat
    const existingSpin = await prisma.wheelSpin.findFirst({
      where: { userId: session.user.id, type: "registration" },
    });

    return NextResponse.json({
      regEnabled,
      alreadySpun: !!existingSpin,
      amount: existingSpin?.amount ?? null,
    });
  } catch (error) {
    console.error("Registration wheel status error:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden des Status." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // Prüfe ob Registrierungs-Glücksrad aktiviert ist (zusätzlicher Check in der Route)
    const { regEnabled } = await getWheelEnabledSettings();
    if (!regEnabled) {
      return NextResponse.json(
        { error: "Das Glücksrad ist aktuell nicht verfügbar." },
        { status: 400 }
      );
    }

    // Balance VOR dem Spin auslesen
    const userBefore = await prisma.user.findFirst({
      where: { id: session.user.id },
      select: { checkosBalance: true },
    });
    const previousBalance = userBefore?.checkosBalance ?? 0;

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
      previousBalance,
      newBalance: previousBalance + (result.amount ?? 0),
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
