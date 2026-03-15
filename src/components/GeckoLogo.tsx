// Gecko Logo — Midjourney Design
import Image from "next/image";

export function GeckoLogo({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <Image
      src="/gecko-logo.png"
      alt="Checko Gecko"
      width={200}
      height={200}
      className={className}
      priority
    />
  );
}
