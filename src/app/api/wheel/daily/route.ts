// POST /api/wheel/daily — Tägliches Glücksrad drehen
// GET /api/wheel/daily — Status abfragen (inkl. dailyEnabled, min/max, bonusSpins)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { spinDailyWheel, getDailyWheelStatus } from "@/lib/wheel";
import { prisma } from "@/lib/prisma";
import { getWheelEnabledSettings, getWheelSettings } from "@/lib/settings";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rl = checkRateLimit(request, "wheel-daily", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const [status, enabledSettings, wheelSettings] = await Promise.all([
      getDailyWheelStatus(session.user.id),
      getWheelEnabledSettings(),
      getWheelSettings(),
    ]);

    return NextResponse.json({
      ...status,
      dailyEnabled: enabledSettings.dailyEnabled,
      dailyMin: wheelSettings.dailyMin,
      dailyMax: wheelSettings.dailyMax,
    });
  } catch (error) {
    console.error("Daily wheel status error:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden des Status." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "wheel-daily-spin", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // Prüfe ob tägliches Glücksrad aktiviert ist (zusätzlicher Check in der Route)
    const { dailyEnabled } = await getWheelEnabledSettings();
    if (!dailyEnabled) {
      return NextResponse.json(
        { error: "Das Glücksrad ist aktuell nicht verfügbar." },
        { status: 400 }
      );
    }

    // Balance VOR dem Spin auslesen
    const userBefore = await prisma.user.findFirst({
      where: { id: session.user.id },
      select: { checkosBalance: true, bonusSpins: true },
    });
    const previousBalance = userBefore?.checkosBalance ?? 0;

    const result = await spinDailyWheel(session.user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, nextSpinAt: result.nextSpinAt },
        { status: 400 }
      );
    }

    // Aktualisierte Bonus-Spins auslesen
    const userAfter = await prisma.user.findFirst({
      where: { id: session.user.id },
      select: { bonusSpins: true },
    });

    return NextResponse.json({
      amount: result.amount,
      previousBalance,
      newBalance: previousBalance + (result.amount ?? 0),
      bonusSpin: result.bonusSpin,
      bonusSpinsRemaining: userAfter?.bonusSpins ?? 0,
      message: result.bonusSpin
        ? `Du hast ${result.amount} Checkos gewonnen! (Bonus-Drehung)`
        : `Du hast ${result.amount} Checkos gewonnen!`,
    });
  } catch (error) {
    console.error("Daily wheel error:", error);
    return NextResponse.json(
      { error: "Fehler beim Drehen des Glücksrads." },
      { status: 500 }
    );
  }
}
