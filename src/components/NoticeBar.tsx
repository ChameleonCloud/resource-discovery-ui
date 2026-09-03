interface Props {
  message: string;
  onDismiss: () => void;
}

export function NoticeBar({ message, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 bg-red-50 border border-red-300 rounded-md px-4 py-3 text-sm text-red-900"
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className="text-red-900 hover:text-brand-danger flex-shrink-0 leading-none"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}
