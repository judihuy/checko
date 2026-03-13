// Gecko SVG Logo Placeholder
// Professional gecko illustration for the Checko brand

export function GeckoLogo({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Body */}
      <ellipse cx="60" cy="62" rx="28" ry="35" fill="#10B981" />
      {/* Belly */}
      <ellipse cx="60" cy="68" rx="18" ry="22" fill="#A7F3D0" />
      {/* Head */}
      <ellipse cx="60" cy="28" rx="20" ry="16" fill="#10B981" />
      {/* Left eye */}
      <circle cx="50" cy="24" r="6" fill="white" />
      <circle cx="51" cy="23" r="3" fill="#064E3B" />
      <circle cx="52" cy="22" r="1" fill="white" />
      {/* Right eye */}
      <circle cx="70" cy="24" r="6" fill="white" />
      <circle cx="71" cy="23" r="3" fill="#064E3B" />
      <circle cx="72" cy="22" r="1" fill="white" />
      {/* Smile */}
      <path
        d="M52 32 Q60 38 68 32"
        stroke="#064E3B"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Left arm */}
      <path
        d="M34 55 Q20 50 15 58"
        stroke="#10B981"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Left hand */}
      <circle cx="15" cy="58" r="4" fill="#10B981" />
      {/* Right arm */}
      <path
        d="M86 55 Q100 50 105 58"
        stroke="#10B981"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right hand */}
      <circle cx="105" cy="58" r="4" fill="#10B981" />
      {/* Left leg */}
      <path
        d="M42 90 Q30 100 25 108"
        stroke="#10B981"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="25" cy="108" r="4" fill="#10B981" />
      {/* Right leg */}
      <path
        d="M78 90 Q90 100 95 108"
        stroke="#10B981"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="95" cy="108" r="4" fill="#10B981" />
      {/* Tail */}
      <path
        d="M60 97 Q65 110 75 112 Q85 114 80 105"
        stroke="#10B981"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
