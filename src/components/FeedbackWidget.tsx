import { useState } from "react";
import { useLocation } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { submitFeedback } from "../api/client";

const HELP_DESK_URL = "https://www.chameleoncloud.org/user/help/ticket/new/guest/";

type Sentiment = "up" | "down";
type Status = "idle" | "submitting" | "submitted" | "error";

interface Props {
  filtersSummary?: string;
}

export function FeedbackWidget({ filtersSummary }: Props) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  function reset() {
    setSentiment(null);
    setComment("");
    setStatus("idle");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleSubmit() {
    if (!sentiment) return;
    setStatus("submitting");
    try {
      await submitFeedback({
        page: location.pathname,
        sentiment,
        comment: comment.trim() || undefined,
        filters: filtersSummary || undefined,
      });
      setStatus("submitted");
      setTimeout(() => setOpen(false), 1200);
    } catch {
      setStatus("error");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          className="flex flex-col items-center gap-0.5 text-grey-dark hover:text-link transition-colors"
          aria-label="Give feedback"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <span className="text-[10px] text-grey-med leading-none whitespace-nowrap">Feedback</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50 animate-in fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white z-50 rounded-lg shadow-2xl p-6"
          aria-label="Send feedback"
        >
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-grey-dark">How's it going?</Dialog.Title>
              <Dialog.Description className="text-xs text-grey mt-0.5">
                Let us know what's working or not.
              </Dialog.Description>
            </div>
            <Dialog.Close className="text-grey hover:text-grey-dark p-1 rounded hover:bg-grey-lighter flex-shrink-0" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>

          {status === "submitted" ? (
            <p className="text-sm text-grey-dark">Thanks for the feedback!</p>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3">
                {(["up", "down"] as Sentiment[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSentiment(s)}
                    aria-pressed={sentiment === s}
                    aria-label={s === "up" ? "Thumbs up" : "Thumbs down"}
                    className={`flex-1 py-2 rounded-md border text-2xl transition-colors ${
                      sentiment === s
                        ? "border-brand-info bg-brand-info/10"
                        : "border-grey-light hover:bg-grey-lighter"
                    }`}
                  >
                    {s === "up" ? "👍" : "👎"}
                  </button>
                ))}
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Anything you'd like us to know? (optional)"
                rows={3}
                className="w-full text-sm border border-grey-light rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-info/40"
              />

              {status === "error" && (
                <p className="text-sm text-red-600">Couldn't send feedback. Please try again.</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={!sentiment || status === "submitting"}
                className="w-full py-2 rounded-md bg-brand-info text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === "submitting" ? "Sending…" : "Send feedback"}
              </button>
            </div>
          )}

          <p className="text-xs text-grey mt-4 text-center">
            Need more help?{" "}
            <a
              href={HELP_DESK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link hover:underline"
            >
              Open a support ticket
            </a>
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
