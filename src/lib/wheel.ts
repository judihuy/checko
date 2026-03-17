// Glücksrad-System für Checko
// - Registrierungs-Glücksrad (gestaffelt nach User-Nummer)
// - Tägliches Glücksrad (dynamisch aus Settings, nur wenn Checkos verbraucht wurden)
// - Bonus-Spins (Admin-freigeschaltet, umgehen 24h + optional Verbrauchs-Bedingung)

import { prisma } from "@/lib/prisma";
import { getWheelSettings, getWheelEnabledSettings } from "@/lib/settings";

// ==================== SEGMENTE (IDENTISCH MIT FRONTEND!) ====================
// WICHTIG: Diese Definition MUSS mit WheelSpinner.tsx übereinstimmen!

export const WHEEL_SEGMENTS = [
  { label: "1", value: 1 },
  { label: "5", value: 5 },
  { label: "2", value: 2 },
  { label: "10", value: 10 },
  { label: "3", value: 3 },
  { label: "20", value: 20 },
  { label: "1", value: 1 },
  { label: "50", value: 50 },
  { label: "5", value: 5 },
  { label: "15", value: 15 },
  { label: "2", value: 2 },
  { label: "8", value: 8 },
];

/**
 * Berechnet den Ziel-Segment-Index für einen gegebenen Betrag.
 * Falls mehrere Segmente den gleichen Wert haben, wird zufällig eines gewählt.
 */
export function calculateTargetSegment(amount: number): number {
  const matching = WHEEL_SEGMENTS
    .map((seg, idx) => ({ seg, idx }))
    .filter(({ seg }) => seg.value === amount);

  if (matching.length === 0) {
    // Fallback: nächsten Wert finden
    let closest = 0;
    let minDiff = Infinity;
    WHEEL_SEGMENTS.forEach((seg, idx) => {
      const diff = Math.abs(seg.value - amount);
      if (diff < minDiff) {
        minDiff = diff;
        closest = idx;
      }
    });
    return closest;
  }

  return matching[Math.floor(Math.random() * matching.length)].idx;
}

// ==================== USER NUMBER ====================

/**
 * Zählt die bestehenden User (als Workaround für auto-increment)
 */
export async function getUserNumber(): Promise<number> {
  const count = await prisma.user.count();
  return count;
}

/**
 * Registrierungsnummer für einen User setzen (falls noch nicht gesetzt)
 */
export async function assignRegistrationNumber(userId: string): Promise<number> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { registrationNumber: true },
  });

  if (user?.registrationNumber) {
    return user.registrationNumber;
  }

  const currentCount = await getUserNumber();
  const regNumber = currentCount; // Der User ist schon gezählt

  await prisma.user.update({
    where: { id: userId },
    data: { registrationNumber: regNumber },
  });

  return regNumber;
}

// ==================== REGISTRATION WHEEL ====================

/**
 * Berechnet den Gewinn basierend auf der User-Nummer
 * Staffelung (mit dynamischen Min/Max aus Settings):
 * User 1-100: fix = regMax
 * User 101-200: Random regMin - regMax
 * User 201+: Random regMin - floor(regMax/2) (mindestens regMin)
 */
export function calculateRegistrationPrize(
  userNumber: number,
  regMin: number,
  regMax: number
): number {
  if (userNumber <= 100) {
    return regMax;
  } else if (userNumber <= 200) {
    const range = regMax - regMin;
    return Math.floor(Math.random() * (range + 1)) + regMin;
  } else {
    const halfMax = Math.max(Math.floor(regMax / 2), regMin);
    const range = halfMax - regMin;
    return Math.floor(Math.random() * (range + 1)) + regMin;
  }
}

/**
 * Registrierungs-Glücksrad drehen (nur 1x pro User)
 */
export async function spinRegistrationWheel(
  userId: string,
  ipAddress?: string
): Promise<{
  success: boolean;
  amount?: number;
  userNumber?: number;
  error?: string;
}> {
  try {
    // Prüfe ob Registrierungs-Glücksrad aktiviert ist
    const { regEnabled } = await getWheelEnabledSettings();
    if (!regEnabled) {
      return {
        success: false,
        error: "Das Glücksrad ist aktuell nicht verfügbar.",
      };
    }

    // Prüfe ob User bereits gedreht hat
    const existingSpin = await prisma.wheelSpin.findFirst({
      where: { userId, type: "registration" },
    });

    if (existingSpin) {
      return {
        success: false,
        error: "Du hast das Glücksrad bereits gedreht.",
        amount: existingSpin.amount,
      };
    }

    // Anti-Missbrauch: 1x pro IP (wenn IP vorhanden)
    if (ipAddress) {
      const ipSpin = await prisma.wheelSpin.findFirst({
        where: { ipAddress, type: "registration" },
      });

      if (ipSpin) {
        return {
          success: false,
          error: "Das Glücksrad wurde von dieser Verbindung bereits genutzt.",
        };
      }
    }

    // Registrierungsnummer zuweisen
    const userNumber = await assignRegistrationNumber(userId);

    // Settings lesen
    const { regMin, regMax } = await getWheelSettings();

    // Gewinn berechnen (mit dynamischen Werten)
    const amount = calculateRegistrationPrize(userNumber, regMin, regMax);

    // In Transaktion speichern
    await prisma.$transaction(async (tx) => {
      // WheelSpin erstellen
      await tx.wheelSpin.create({
        data: {
          userId,
          type: "registration",
          amount,
          ipAddress: ipAddress || null,
        },
      });

      // Checkos gutschreiben
      await tx.user.update({
        where: { id: userId },
        data: { checkosBalance: { increment: amount } },
      });

      // Transaktion loggen
      await tx.checkoTransaction.create({
        data: {
          userId,
          amount,
          type: "wheel",
          description: `${amount} Checkos vom Registrierungs-Glücksrad gewonnen!`,
        },
      });
    });

    return { success: true, amount, userNumber };
  } catch (error) {
    console.error("spinRegistrationWheel error:", error);
    return { success: false, error: "Fehler beim Drehen des Glücksrads." };
  }
}

// ==================== DAILY WHEEL ====================

/**
 * Berechnet den täglichen Gewinn (dynamisch aus Settings)
 */
function calculateDailyPrize(dailyMin: number, dailyMax: number): number {
  const range = dailyMax - dailyMin;
  return Math.floor(Math.random() * (range + 1)) + dailyMin;
}

/**
 * Tägliches Glücksrad drehen
 * Bedingungen:
 * - 1x pro 24 Stunden (es sei denn Bonus-Spins vorhanden)
 * - Nur wenn seit letztem Spin mindestens 1 Checko verbraucht wurde (es sei denn bonusSpinsNoSpendRequired)
 * - Bonus-Spins: Admin-freigeschaltet, umgehen 24h + optional Verbrauchs-Bedingung
 */
export async function spinDailyWheel(
  userId: string
): Promise<{
  success: boolean;
  amount?: number;
  error?: string;
  nextSpinAt?: Date;
  bonusSpin?: boolean;
}> {
  try {
    // Prüfe ob tägliches Glücksrad aktiviert ist
    const { dailyEnabled } = await getWheelEnabledSettings();
    if (!dailyEnabled) {
      return {
        success: false,
        error: "Das Glücksrad ist aktuell nicht verfügbar.",
      };
    }

    // User laden für Bonus-Spins Check
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: { bonusSpins: true, bonusSpinsNoSpendRequired: true },
    });

    const hasBonusSpins = (user?.bonusSpins ?? 0) > 0;
    const noSpendRequired = user?.bonusSpinsNoSpendRequired ?? false;

    // Letzten Daily Spin finden
    const lastSpin = await prisma.wheelSpin.findFirst({
      where: { userId, type: "daily" },
      orderBy: { createdAt: "desc" },
    });

    // Wenn KEINE Bonus-Spins: normale Bedingungen prüfen
    if (!hasBonusSpins) {
      // Prüfe 24-Stunden-Sperre
      if (lastSpin) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (lastSpin.createdAt > twentyFourHoursAgo) {
          const nextSpinAt = new Date(lastSpin.createdAt.getTime() + 24 * 60 * 60 * 1000);
          return {
            success: false,
            error: "Du kannst das Glücksrad nur einmal alle 24 Stunden drehen.",
            nextSpinAt,
          };
        }
      }

      // Prüfe ob seit dem letzten Spin Checkos verbraucht wurden
      const lastSpinDate = lastSpin?.createdAt || new Date(0);
      const usageSinceLastSpin = await prisma.checkoTransaction.findFirst({
        where: {
          userId,
          type: "usage",
          amount: { lt: 0 },
          createdAt: { gt: lastSpinDate },
        },
      });

      if (!usageSinceLastSpin) {
        return {
          success: false,
          error: "Du musst erst mindestens 1 Checko verbrauchen, bevor du wieder drehen kannst.",
        };
      }
    } else {
      // Hat Bonus-Spins: 24h-Sperre ignorieren
      // Aber Checkos-Bedingung nur prüfen wenn noSpendRequired NICHT gesetzt
      if (!noSpendRequired) {
        const lastSpinDate = lastSpin?.createdAt || new Date(0);
        const usageSinceLastSpin = await prisma.checkoTransaction.findFirst({
          where: {
            userId,
            type: "usage",
            amount: { lt: 0 },
            createdAt: { gt: lastSpinDate },
          },
        });

        if (!usageSinceLastSpin) {
          return {
            success: false,
            error: "Du musst erst mindestens 1 Checko verbrauchen, bevor du wieder drehen kannst.",
          };
        }
      }
    }

    // Settings lesen
    const { dailyMin, dailyMax } = await getWheelSettings();

    // Gewinn berechnen (dynamisch aus Settings)
    const amount = calculateDailyPrize(dailyMin, dailyMax);

    // In Transaktion speichern
    await prisma.$transaction(async (tx) => {
      await tx.wheelSpin.create({
        data: {
          userId,
          type: "daily",
          amount,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          checkosBalance: { increment: amount },
          // Bonus-Spins dekrementieren wenn vorhanden
          ...(hasBonusSpins
            ? {
                bonusSpins: { decrement: 1 },
              }
            : {}),
        },
      });

      await tx.checkoTransaction.create({
        data: {
          userId,
          amount,
          type: "daily_wheel",
          description: hasBonusSpins
            ? `${amount} Checkos vom täglichen Glücksrad (Bonus-Drehung)!`
            : `${amount} Checkos vom täglichen Glücksrad!`,
        },
      });
    });

    // Wenn bonusSpins auf 0 gefallen: noSpendRequired zurücksetzen
    if (hasBonusSpins) {
      const updatedUser = await prisma.user.findFirst({
        where: { id: userId },
        select: { bonusSpins: true },
      });
      if (updatedUser && updatedUser.bonusSpins <= 0) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            bonusSpins: 0,
            bonusSpinsNoSpendRequired: false,
          },
        });
      }
    }

    return { success: true, amount, bonusSpin: hasBonusSpins };
  } catch (error) {
    console.error("spinDailyWheel error:", error);
    return { success: false, error: "Fehler beim Drehen des Glücksrads." };
  }
}

/**
 * Prüft ob das tägliche Glücksrad verfügbar ist
 */
export async function getDailyWheelStatus(userId: string): Promise<{
  available: boolean;
  reason?: string;
  nextSpinAt?: Date;
  lastAmount?: number;
  bonusSpins?: number;
  dailyEnabled?: boolean;
}> {
  // Prüfe ob tägliches Glücksrad aktiviert ist
  const { dailyEnabled } = await getWheelEnabledSettings();
  if (!dailyEnabled) {
    return {
      available: false,
      reason: "Das Glücksrad ist aktuell nicht verfügbar.",
      dailyEnabled: false,
    };
  }

  // User laden für Bonus-Spins
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { bonusSpins: true, bonusSpinsNoSpendRequired: true },
  });

  const bonusSpins = user?.bonusSpins ?? 0;
  const noSpendRequired = user?.bonusSpinsNoSpendRequired ?? false;

  // Wenn Bonus-Spins vorhanden: sofort verfügbar (mit optionaler Verbrauchs-Bedingung)
  if (bonusSpins > 0) {
    // Wenn noSpendRequired: immer verfügbar
    if (noSpendRequired) {
      return {
        available: true,
        reason: `${bonusSpins} Bonus-Drehung${bonusSpins > 1 ? "en" : ""} verfügbar`,
        bonusSpins,
      };
    }

    // Ohne noSpendRequired: Checkos-Verbrauch prüfen
    const lastSpin = await prisma.wheelSpin.findFirst({
      where: { userId, type: "daily" },
      orderBy: { createdAt: "desc" },
    });

    const lastSpinDate = lastSpin?.createdAt || new Date(0);
    const usageSinceLastSpin = await prisma.checkoTransaction.findFirst({
      where: {
        userId,
        type: "usage",
        amount: { lt: 0 },
        createdAt: { gt: lastSpinDate },
      },
    });

    if (!usageSinceLastSpin) {
      return {
        available: false,
        reason: "no_usage",
        bonusSpins,
        lastAmount: lastSpin?.amount,
      };
    }

    return {
      available: true,
      reason: `${bonusSpins} Bonus-Drehung${bonusSpins > 1 ? "en" : ""} verfügbar`,
      bonusSpins,
    };
  }

  // Normale Logik ohne Bonus-Spins
  // Letzten Daily Spin finden
  const lastSpin = await prisma.wheelSpin.findFirst({
    where: { userId, type: "daily" },
    orderBy: { createdAt: "desc" },
  });

  // Prüfe 24-Stunden-Sperre
  if (lastSpin) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (lastSpin.createdAt > twentyFourHoursAgo) {
      const nextSpinAt = new Date(lastSpin.createdAt.getTime() + 24 * 60 * 60 * 1000);
      return {
        available: false,
        reason: "cooldown",
        nextSpinAt,
        lastAmount: lastSpin.amount,
        bonusSpins: 0,
      };
    }
  }

  // Prüfe ob Checkos verbraucht wurden
  const lastSpinDate = lastSpin?.createdAt || new Date(0);
  const usageSinceLastSpin = await prisma.checkoTransaction.findFirst({
    where: {
      userId,
      type: "usage",
      amount: { lt: 0 },
      createdAt: { gt: lastSpinDate },
    },
  });

  if (!usageSinceLastSpin) {
    return {
      available: false,
      reason: "no_usage",
      lastAmount: lastSpin?.amount,
      bonusSpins: 0,
    };
  }

  return { available: true, bonusSpins: 0 };
}
