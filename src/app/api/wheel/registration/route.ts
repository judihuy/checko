// POST /api/wheel/registration — Registrierungs-Glücksrad drehen (nur 1x)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { spinRegistrationWheel } from "@/lib/wheel";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
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
