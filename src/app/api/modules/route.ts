// Public API: GET all active modules
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const modules = await prisma.module.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        priceMonthly: true,
        icon: true,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ modules });
  } catch (error) {
    console.error("Error fetching modules:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
