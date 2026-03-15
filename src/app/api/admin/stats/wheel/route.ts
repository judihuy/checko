// GET /api/admin/stats/wheel — Glücksrad-Statistiken für Admin
// Berechnet KPIs aus WheelSpin Tabelle

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const now = new Date();

    // Start der aktuellen Woche (Montag)
    const startOfWeek = new Date(now);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Montag = 0
    startOfWeek.setDate(startOfWeek.getDate() - diff);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start des aktuellen Monats
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Alle Queries parallel
    const [
      totalSpinsResult,
      totalCheckosResult,
      spinsThisWeekResult,
      checkosThisWeekResult,
      spinsThisMonthResult,
      checkosThisMonthResult,
      registrationSpinsResult,
      dailySpinsResult,
      registrationCheckosResult,
      dailyCheckosResult,
      newUsersThisMonth,
    ] = await Promise.all([
      // Total Spins
      prisma.wheelSpin.count(),
      // Total Checkos vergeben
      prisma.wheelSpin.aggregate({ _sum: { amount: true } }),
      // Spins diese Woche
      prisma.wheelSpin.count({
        where: { createdAt: { gte: startOfWeek } },
      }),
      // Checkos diese Woche
      prisma.wheelSpin.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: startOfWeek } },
      }),
      // Spins diesen Monat
      prisma.wheelSpin.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      // Checkos diesen Monat
      prisma.wheelSpin.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: startOfMonth } },
      }),
      // Registration Spins (gesamt)
      prisma.wheelSpin.count({ where: { type: "registration" } }),
      // Daily Spins (gesamt)
      prisma.wheelSpin.count({ where: { type: "daily" } }),
      // Registration Checkos (gesamt)
      prisma.wheelSpin.aggregate({
        _sum: { amount: true },
        where: { type: "registration" },
      }),
      // Daily Checkos (gesamt)
      prisma.wheelSpin.aggregate({
        _sum: { amount: true },
        where: { type: "daily" },
      }),
      // Neue User diesen Monat
      prisma.user.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);

    const totalSpins = totalSpinsResult;
    const totalCheckosGiven = totalCheckosResult._sum.amount ?? 0;
    const avgPrizePerSpin = totalSpins > 0
      ? Math.round((totalCheckosGiven / totalSpins) * 10) / 10
      : 0;

    const stats = {
      totalSpins,
      totalCheckosGiven,
      avgPrizePerSpin,
      spinsThisWeek: spinsThisWeekResult,
      checkosThisWeek: checkosThisWeekResult._sum.amount ?? 0,
      spinsThisMonth: spinsThisMonthResult,
      checkosThisMonth: checkosThisMonthResult._sum.amount ?? 0,
      registrationSpins: registrationSpinsResult,
      dailySpins: dailySpinsResult,
      registrationCheckos: registrationCheckosResult._sum.amount ?? 0,
      dailyCheckos: dailyCheckosResult._sum.amount ?? 0,
      newUsersThisMonth,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching wheel stats:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
