// Daily Wheel Widget für das Dashboard
// Zeigt Status: verfügbar (grün) oder gesperrt (grau + Grund)
"use client";

import { useState, useEffect, useCallback } from "react";
import { WheelSpinner } from "@/components/WheelSpinner";

interface WheelStatus {
  available: boolean;
  reason?: string;
  nextSpinAt?: string;
  lastAmount?: number;
}

export function DailyWheelWidget() {
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWheel, setShowWheel] = useState(false);
  const [countdown, setCountdown] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wheel/daily");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Countdown Timer
  useEffect(() => {
    if (!status?.nextSpinAt) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const target = new Date(status.nextSpinAt!).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setCountdown("");
        loadStatus(); // Status aktualisieren
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setCountdown(`${hours}h ${minutes}min`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Jede Minute
    return () => clearInterval(interval);
  }, [status?.nextSpinAt, loadStatus]);

  const handleComplete = () => {
    setShowWheel(false);
    loadStatus();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-10 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  // Wheel-Modal
  if (showWheel) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <h2 className="text-xl font-bold text-center text-gray-900 mb-6">
            🎡 Tägliches Glücksrad
          </h2>
          <WheelSpinner
            type="daily"
            onComplete={handleComplete}
            buttonText="🎰 Jetzt drehen!"
          />
          <button
            onClick={() => setShowWheel(false)}
            className="mt-4 w-full text-gray-500 hover:text-gray-700 text-sm py-2"
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-5 transition-all ${
        status?.available
          ? "bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200 hover:shadow-lg cursor-pointer"
          : "bg-gray-50 border-gray-200"
      }`}
      onClick={status?.available ? () => setShowWheel(true) : undefined}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            🎡 Tägliches Glücksrad
          </h3>
          {status?.available ? (
            <p className="text-sm text-emerald-600 font-medium mt-1">
              ✨ Bereit zum Drehen! (1-5 Checkos)
            </p>
          ) : status?.reason === "cooldown" ? (
            <p className="text-sm text-gray-500 mt-1">
              ⏳ Nächster Spin in {countdown || "kürze"}
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-1">
              💡 Verbrauche erst einen Checko, dann dreh wieder!
            </p>
          )}
        </div>

        {status?.available ? (
          <button
            className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-lg font-medium text-sm hover:from-yellow-500 hover:to-orange-600 transition shadow"
          >
            Drehen!
          </button>
        ) : (
          <div className="bg-gray-200 text-gray-400 px-4 py-2 rounded-lg font-medium text-sm">
            Gesperrt
          </div>
        )}
      </div>
    </div>
  );
}
