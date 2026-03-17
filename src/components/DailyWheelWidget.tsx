// Daily Wheel Widget für das Dashboard
// Zeigt Status: verfügbar (grün), gesperrt (grau + Grund), oder deaktiviert
// UX-Fix: Dynamische Range aus DB, Bonus-Spins, Countdown
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { WheelSpinner } from "@/components/WheelSpinner";

interface WheelStatus {
  available: boolean;
  reason?: string;
  nextSpinAt?: string;
  lastAmount?: number;
  dailyEnabled?: boolean;
  canSpin?: boolean;
  bonusSpins?: number;
  dailyMin?: number;
  dailyMax?: number;
}

export function DailyWheelWidget() {
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWheel, setShowWheel] = useState(false);
  const [countdown, setCountdown] = useState("");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Countdown Timer — jede Sekunde für genauen Countdown
  useEffect(() => {
    if (!status?.nextSpinAt) {
      setCountdown("");
      return;
    }

    const updateCountdown = () => {
      const now = new Date().getTime();
      const target = new Date(status.nextSpinAt!).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setCountdown("");
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        loadStatus(); // Status aktualisieren
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setCountdown(`${hours}h ${minutes}min`);
    };

    updateCountdown();
    countdownRef.current = setInterval(updateCountdown, 60000);
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
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

  // Wenn Glücksrad deaktiviert ist
  if (status?.dailyEnabled === false) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              🎡 Tägliches Glücksrad
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Das Glücksrad ist aktuell nicht verfügbar.
            </p>
          </div>
          <div className="bg-gray-200 text-gray-400 px-4 py-2 rounded-lg font-medium text-sm">
            Pausiert
          </div>
        </div>
      </div>
    );
  }

  // Dynamische Range aus DB
  const minPrize = status?.dailyMin ?? 1;
  const maxPrize = status?.dailyMax ?? 10;
  const bonusSpins = status?.bonusSpins ?? 0;
  const canSpin = status?.available === true;

  // Wheel-Modal
  if (showWheel) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <h2 className="text-xl font-bold text-center text-gray-900 mb-2">
            🎡 Tägliches Glücksrad
          </h2>
          <p className="text-center text-sm text-orange-600 font-medium mb-6">
            ⏰ Dieses Angebot ist zeitlich begrenzt!
          </p>
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

  // Status-Text bestimmen
  const renderStatusText = () => {
    if (bonusSpins > 0) {
      return (
        <p className="text-sm text-yellow-600 font-medium mt-1">
          🎰 {bonusSpins} Bonus-Drehung{bonusSpins !== 1 ? "en" : ""} übrig
        </p>
      );
    }
    if (canSpin) {
      return (
        <p className="text-sm text-emerald-600 font-medium mt-1">
          ✅ Bereit zum Drehen! (Gewinne {minPrize}–{maxPrize} Checkos)
        </p>
      );
    }
    if (status?.reason === "cooldown") {
      return (
        <p className="text-sm text-gray-500 mt-1">
          ⏳ Nächste Drehung in {countdown || "Kürze"}
        </p>
      );
    }
    return (
      <p className="text-sm text-gray-500 mt-1">
        💡 Verbrauche erst einen Checko, dann dreh wieder!
      </p>
    );
  };

  const isClickable = canSpin || bonusSpins > 0;

  return (
    <div
      className={`rounded-xl border p-5 transition-all ${
        isClickable
          ? "bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200 hover:shadow-lg cursor-pointer"
          : "bg-gray-50 border-gray-200"
      }`}
      onClick={isClickable ? () => setShowWheel(true) : undefined}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            🎡 Tägliches Glücksrad
          </h3>
          {renderStatusText()}
          {isClickable && (
            <p className="text-xs text-orange-500 mt-0.5">
              ⏰ Dieses Angebot ist zeitlich begrenzt!
            </p>
          )}
        </div>

        {isClickable ? (
          <button className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-lg font-medium text-sm hover:from-yellow-500 hover:to-orange-600 transition shadow">
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
