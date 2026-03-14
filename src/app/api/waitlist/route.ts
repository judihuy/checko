// Waitlist API — Speichert E-Mail für Coming-Soon Module
// POST: { moduleId, email }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const waitlistSchema = z.object({
  moduleId: z.string().min(1, "moduleId ist erforderlich"),
  email: z.string().email("Ungültige E-Mail-Adresse").transform((e) => e.toLowerCase().trim()),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = waitlistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    const { moduleId, email } = parsed.data;

    // Prüfe ob Modul existiert
    const moduleExists = await prisma.module.findFirst({
      where: { id: moduleId },
      select: { id: true, status: true },
    });

    if (!moduleExists) {
      return NextResponse.json({ error: "Modul nicht gefunden" }, { status: 404 });
    }

    // Prüfe ob bereits registriert
    const existing = await prisma.moduleWaitlist.findFirst({
      where: { moduleId, email },
    });

    if (existing) {
      return NextResponse.json({ success: true, alreadyRegistered: true });
    }

    // Neue Registrierung
    await prisma.moduleWaitlist.create({
      data: { moduleId, email },
    });

    return NextResponse.json({ success: true, alreadyRegistered: false });
  } catch (error) {
    console.error("Waitlist error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
