export function JournalIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 4v16M8 4a2 2 0 012-2h6a2 2 0 012 2v0M10 7h4M10 11h4M10 15h2" />
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  );
}
