// Public API: GET all modules (aktive zuerst, dann sortiert)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
