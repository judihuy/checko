// Gecko Logo — Midjourney SVG (vektorisiert, transparent)
import Image from "next/image";

export function GeckoLogo({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <img
      src="/gecko-logo.svg"
      alt="Checko Gecko"
      className={className}
    />
  );
}
