"use client";

import { useState, useCallback } from "react";

interface ObfuscatedEmailProps {
  user: string;      // z.B. "info"
  domain: string;    // z.B. "checko.ch"
  className?: string;
}

/**
 * Zeigt eine E-Mail-Adresse obfuskiert an: "info [at] checko [dot] ch"
 * Bei Klick wird die echte Adresse in die Zwischenablage kopiert.
 * KEIN mailto: Link — schützt vor Spam-Bots.
 */
export function ObfuscatedEmail({ user, domain, className }: ObfuscatedEmailProps) {
  const [copied, setCopied] = useState(false);

  // Domain aufteilen: "checko.ch" → "checko [dot] ch"
  const domainObfuscated = domain.replace(/\./g, " [dot] ");
  const displayText = `${user} [at] ${domainObfuscated}`;

  const handleClick = useCallback(async () => {
    const realEmail = `${user}@${domain}`;
    try {
      await navigator.clipboard.writeText(realEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback für ältere Browser
      const textarea = document.createElement("textarea");
      textarea.value = realEmail;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [user, domain]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition ${className || "text-emerald-600 hover:text-emerald-700"}`}
      title="Klicken um E-Mail in die Zwischenablage zu kopieren"
    >
      <span>{displayText}</span>
      {copied ? (
        <span className="text-xs text-emerald-600 font-medium">✓ Kopiert!</span>
      ) : (
        <span className="text-xs text-gray-400">📋</span>
      )}
    </button>
  );
}
