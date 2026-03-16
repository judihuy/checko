// Push Notifications — Client-seitige Hilfsfunktionen
// Registriert Service Worker, fragt Permission ab, sendet Subscription an Server

/**
 * Prüft ob Push Notifications unterstützt werden
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Service Worker registrieren
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    return registration;
  } catch (error) {
    console.error("[Push] Service Worker Registration fehlgeschlagen:", error);
    return null;
  }
}

/**
 * Notification-Permission anfragen
 */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return "denied";
  return Notification.requestPermission();
}

/**
 * Aktuellen Permission-Status abfragen
 */
export function getPermissionStatus(): NotificationPermission | null {
  if (!isPushSupported()) return null;
  return Notification.permission;
}

/**
 * Push Subscription erstellen und an Server senden
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const permission = await requestPermission();
    if (permission !== "granted") return false;

    const registration = await registerServiceWorker();
    if (!registration) return false;

    // Warte auf active Service Worker
    await navigator.serviceWorker.ready;

    // VAPID Public Key aus Umgebungsvariable
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.error("[Push] VAPID Public Key nicht konfiguriert");
      return false;
    }

    // Base64 URL → Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey) as BufferSource;

    // Bestehende Subscription prüfen
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // Subscription an Server senden
    const res = await fetch("/api/notifications/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey("p256dh")),
          auth: arrayBufferToBase64(subscription.getKey("auth")),
        },
      }),
    });

    return res.ok;
  } catch (error) {
    console.error("[Push] Subscription fehlgeschlagen:", error);
    return false;
  }
}

/**
 * Push Subscription entfernen
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Server informieren
      await fetch("/api/notifications/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      // Browser-Subscription entfernen
      await subscription.unsubscribe();
    }

    return true;
  } catch (error) {
    console.error("[Push] Unsubscribe fehlgeschlagen:", error);
    return false;
  }
}

/**
 * Prüfe ob der User bereits subscribed ist
 */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

// ==================== HELPER ====================

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
