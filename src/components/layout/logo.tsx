export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill={inverted ? "#fff" : "#0f4a72"} />
        <path
          d="M8 19.5 10 14a2 2 0 0 1 1.9-1.3h8.2A2 2 0 0 1 22 14l2 5.5v3a.8.8 0 0 1-.8.8H22M10 23.3H8.8a.8.8 0 0 1-.8-.8v-3h16"
          fill="none"
          stroke={inverted ? "#0f4a72" : "#fff"}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="22.5" r="1.7" fill="#fba524" />
        <circle cx="20" cy="22.5" r="1.7" fill="#fba524" />
      </svg>
      <span className={`text-lg font-bold tracking-tight ${inverted ? "text-white" : "text-brand-900"}`}>
        Drive<span className="text-accent-500">Easy</span>
      </span>
    </span>
  );
}
