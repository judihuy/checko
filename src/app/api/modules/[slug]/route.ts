// Public API: GET single module by slug
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Rate-Limiting: 60 pro Minute
  const rl = checkRateLimit(_request, "module-slug", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  try {
    const { slug } = await params;
    const module = await prisma.module.findFirst({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        priceMonthly: true,
        icon: true,
        isActive: true,
        status: true,
        sortOrder: true,
      },
    });

    if (!module) {
      return NextResponse.json({ error: "Modul nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ module });
  } catch (error) {
    console.error("Error fetching module:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
