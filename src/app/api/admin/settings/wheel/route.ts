// Admin API: Glücksrad-Einstellungen
// GET — aktuelle Wheel-Settings lesen
// PUT — Wheel-Settings aktualisieren (nur Admin)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { getWheelSettings } from "@/lib/settings";
import { setSetting } from "@/lib/settings";
import { logAdminAction } from "@/lib/audit";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") return null;
  return session;
}

// GET: Aktuelle Settings lesen
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const settings = await getWheelSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error fetching wheel settings:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

// PUT: Settings aktualisieren
const wheelSettingsSchema = z.object({
  regMin: z.number().int().min(0).max(1000),
  regMax: z.number().int().min(0).max(1000),
  dailyMin: z.number().int().min(0).max(1000),
  dailyMax: z.number().int().min(0).max(1000),
}).refine((data) => data.regMax >= data.regMin, {
  message: "Registrierung Max muss >= Min sein",
  path: ["regMax"],
}).refine((data) => data.dailyMax >= data.dailyMin, {
  message: "Täglich Max muss >= Min sein",
  path: ["dailyMax"],
});

export async function PUT(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = wheelSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { regMin, regMax, dailyMin, dailyMax } = parsed.data;

    // Alte Werte für AuditLog lesen
    const oldSettings = await getWheelSettings();

    // Settings speichern
    await Promise.all([
      setSetting("wheel_registration_min", String(regMin)),
      setSetting("wheel_registration_max", String(regMax)),
      setSetting("wheel_daily_min", String(dailyMin)),
      setSetting("wheel_daily_max", String(dailyMax)),
    ]);

    // AuditLog
    await logAdminAction(
      session.user.id,
      "wheel_settings_updated",
      "system_settings",
      JSON.stringify({
        old: oldSettings,
        new: { regMin, regMax, dailyMin, dailyMax },
      })
    );

    return NextResponse.json({
      success: true,
      settings: { regMin, regMax, dailyMin, dailyMax },
    });
  } catch (error) {
    console.error("Error updating wheel settings:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
