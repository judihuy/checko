// Public API: GET single module by slug
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const module = await prisma.module.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        priceMonthly: true,
        icon: true,
        isActive: true,
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
