// Push Notification Senden (intern)
// POST: Push an einen User senden (nur von Server/Scheduler aufgerufen)
// Erwartet: userId, title, body, url (optional)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/web-push";
import { z } from "zod";

const sendSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  url: z.string().optional(),
  tag: z.string().optional(),
});

// POST: Push an User senden
export async function POST(request: NextRequest) {
  // Einfacher interner Auth-Check: Nur vom gleichen Server (kein Browser-Zugriff)
  const authHeader = request.headers.get("x-internal-secret");
  const internalSecret = process.env.NEXTAUTH_SECRET;

  if (!authHeader || authHeader !== internalSecret) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = sendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { userId, title, body: messageBody, url, tag } = parsed.data;

    // Prüfe ob User Push aktiviert hat
    const preference = await prisma.notificationPreference.findFirst({
      where: { userId, channel: "push", enabled: true },
    });

    if (!preference) {
      return NextResponse.json({ success: false, reason: "Push nicht aktiviert" });
    }

    const result = await sendPushToUser(userId, {
      title,
      body: messageBody,
      url: url || "/dashboard",
      tag: tag || "checko-alert",
    });

    return NextResponse.json({ success: true, sent: result.sent, failed: result.failed });
  } catch (error) {
    console.error("Push send error:", error);
    return NextResponse.json(
      { error: "Interner Fehler" },
      { status: 500 }
    );
  }
}
