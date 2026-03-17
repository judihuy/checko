// Notification Service — Checko
// In-App Benachrichtigungssystem: CRUD + Preferences

import { prisma } from "@/lib/prisma";

/**
 * Kategorie aus dem Notification-Typ ableiten
 */
function inferCategory(type: string): string {
  if (type.startsWith("wheel") || type === "daily_wheel" || type === "registration_wheel") return "wheel";
  if (type.startsWith("preisradar")) return "preisradar";
  if (type.includes("checko") || type.includes("gift") || type === "purchase" || type === "admin_gift") return "checkos";
  return "system";
}

/**
 * Neue Benachrichtigung erstellen
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string,
  category?: string,
  imageUrl?: string
) {
  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      link: link || null,
      category: category || inferCategory(type),
      imageUrl: imageUrl || null,
    },
  });
}

/**
 * Anzahl ungelesener Benachrichtigungen
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
}

/**
 * Benachrichtigungen laden (mit Pagination + optionalem Kategorie-Filter)
 */
export async function getNotifications(
  userId: string,
  limit: number = 10,
  offset: number = 0,
  unreadOnly: boolean = false,
  category?: string
) {
  const where: { userId: string; isRead?: boolean; category?: string } = { userId };
  if (unreadOnly) {
    where.isRead = false;
  }
  if (category) {
    where.category = category;
  }

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where }),
  ]);

  return { notifications, total };
}

/**
 * Einzelne Benachrichtigung als gelesen markieren
 */
export async function markAsRead(notificationId: string, userId: string) {
  // findFirst statt findUnique (Prisma Engine-Bug mit cuid)
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) {
    return null;
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}

/**
 * Alle Benachrichtigungen als gelesen markieren
 */
export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

/**
 * Benachrichtigungs-Einstellungen des Users laden
 * Erstellt Standard-Einstellungen falls noch keine vorhanden
 */
export async function getUserPreferences(userId: string) {
  const existing = await prisma.notificationPreference.findMany({
    where: { userId },
  });

  // Standard-Kanäle mit Defaults
  const defaultChannels = [
    { channel: "inapp", enabled: true },
    { channel: "email", enabled: true },
    { channel: "telegram", enabled: false },
    { channel: "push", enabled: false },
    { channel: "whatsapp", enabled: false },
    { channel: "sms", enabled: false },
  ];

  // Fehlende Kanäle anlegen
  const existingChannels = new Set(existing.map((p) => p.channel));
  const missing = defaultChannels.filter((d) => !existingChannels.has(d.channel));

  if (missing.length > 0) {
    await prisma.notificationPreference.createMany({
      data: missing.map((m) => ({
        userId,
        channel: m.channel,
        enabled: m.enabled,
      })),
    });

    // Nochmal laden mit den neuen
    return prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { channel: "asc" },
    });
  }

  return existing;
}

/**
 * Einstellung für einen Kanal aktualisieren
 */
export async function updatePreference(
  userId: string,
  channel: string,
  enabled: boolean,
  config?: string
) {
  // In-App kann nicht deaktiviert werden
  if (channel === "inapp") {
    enabled = true;
  }

  // Gültige Kanäle prüfen
  const validChannels = ["inapp", "email", "telegram", "push", "whatsapp", "sms"];
  if (!validChannels.includes(channel)) {
    return null;
  }

  return prisma.notificationPreference.upsert({
    where: {
      userId_channel: { userId, channel },
    },
    update: {
      enabled,
      config: config !== undefined ? config : undefined,
    },
    create: {
      userId,
      channel,
      enabled,
      config: config || null,
    },
  });
}
