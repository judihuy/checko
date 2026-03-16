import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";
import { chargeForSearch, calculateExpiresAt, runSearchJob, getSearchCost } from "@/lib/scraper/scheduler";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const rl = checkRateLimit(request, "activate-search", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const search = await prisma.preisradarSearch.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!search) return NextResponse.json({ error: "Suche nicht gefunden" }, { status: 404 });
  if (!search.isDraft) return NextResponse.json({ error: "Suche ist kein Entwurf" }, { status: 400 });

  const cost = getSearchCost(search.duration || "1d", search.qualityTier || "standard");
  const user = await prisma.user.findFirst({ where: { id: session.user.id } });
  if (!user || user.checkosBalance < cost) {
    return NextResponse.json({ error: `Nicht genug Checkos. Benötigt: ${cost}, Guthaben: ${user?.checkosBalance ?? 0}` }, { status: 402 });
  }

  await chargeForSearch(session.user.id, search.duration || "1d", search.qualityTier || "standard");
  const expiresAt = calculateExpiresAt(search.duration || "1d");

  await prisma.preisradarSearch.update({
    where: { id: search.id },
    data: { isDraft: false, isActive: true, expiresAt, checkosCharged: cost },
  });

  runSearchJob(search.id).catch(() => {});
  return NextResponse.json({ success: true, cost });
}
