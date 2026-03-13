// Glücksrad-Komponente — Animiertes Rad mit Konfetti
"use client";

import { useState, useCallback } from "react";

// Konfetti-Partikel
interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  scale: number;
  delay: number;
}

function ConfettiEffect() {
  const colors = [
    "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6",
    "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  ];

  const particles: Particle[] = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: -10 - Math.random() * 20,
    color: colors[i % colors.length],
    rotation: Math.random() * 360,
    scale: 0.5 + Math.random() * 1,
    delay: Math.random() * 0.5,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${2 + Math.random() * 2}s`,
          }}
        >
          <div
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: p.color,
              transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// Rad-Segmente
const SEGMENTS = [
  { label: "1", color: "#ef4444" },
  { label: "5", color: "#f59e0b" },
  { label: "2", color: "#10b981" },
  { label: "10", color: "#3b82f6" },
  { label: "3", color: "#8b5cf6" },
  { label: "20", color: "#ec4899" },
  { label: "1", color: "#14b8a6" },
  { label: "50", color: "#f97316" },
  { label: "5", color: "#06b6d4" },
  { label: "15", color: "#84cc16" },
  { label: "2", color: "#e11d48" },
  { label: "8", color: "#7c3aed" },
];

interface WheelSpinnerProps {
  type: "registration" | "daily";
  onComplete?: (amount: number) => void;
  disabled?: boolean;
  buttonText?: string;
}

export function WheelSpinner({
  type,
  onComplete,
  disabled = false,
  buttonText,
}: WheelSpinnerProps) {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState("");

  const spin = useCallback(async () => {
    if (spinning || disabled) return;

    setSpinning(true);
    setError("");
    setResult(null);

    try {
      const endpoint =
        type === "registration"
          ? "/api/wheel/registration"
          : "/api/wheel/daily";

      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Fehler beim Drehen.");
        setSpinning(false);
        return;
      }

      const amount = data.amount as number;

      // Zufällige Rotation (min. 5 volle Drehungen + zufälliger Winkel)
      const extraRotation = 360 * (5 + Math.floor(Math.random() * 5)) + Math.random() * 360;
      const newRotation = rotation + extraRotation;
      setRotation(newRotation);

      // Nach der Animation (3s) das Ergebnis zeigen
      setTimeout(() => {
        setResult(amount);
        setSpinning(false);
        setShowConfetti(true);

        // Konfetti nach 4s ausblenden
        setTimeout(() => setShowConfetti(false), 4000);

        onComplete?.(amount);
      }, 3000);
    } catch {
      setError("Netzwerkfehler. Bitte versuche es erneut.");
      setSpinning(false);
    }
  }, [spinning, disabled, type, rotation, onComplete]);

  const segmentAngle = 360 / SEGMENTS.length;

  return (
    <div className="flex flex-col items-center gap-6">
      {showConfetti && <ConfettiEffect />}

      {/* Rad */}
      <div className="relative w-72 h-72 sm:w-80 sm:h-80">
        {/* Zeiger (oben) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
          <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-yellow-400 drop-shadow-lg" />
        </div>

        {/* Drehbares Rad */}
        <div
          className="w-full h-full rounded-full overflow-hidden shadow-2xl border-4 border-yellow-400"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
          }}
        >
          <svg viewBox="0 0 200 200" className="w-full h-full">
            {SEGMENTS.map((seg, i) => {
              const startAngle = i * segmentAngle - 90;
              const endAngle = (i + 1) * segmentAngle - 90;
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = (endAngle * Math.PI) / 180;

              const x1 = 100 + 100 * Math.cos(startRad);
              const y1 = 100 + 100 * Math.sin(startRad);
              const x2 = 100 + 100 * Math.cos(endRad);
              const y2 = 100 + 100 * Math.sin(endRad);

              const largeArc = segmentAngle > 180 ? 1 : 0;

              const midAngle = ((startAngle + endAngle) / 2) * (Math.PI / 180);
              const textX = 100 + 65 * Math.cos(midAngle);
              const textY = 100 + 65 * Math.sin(midAngle);
              const textRotation = (startAngle + endAngle) / 2 + 90;

              return (
                <g key={i}>
                  <path
                    d={`M 100 100 L ${x1} ${y1} A 100 100 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={seg.color}
                    stroke="white"
                    strokeWidth="0.5"
                  />
                  <text
                    x={textX}
                    y={textY}
                    fill="white"
                    fontSize="14"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${textRotation}, ${textX}, ${textY})`}
                    style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.5)" }}
                  >
                    {seg.label}
                  </text>
                </g>
              );
            })}
            {/* Mittelpunkt */}
            <circle cx="100" cy="100" r="15" fill="white" stroke="#f59e0b" strokeWidth="3" />
            <text
              x="100"
              y="100"
              fill="#f59e0b"
              fontSize="16"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              🦎
            </text>
          </svg>
        </div>
      </div>

      {/* Ergebnis */}
      {result !== null && (
        <div className="text-center animate-bounce-in">
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-2xl px-8 py-4 shadow-xl">
            <p className="text-lg font-medium">🎉 Gewonnen!</p>
            <p className="text-3xl font-bold mt-1">
              {result} Checkos 🦎
            </p>
          </div>
        </div>
      )}

      {/* Fehler */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm max-w-xs text-center">
          {error}
        </div>
      )}

      {/* Button */}
      {result === null && (
        <button
          onClick={spin}
          disabled={spinning || disabled}
          className={`
            px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all
            ${
              spinning || disabled
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:from-yellow-500 hover:to-orange-600 hover:shadow-xl hover:scale-105 active:scale-95"
            }
          `}
        >
          {spinning
            ? "🎰 Dreht..."
            : buttonText || "🎡 Glücksrad drehen!"}
        </button>
      )}
    </div>
  );
}
