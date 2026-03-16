// Push Notification Subscription API
// POST: Neue Subscription speichern
// DELETE: Subscription entfernen

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

// POST: Subscription speichern
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "push-subscribe", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = subscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Subscription-Daten", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { endpoint, keys } = parsed.data;

    // Upsert: Falls Endpoint schon existiert, aktualisieren
    // Da endpoint @unique ist, können wir direkt prüfen
    const existing = await prisma.pushSubscription.findFirst({
      where: { endpoint },
    });

    if (existing) {
      // Aktualisiere bestehende Subscription (könnte anderer User sein → überschreiben)
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId: session.user.id,
          keys: JSON.stringify(keys),
        },
      });
    } else {
      await prisma.pushSubscription.create({
        data: {
          userId: session.user.id,
          endpoint,
          keys: JSON.stringify(keys),
        },
      });
    }

    // Push-Preference auf enabled setzen
    await prisma.notificationPreference.upsert({
      where: {
        userId_channel: { userId: session.user.id, channel: "push" },
      },
      update: { enabled: true },
      create: {
        userId: session.user.id,
        channel: "push",
        enabled: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json(
      { error: "Interner Fehler" },
      { status: 500 }
    );
  }
}

// DELETE: Subscription entfernen
export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(request, "push-unsubscribe", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = unsubscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültiger Endpoint" }, { status: 400 });
    }

    // Subscription suchen und löschen (findFirst statt findUnique)
    const subscription = await prisma.pushSubscription.findFirst({
      where: { endpoint: parsed.data.endpoint, userId: session.user.id },
    });

    if (subscription) {
      await prisma.pushSubscription.delete({
        where: { id: subscription.id },
      });
    }

    // Prüfe ob noch andere Subscriptions existieren
    const remaining = await prisma.pushSubscription.count({
      where: { userId: session.user.id },
    });

    // Falls keine mehr, Push-Preference deaktivieren
    if (remaining === 0) {
      await prisma.notificationPreference.upsert({
        where: {
          userId_channel: { userId: session.user.id, channel: "push" },
        },
        update: { enabled: false },
        create: {
          userId: session.user.id,
          channel: "push",
          enabled: false,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    return NextResponse.json(
      { error: "Interner Fehler" },
      { status: 500 }
    );
  }
}
