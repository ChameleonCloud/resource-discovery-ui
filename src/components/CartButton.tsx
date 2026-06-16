import { Link } from "react-router-dom";

interface Props {
  count: number;
}

export function CartButton({ count }: Props) {
  return (
    <Link
      to="/cart"
      className="relative flex flex-col items-center gap-0.5 text-grey-dark hover:text-link transition-colors"
      aria-label={`Cart (${count} items)`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="21" r="1" />
        <circle cx="19" cy="21" r="1" />
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-brand-primary text-grey-dark text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
      <span className="text-[10px] text-grey-med leading-none whitespace-nowrap">
        {count > 0 ? `${count} node${count !== 1 ? "s" : ""} selected` : "Select nodes to reserve"}
      </span>
    </Link>
  );
}
