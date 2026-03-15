"use client";

import { useState, useEffect } from "react";

interface WheelSettings {
  regMin: number;
  regMax: number;
  dailyMin: number;
  dailyMax: number;
  regEnabled: boolean;
  dailyEnabled: boolean;
}

export default function AdminSettingsPage() {
  const [wheelSettings, setWheelSettings] = useState<WheelSettings>({
    regMin: 1,
    regMax: 50,
    dailyMin: 1,
    dailyMax: 10,
    regEnabled: true,
    dailyEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Settings beim Laden der Seite abrufen
  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/admin/settings/wheel");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setWheelSettings(data.settings);
    } catch {
      setMessage({ type: "error", text: "Einstellungen konnten nicht geladen werden." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    // Client-Validierung
    if (wheelSettings.regMax < wheelSettings.regMin) {
      setMessage({ type: "error", text: "Registrierung Max muss >= Min sein." });
      setSaving(false);
      return;
    }
    if (wheelSettings.dailyMax < wheelSettings.dailyMin) {
      setMessage({ type: "error", text: "Täglich Max muss >= Min sein." });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/settings/wheel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wheelSettings),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Speichern");
      }

      setMessage({ type: "success", text: "Glücksrad-Einstellungen gespeichert!" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Fehler beim Speichern",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(field: "regEnabled" | "dailyEnabled") {
    const newValue = !wheelSettings[field];
    const updated = { ...wheelSettings, [field]: newValue };
    setWheelSettings(updated);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/settings/wheel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      if (!res.ok) {
        // Revert on error
        setWheelSettings((prev) => ({ ...prev, [field]: !newValue }));
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Speichern");
      }

      const label = field === "regEnabled" ? "Registrierungs-Glücksrad" : "Tägliches Glücksrad";
      setMessage({
        type: "success",
        text: `${label} ${newValue ? "aktiviert" : "deaktiviert"}!`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Fehler beim Speichern",
      });
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Einstellungen</h1>

      {/* Glücksrad Aktivierung */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          🎡 Glücksrad aktivieren / deaktivieren
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Schalte die Glücksräder ein oder aus. Deaktivierte Räder zeigen den Nutzern eine
          &quot;Nicht verfügbar&quot;-Meldung.
        </p>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
            <p className="text-sm text-gray-500 mt-2">Laden...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Registrierungs-Glücksrad Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-gray-100 bg-gray-50">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  🎁 Registrierungs-Glücksrad
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Willkommens-Glücksrad für neue Nutzer
                </p>
              </div>
              <button
                onClick={() => handleToggle("regEnabled")}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  wheelSettings.regEnabled
                    ? "bg-emerald-500 focus:ring-emerald-500"
                    : "bg-red-400 focus:ring-red-400"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    wheelSettings.regEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  wheelSettings.regEnabled
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {wheelSettings.regEnabled ? "Aktiv" : "Inaktiv"}
              </span>
            </div>

            {/* Tägliches Glücksrad Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-gray-100 bg-gray-50">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  🔄 Tägliches Glücksrad
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tägliche Drehung für aktive Nutzer
                </p>
              </div>
              <button
                onClick={() => handleToggle("dailyEnabled")}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  wheelSettings.dailyEnabled
                    ? "bg-emerald-500 focus:ring-emerald-500"
                    : "bg-red-400 focus:ring-red-400"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    wheelSettings.dailyEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  wheelSettings.dailyEnabled
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {wheelSettings.dailyEnabled ? "Aktiv" : "Inaktiv"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Glücksrad-Einstellungen (Min/Max) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          🎰 Glücksrad-Einstellungen
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Definiere die Min/Max-Gewinne für das Registrierungs- und tägliche Glücksrad.
          Staffelung: User 1-100 erhalten fix Max, User 101-200 erhalten Min-Max,
          User 201+ erhalten Min bis Max/2.
        </p>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
            <p className="text-sm text-gray-500 mt-2">Laden...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Registrierungs-Glücksrad */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                🎁 Registrierungs-Glücksrad (Checkos)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Minimum
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={wheelSettings.regMin}
                    onChange={(e) =>
                      setWheelSettings((s) => ({
                        ...s,
                        regMin: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Maximum
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={wheelSettings.regMax}
                    onChange={(e) =>
                      setWheelSettings((s) => ({
                        ...s,
                        regMax: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Tägliches Glücksrad */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                🔄 Tägliches Glücksrad (Checkos)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Minimum
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={wheelSettings.dailyMin}
                    onChange={(e) =>
                      setWheelSettings((s) => ({
                        ...s,
                        dailyMin: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Maximum
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={wheelSettings.dailyMax}
                    onChange={(e) =>
                      setWheelSettings((s) => ({
                        ...s,
                        dailyMax: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Speichern Button + Feedback */}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Speichern..." : "💾 Speichern"}
              </button>
              {message && (
                <span
                  className={`text-sm ${
                    message.type === "success" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {message.text}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Platzhalter für zukünftige Einstellungen */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <span className="text-4xl block mb-4">⚙️</span>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Weitere Einstellungen kommen bald
        </h2>
        <p className="text-gray-500 text-sm">
          Hier werden zukünftig Branding, API-Keys, Wartungsmodus und Backup-Optionen
          konfiguriert.
        </p>
      </div>
    </div>
  );
}
