import { useRef, useEffect } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-med w-5 h-5"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by node type, GPU, site, architecture…"
        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-grey-light bg-white text-grey-dark placeholder:text-grey-med focus:outline-none focus:ring-2 focus:ring-brand-info text-base shadow-sm"
        aria-label="Search resources"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-grey-med hover:text-grey-dark"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
