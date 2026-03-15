import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalSpins, totalCheckos, spinsThisWeek, checkosThisWeek, spinsThisMonth, checkosThisMonth, regSpins, dailySpins, newUsersThisMonth] = await Promise.all([
    prisma.wheelSpin.count(),
    prisma.wheelSpin.aggregate({ _sum: { amount: true } }),
    prisma.wheelSpin.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.wheelSpin.aggregate({ where: { createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
    prisma.wheelSpin.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.wheelSpin.aggregate({ where: { createdAt: { gte: monthAgo } }, _sum: { amount: true } }),
    prisma.wheelSpin.count({ where: { type: "registration" } }),
    prisma.wheelSpin.count({ where: { type: "daily" } }),
    prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
  ]);

  const totalGiven = totalCheckos._sum.amount || 0;
  const avgPrize = totalSpins > 0 ? Math.round((totalGiven / totalSpins) * 10) / 10 : 0;

  return NextResponse.json({
    totalSpins,
    totalCheckosGiven: totalGiven,
    avgPrizePerSpin: avgPrize,
    spinsThisWeek,
    checkosThisWeek: checkosThisWeek._sum.amount || 0,
    spinsThisMonth,
    checkosThisMonth: checkosThisMonth._sum.amount || 0,
    registrationSpins: regSpins,
    dailySpins,
    newUsersThisMonth,
  });
}
