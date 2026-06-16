import * as Tooltip from "@radix-ui/react-tooltip";

interface Props {
  label?: string;
  children: React.ReactNode;
}

export function ComingSoonOverlay({ label = "Coming soon", children }: Props) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className="relative">
            <div className="pointer-events-none grayscale opacity-40">{children}</div>
            <div
              className="absolute inset-0 backdrop-blur-[2px] flex items-start justify-end p-1"
              aria-hidden
            >
              <span className="text-xs bg-white/80 rounded px-1 py-0.5 text-grey leading-none select-none">
                🔒
              </span>
            </div>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-grey-dark text-white text-xs rounded px-2 py-1 shadow-md z-50"
            sideOffset={4}
          >
            {label}
            <Tooltip.Arrow className="fill-grey-dark" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
