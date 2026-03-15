// SystemSettings Service
// Key-Value Store für App-Konfiguration (z.B. Glücksrad-Einstellungen)

import { prisma } from "@/lib/prisma";

/**
 * Einen Setting-Wert lesen (mit Fallback auf defaultValue)
 */
export async function getSetting(
  key: string,
  defaultValue: string
): Promise<string> {
  const setting = await prisma.systemSettings.findFirst({
    where: { key },
  });
  return setting?.value ?? defaultValue;
}

/**
 * Einen Setting-Wert setzen (upsert)
 */
export async function setSetting(
  key: string,
  value: string
): Promise<void> {
  await prisma.systemSettings.upsert({
    where: { key },
    update: { value },
    create: { id: key, key, value },
  });
}

/**
 * Alle Glücksrad-Settings auf einmal lesen
 */
export async function getWheelSettings(): Promise<{
  regMin: number;
  regMax: number;
  dailyMin: number;
  dailyMax: number;
}> {
  const [regMinStr, regMaxStr, dailyMinStr, dailyMaxStr] = await Promise.all([
    getSetting("wheel_registration_min", "1"),
    getSetting("wheel_registration_max", "50"),
    getSetting("wheel_daily_min", "1"),
    getSetting("wheel_daily_max", "10"),
  ]);

  return {
    regMin: parseInt(regMinStr, 10) || 1,
    regMax: parseInt(regMaxStr, 10) || 50,
    dailyMin: parseInt(dailyMinStr, 10) || 1,
    dailyMax: parseInt(dailyMaxStr, 10) || 10,
  };
}
