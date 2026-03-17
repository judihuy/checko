// Einstellungen-Seite — /dashboard/einstellungen
// Benachrichtigungs-Kanäle verwalten
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Preference {
  id: string;
  channel: string;
  enabled: boolean;
  config: string | null;
}

// Kanal-Konfiguration
const CHANNEL_CONFIG: Record<
  string,
  {
    label: string;
    icon: string;
    description: string;
    cost: string | null;
    alwaysActive?: boolean;
    placeholder?: boolean;
  }
> = {
  inapp: {
    label: "In-App",
    icon: "🔔",
    description: "Benachrichtigungen direkt in Checko",
    cost: null,
    alwaysActive: true,
  },
  email: {
    label: "E-Mail",
    icon: "📧",
    description: "Benachrichtigungen per E-Mail",
    cost: null,
  },
  telegram: {
    label: "Telegram Bot",
    icon: "✈️",
    description: "Nachrichten über Telegram erhalten",
    cost: null,
    placeholder: true,
  },
  push: {
    label: "Browser Push",
    icon: "🌐",
    description: "Push-Benachrichtigungen im Browser",
    cost: null,
    placeholder: true,
  },
  whatsapp: {
    label: "WhatsApp",
    icon: "💬",
    description: "Nachrichten über WhatsApp erhalten",
    cost: "1 Checko pro 10 Nachrichten",
  },
  sms: {
    label: "SMS",
    icon: "📱",
    description: "Benachrichtigungen per SMS",
    cost: "1 Checko pro SMS",
  },
};

const CHANNEL_ORDER = ["inapp", "email", "telegram", "push", "whatsapp", "sms"];

export default function EinstellungenPage() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/preferences");
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences);
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Toggle-Handler
  const handleToggle = async (channel: string, enabled: boolean) => {
    // In-App kann nicht deaktiviert werden
    if (channel === "inapp") return;

    setSaving(channel);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, enabled }),
      });
      if (res.ok) {
        setPreferences((prev) =>
          prev.map((p) => (p.channel === channel ? { ...p, enabled } : p))
        );
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setSaving(null);
    }
  };

  // Preference für Channel finden
  const getPreference = (channel: string): boolean => {
    const pref = preferences.find((p) => p.channel === channel);
    return pref?.enabled ?? false;
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/dashboard" className="hover:text-emerald-600 transition">
            Dashboard
          </Link>
          <span>›</span>
          <span>Einstellungen</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">⚙️ Einstellungen</h1>
        <p className="text-gray-500 text-sm mt-1">
          Verwalte deine Benachrichtigungs-Kanäle
        </p>
      </div>

      {/* Benachrichtigungs-Kanäle */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">
            Benachrichtigungs-Kanäle
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Wähle, wie du über neue Treffer informiert werden möchtest
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Laden...</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {CHANNEL_ORDER.map((channel) => {
              const config = CHANNEL_CONFIG[channel];
              if (!config) return null;

              const enabled = config.alwaysActive || getPreference(channel);
              const isSaving = saving === channel;

              return (
                <div
                  key={channel}
                  className="px-5 py-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl flex-shrink-0">{config.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm">
                          {config.label}
                        </span>
                        {config.cost && (
                          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">
                            💰 {config.cost}
                          </span>
                        )}
                        {!config.cost && !config.alwaysActive && (
                          <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">
                            Gratis
                          </span>
                        )}
                        {config.alwaysActive && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                            Immer aktiv
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {config.description}
                      </p>
                      {config.placeholder && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          Demnächst verfügbar
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Toggle / Button */}
                  <div className="flex-shrink-0">
                    {config.placeholder && channel === "telegram" ? (
                      <button
                        disabled
                        className="px-3 py-1.5 text-xs bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed"
                      >
                        Bot verbinden
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          !config.alwaysActive &&
                          !config.placeholder &&
                          handleToggle(channel, !enabled)
                        }
                        disabled={
                          config.alwaysActive || config.placeholder || isSaving
                        }
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          config.alwaysActive || config.placeholder
                            ? "cursor-not-allowed"
                            : "cursor-pointer"
                        } ${
                          enabled ? "bg-emerald-500" : "bg-gray-200"
                        } ${config.alwaysActive ? "opacity-60" : ""}`}
                        aria-label={`${config.label} ${
                          enabled ? "deaktivieren" : "aktivieren"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            enabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info-Box */}
      <div className="mt-4 bg-emerald-50 rounded-xl p-4 border border-emerald-200">
        <p className="text-sm text-emerald-800">
          <strong>Tipp:</strong> In-App und E-Mail Benachrichtigungen sind
          kostenlos. WhatsApp und SMS werden von deinem Checko-Guthaben
          abgezogen.
        </p>
      </div>

      {/* Zurück-Link */}
      <div className="mt-6 text-center">
        <Link
          href="/dashboard/benachrichtigungen"
          className="text-sm text-emerald-600 hover:text-emerald-700 transition font-medium"
        >
          ← Zu den Benachrichtigungen
        </Link>
      </div>
    </div>
  );
}
