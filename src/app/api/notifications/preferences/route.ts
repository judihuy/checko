// GET /api/notifications/preferences — Benachrichtigungs-Einstellungen laden
// PUT /api/notifications/preferences — Einstellung ändern

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserPreferences, updatePreference } from "@/lib/notifications";
import { z } from "zod";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "notifications-preferences", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const preferences = await getUserPreferences(session.user.id);
  return NextResponse.json({ preferences });
}

const updateSchema = z.object({
  channel: z.enum(["inapp", "email", "telegram", "push", "whatsapp", "sms"]),
  enabled: z.boolean(),
  config: z.string().optional(),
});

export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "notifications-preferences", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Daten", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { channel, enabled, config } = parsed.data;

  const result = await updatePreference(session.user.id, channel, enabled, config);

  if (!result) {
    return NextResponse.json({ error: "Ungültiger Kanal" }, { status: 400 });
  }

  return NextResponse.json({ success: true, preference: result });
}
