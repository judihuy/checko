// Admin API: Glücksrad-Einstellungen
// GET — aktuelle Wheel-Settings lesen (inkl. enabled-Status)
// PUT — Wheel-Settings aktualisieren (nur Admin)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { getWheelSettings, getWheelEnabledSettings } from "@/lib/settings";
import { setSetting } from "@/lib/settings";
import { logAdminAction } from "@/lib/audit";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") return null;
  return session;
}

// GET: Aktuelle Settings lesen (inkl. enabled-Status)
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const [settings, enabledSettings] = await Promise.all([
      getWheelSettings(),
      getWheelEnabledSettings(),
    ]);
    return NextResponse.json({
      settings: {
        ...settings,
        ...enabledSettings,
      },
    });
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
  regEnabled: z.boolean().optional(),
  dailyEnabled: z.boolean().optional(),
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

    const { regMin, regMax, dailyMin, dailyMax, regEnabled, dailyEnabled } = parsed.data;

    // Alte Werte für AuditLog lesen
    const [oldSettings, oldEnabled] = await Promise.all([
      getWheelSettings(),
      getWheelEnabledSettings(),
    ]);

    // Settings speichern
    const updates: Promise<void>[] = [
      setSetting("wheel_registration_min", String(regMin)),
      setSetting("wheel_registration_max", String(regMax)),
      setSetting("wheel_daily_min", String(dailyMin)),
      setSetting("wheel_daily_max", String(dailyMax)),
    ];

    // Enabled-Settings nur aktualisieren wenn übergeben
    if (regEnabled !== undefined) {
      updates.push(setSetting("wheel_registration_enabled", String(regEnabled)));
    }
    if (dailyEnabled !== undefined) {
      updates.push(setSetting("wheel_daily_enabled", String(dailyEnabled)));
    }

    await Promise.all(updates);

    // AuditLog für Min/Max-Änderungen
    const oldVals = { ...oldSettings };
    const newVals = { regMin, regMax, dailyMin, dailyMax };
    const hasMinMaxChanged =
      oldVals.regMin !== newVals.regMin ||
      oldVals.regMax !== newVals.regMax ||
      oldVals.dailyMin !== newVals.dailyMin ||
      oldVals.dailyMax !== newVals.dailyMax;

    if (hasMinMaxChanged) {
      await logAdminAction(
        session.user.id,
        "wheel_settings_updated",
        "system_settings",
        JSON.stringify({
          old: oldVals,
          new: newVals,
        })
      );
    }

    // AuditLog für Enabled-Änderungen
    if (regEnabled !== undefined && regEnabled !== oldEnabled.regEnabled) {
      await logAdminAction(
        session.user.id,
        regEnabled ? "wheel_registration_enabled" : "wheel_registration_disabled",
        "system_settings",
        JSON.stringify({
          old: oldEnabled.regEnabled,
          new: regEnabled,
        })
      );
    }

    if (dailyEnabled !== undefined && dailyEnabled !== oldEnabled.dailyEnabled) {
      await logAdminAction(
        session.user.id,
        dailyEnabled ? "wheel_daily_enabled" : "wheel_daily_disabled",
        "system_settings",
        JSON.stringify({
          old: oldEnabled.dailyEnabled,
          new: dailyEnabled,
        })
      );
    }

    // Aktuelle enabled-Werte zurückgeben
    const currentRegEnabled = regEnabled !== undefined ? regEnabled : oldEnabled.regEnabled;
    const currentDailyEnabled = dailyEnabled !== undefined ? dailyEnabled : oldEnabled.dailyEnabled;

    return NextResponse.json({
      success: true,
      settings: {
        regMin,
        regMax,
        dailyMin,
        dailyMax,
        regEnabled: currentRegEnabled,
        dailyEnabled: currentDailyEnabled,
      },
    });
  } catch (error) {
    console.error("Error updating wheel settings:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
