// Glücksrad-System für Checko
// - Registrierungs-Glücksrad (gestaffelt nach User-Nummer)
// - Tägliches Glücksrad (1-5 Checkos, nur wenn Checkos verbraucht wurden)

import { prisma } from "@/lib/prisma";

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
  const user = await prisma.user.findUnique({
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
 * User 1-100: 50 Checkos fix
 * User 101-200: Random 1-50 Checkos
 * User 201+: Random 1-20 Checkos
 */
export function calculateRegistrationPrize(userNumber: number): number {
  if (userNumber <= 100) {
    return 50;
  } else if (userNumber <= 200) {
    return Math.floor(Math.random() * 50) + 1; // 1-50
  } else {
    return Math.floor(Math.random() * 20) + 1; // 1-20
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

    // Gewinn berechnen
    const amount = calculateRegistrationPrize(userNumber);

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
 * Tägliches Glücksrad drehen
 * Bedingungen:
 * - 1x pro 24 Stunden
 * - Nur wenn seit letztem Spin mindestens 1 Checko verbraucht wurde
 */
export async function spinDailyWheel(
  userId: string
): Promise<{
  success: boolean;
  amount?: number;
  error?: string;
  nextSpinAt?: Date;
}> {
  try {
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
        amount: { lt: 0 }, // Negative = Verbrauch
        createdAt: { gt: lastSpinDate },
      },
    });

    if (!usageSinceLastSpin) {
      return {
        success: false,
        error: "Du musst erst mindestens 1 Checko verbrauchen, bevor du wieder drehen kannst.",
      };
    }

    // Gewinn: 1-5 Checkos
    const amount = Math.floor(Math.random() * 5) + 1;

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
        data: { checkosBalance: { increment: amount } },
      });

      await tx.checkoTransaction.create({
        data: {
          userId,
          amount,
          type: "daily_wheel",
          description: `${amount} Checkos vom täglichen Glücksrad!`,
        },
      });
    });

    return { success: true, amount };
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
}> {
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
    };
  }

  return { available: true };
}
