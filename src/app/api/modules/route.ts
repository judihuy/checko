// Public API: GET all modules (aktive zuerst, dann sortiert)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  // Rate-Limiting: 60 pro Minute
  const rl = checkRateLimit(request, "modules-list", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;
  try {
    const modules = await prisma.module.findMany({
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
      orderBy: [
        { isActive: "desc" },
        { sortOrder: "asc" },
      ],
    });

    return NextResponse.json({ modules });
  } catch (error) {
    console.error("Error fetching modules:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
