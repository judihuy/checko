// Waitlist-Formular für Coming-Soon Module
// Client Component mit E-Mail-Validierung
"use client";

import { useState } from "react";

interface WaitlistFormProps {
  moduleId: string;
  moduleName: string;
}

export function WaitlistForm({ moduleId, moduleName }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      setStatus("error");
      setMessage("Bitte gib eine gültige E-Mail-Adresse ein.");
      return;
    }

    setStatus("loading");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, email: email.toLowerCase().trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(
          data.alreadyRegistered
            ? `Du bist bereits auf der Warteliste für ${moduleName}.`
            : `Perfekt! Wir benachrichtigen dich, sobald ${moduleName} verfügbar ist.`
        );
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
      }
    } catch {
      setStatus("error");
      setMessage("Verbindungsfehler. Bitte versuche es erneut.");
    }
  };

  if (status === "success") {
    return (
      <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
        <span className="text-emerald-600 text-lg">✓</span>
        <p className="text-sm text-emerald-700">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          placeholder="deine@email.ch"
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          disabled={status === "loading"}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {status === "loading" ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Senden...
            </span>
          ) : (
            "Benachrichtigen"
          )}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-2 text-sm text-red-600">{message}</p>
      )}
    </form>
  );
}
