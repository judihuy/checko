"use client";

import { useEffect, useState, useCallback } from "react";
import { isPushSupported, subscribeToPush, isSubscribed, getPermissionStatus } from "@/lib/push-notifications";

/**
 * Dialog: "Möchtest du Push-Benachrichtigungen aktivieren?"
 * Wird nach Login einmalig angezeigt, wenn:
 * - Browser Push unterstützt
 * - User noch nicht subscribed ist
 * - Permission noch nicht "denied" ist
 */
export function PushNotificationPrompt() {
  const [show, setShow] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    const checkPush = async () => {
      // Prüfe ob schon dismissed wurde (Session-basiert)
      const dismissed = sessionStorage.getItem("push-prompt-dismissed");
      if (dismissed) return;

      if (!isPushSupported()) return;

      const permission = getPermissionStatus();
      if (permission === "denied") return;

      const subscribed = await isSubscribed();
      if (subscribed) return;

      // Zeige Dialog nach kurzer Verzögerung
      setTimeout(() => setShow(true), 3000);
    };

    checkPush();
  }, []);

  const handleEnable = useCallback(async () => {
    setSubscribing(true);
    try {
      const success = await subscribeToPush();
      if (success) {
        setShow(false);
        sessionStorage.setItem("push-prompt-dismissed", "1");
      }
    } catch {
      // Ignore
    } finally {
      setSubscribing(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setShow(false);
    sessionStorage.setItem("push-prompt-dismissed", "1");
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">🔔</span>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-sm mb-1">
              Push-Benachrichtigungen
            </h3>
            <p className="text-xs text-gray-600 mb-3">
              Möchtest du sofort benachrichtigt werden, wenn es neue Treffer gibt? Du kannst dies jederzeit in den Einstellungen ändern.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleEnable}
                disabled={subscribing}
                className="flex-1 text-xs py-2 px-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {subscribing ? "Aktiviere..." : "✓ Aktivieren"}
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs py-2 px-3 text-gray-500 hover:text-gray-700 transition"
              >
                Später
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-300 hover:text-gray-500 transition"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
