// Glücksrad-Komponente — Animiertes Rad mit Konfetti + Kontostand-Hochzählen
// BUG-FIX: Server bestimmt den Gewinn, Frontend dreht das Rad GENAU auf das richtige Segment.
// KEIN Math.random() im Frontend für den Gewinn!
"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ==================== KONFETTI (CSS-only) ====================

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  scale: number;
  delay: number;
  duration: number;
  shape: "rect" | "circle";
}

function ConfettiEffect() {
  const colors = [
    "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6",
    "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  ];

  const particles: Particle[] = Array.from({ length: 80 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: -10 - Math.random() * 20,
    color: colors[i % colors.length],
    rotation: Math.random() * 360,
    scale: 0.5 + Math.random() * 1,
    delay: Math.random() * 0.8,
    duration: 2 + Math.random() * 2.5,
    shape: Math.random() > 0.5 ? "rect" : "circle",
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
            animationDuration: `${p.duration}s`,
          }}
        >
          <div
            className={p.shape === "circle" ? "w-3 h-3 rounded-full" : "w-3 h-3 rounded-sm"}
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

// ==================== KONTOSTAND HOCHZÄHLEN ====================

function CountUpDisplay({ from, to }: { from: number; to: number }) {
  const [current, setCurrent] = useState(from);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const duration = 1500; // 1.5 Sekunden
    const startTime = performance.now();
    const diff = to - from;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic für natürlichen Effekt
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(from + diff * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [from, to]);

  return (
    <span className="tabular-nums font-bold text-2xl text-emerald-600">
      {current} Checkos 🦎
    </span>
  );
}

// ==================== RAD-SEGMENTE ====================

const SEGMENTS = [
  { label: "1", value: 1, color: "#ef4444" },
  { label: "5", value: 5, color: "#f59e0b" },
  { label: "2", value: 2, color: "#10b981" },
  { label: "10", value: 10, color: "#3b82f6" },
  { label: "3", value: 3, color: "#8b5cf6" },
  { label: "20", value: 20, color: "#ec4899" },
  { label: "1", value: 1, color: "#14b8a6" },
  { label: "50", value: 50, color: "#f97316" },
  { label: "5", value: 5, color: "#06b6d4" },
  { label: "15", value: 15, color: "#84cc16" },
  { label: "2", value: 2, color: "#e11d48" },
  { label: "8", value: 8, color: "#7c3aed" },
];

/**
 * Berechnet die Rotation, damit der Pfeil (oben, 12-Uhr-Position)
 * auf ein bestimmtes Segment zeigt.
 *
 * Der Pfeil steht fest oben. Das Rad dreht sich im Uhrzeigersinn.
 * Segment 0 startet bei -90° (12-Uhr). Wir müssen das Rad so drehen,
 * dass die Mitte des Ziel-Segments unter dem Pfeil (oben) liegt.
 */
function getTargetRotation(segmentIndex: number, currentRotation: number): number {
  const segmentAngle = 360 / SEGMENTS.length;
  // Mitte des Segments (relativ zum Startpunkt)
  const segmentCenter = segmentIndex * segmentAngle + segmentAngle / 2;
  // Rad muss so gedreht werden, dass segmentCenter bei 0° (oben/12-Uhr) steht
  // Dafür: 360 - segmentCenter (weil Drehung im Uhrzeigersinn)
  const targetAngle = 360 - segmentCenter;

  // Mindestens 5 volle Umdrehungen + bis zum Ziel
  const fullSpins = 360 * (5 + Math.floor(Math.random() * 3));
  // Auf aktuelle Rotation aufrechnen, damit immer vorwärts gedreht wird
  const baseRotation = Math.ceil(currentRotation / 360) * 360;
  return baseRotation + fullSpins + targetAngle;
}

/**
 * Findet den Index des Segments mit dem gegebenen Wert.
 * Falls mehrere Segmente den gleichen Wert haben, wird zufällig eines gewählt.
 */
function findSegmentIndex(amount: number): number {
  const matching = SEGMENTS
    .map((seg, idx) => ({ seg, idx }))
    .filter(({ seg }) => seg.value === amount);

  if (matching.length === 0) {
    // Fallback: nächsten Wert finden
    let closest = 0;
    let minDiff = Infinity;
    SEGMENTS.forEach((seg, idx) => {
      const diff = Math.abs(seg.value - amount);
      if (diff < minDiff) {
        minDiff = diff;
        closest = idx;
      }
    });
    return closest;
  }

  // Zufällig eines der passenden Segmente wählen (rein visuell, Gewinn steht fest)
  return matching[Math.floor(Math.random() * matching.length)].idx;
}

// ==================== PHASEN ====================

type Phase =
  | "idle"        // Bereit zum Drehen
  | "spinning"    // Rad dreht sich
  | "landed"      // Rad steht, kurze Pause
  | "celebration" // Konfetti + grosse Gewinnanzeige
  | "counting"    // Kontostand zählt hoch
  | "done";       // Fertig, "Weiter" Button

// ==================== HAUPTKOMPONENTE ====================

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState("");
  const [previousBalance, setPreviousBalance] = useState<number | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup Timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const spin = useCallback(async () => {
    if (phase !== "idle" || disabled) return;

    setPhase("spinning");
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
        setPhase("idle");
        return;
      }

      const amount = data.amount as number;
      const prevBal = typeof data.previousBalance === "number" ? data.previousBalance : null;
      const newBal = typeof data.newBalance === "number" ? data.newBalance : null;

      setResult(amount);
      if (prevBal !== null) setPreviousBalance(prevBal);
      if (newBal !== null) {
        setNewBalance(newBal);
      } else if (prevBal !== null) {
        setNewBalance(prevBal + amount);
      }

      // Server bestimmt das Ziel-Segment — KEIN eigener RNG im Frontend!
      const segIdx = typeof data.targetSegment === "number"
        ? data.targetSegment
        : findSegmentIndex(amount); // Fallback falls Server kein targetSegment liefert
      const targetRotation = getTargetRotation(segIdx, rotation);
      setRotation(targetRotation);

      // Phase-Ablauf mit Timern:
      // 3s Spin → 500ms Pause (landed) → 2.5s Celebration → 1.5s Counting → done

      timerRef.current = setTimeout(() => {
        // Rad ist gelandet
        setPhase("landed");

        timerRef.current = setTimeout(() => {
          // Konfetti + grosse Anzeige
          setPhase("celebration");

          timerRef.current = setTimeout(() => {
            // Kontostand hochzählen (nur wenn Balances vorhanden)
            if (prevBal !== null) {
              setPhase("counting");

              timerRef.current = setTimeout(() => {
                setPhase("done");
              }, 2000); // 1.5s counting + 0.5s buffer
            } else {
              setPhase("done");
            }
          }, 2500); // 2.5s celebration
        }, 500); // 500ms pause
      }, 3000); // 3s spin
    } catch {
      setError("Netzwerkfehler. Bitte versuche es erneut.");
      setPhase("idle");
    }
  }, [phase, disabled, type, rotation]);

  const handleClose = () => {
    setPhase("idle");
    onComplete?.(result ?? 0);
  };

  // Auto-close nach 5s in done-Phase
  useEffect(() => {
    if (phase === "done") {
      const autoClose = setTimeout(() => {
        onComplete?.(result ?? 0);
      }, 5000);
      return () => clearTimeout(autoClose);
    }
  }, [phase, result, onComplete]);

  const segmentAngle = 360 / SEGMENTS.length;
  const showConfetti = phase === "celebration" || phase === "counting" || phase === "done";
  const showWinDisplay = phase === "celebration" || phase === "counting" || phase === "done";
  const showCountUp = phase === "counting" || phase === "done";

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
            transition: phase === "spinning"
              ? "transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
              : "none",
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

        {/* Glow-Effekt wenn gelandet — kein Scale/Resize! Nur subtiler Glow */}
        {(phase === "landed" || showWinDisplay) && (
          <div className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: "0 0 25px rgba(245, 158, 11, 0.5)" }} />
        )}
      </div>

      {/* Gewinn-Anzeige (gross, nach dem Landen) — kein scale-Animation! */}
      {showWinDisplay && result !== null && (
        <div className="text-center animate-fade-in">
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-2xl px-8 py-5 shadow-xl relative overflow-hidden">
            {/* Gecko-Animation (C) — nach Spin als Overlay */}
            <div className="absolute -right-2 -bottom-2 w-20 h-20 opacity-80 rounded-lg overflow-hidden">
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="w-full h-full object-cover"
              >
                <source src="/gecko-05.mp4" type="video/mp4" />
              </video>
            </div>
            <p className="text-lg font-medium relative z-10">🎉 Gewonnen!</p>
            <p className="text-4xl font-bold mt-1 relative z-10">
              {result} Checkos 🦎
            </p>
          </div>
        </div>
      )}

      {/* Kontostand-Animation — kein scale! */}
      {showCountUp && previousBalance !== null && newBalance !== null && (
        <div className="text-center animate-fade-in">
          <p className="text-sm text-gray-500 mb-1">Dein Guthaben:</p>
          <CountUpDisplay from={previousBalance} to={newBalance} />
        </div>
      )}

      {/* Fehler */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm max-w-xs text-center">
          {error}
        </div>
      )}

      {/* Buttons je nach Phase */}
      {phase === "idle" && (
        <button
          onClick={spin}
          disabled={disabled}
          className={`
            px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all
            ${
              disabled
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:from-yellow-500 hover:to-orange-600 hover:shadow-xl hover:scale-105 active:scale-95"
            }
          `}
        >
          {buttonText || "🎡 Glücksrad drehen!"}
        </button>
      )}

      {phase === "spinning" && (
        <div className="px-8 py-4 rounded-xl font-bold text-lg bg-gray-200 text-gray-500">
          🎰 Dreht...
        </div>
      )}

      {phase === "done" && (
        <button
          onClick={handleClose}
          className="px-8 py-3 rounded-xl font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
        >
          Weiter →
        </button>
      )}
    </div>
  );
}
