import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";

export function useRailDisclosure({
  defaultOpen = false,
  enabled,
  onClose,
  transition,
}: {
  defaultOpen?: boolean;
  enabled: boolean;
  onClose?: () => void;
  transition?: (update: () => void) => void;
}) {
  const [open, setOpen] = useState(() => enabled && defaultOpen);
  const userClosedRef = useRef(false);
  const previousEnabledRef = useRef(enabled);
  const commit = useMemo(
    () => transition ?? ((update: () => void) => update()),
    [transition],
  );

  useEffect(() => {
    const wasEnabled = previousEnabledRef.current;
    previousEnabledRef.current = enabled;

    if (!enabled) {
      if (open) commit(() => setOpen(false));
      return;
    }

    if (!wasEnabled && defaultOpen && !userClosedRef.current) {
      commit(() => setOpen(true));
    }
  }, [commit, defaultOpen, enabled, open]);

  useEffect(() => {
    if (!enabled || !open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      userClosedRef.current = true;
      commit(() => setOpen(false));
      onClose?.();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [commit, enabled, onClose, open]);

  return {
    close: () => {
      userClosedRef.current = true;
      commit(() => setOpen(false));
      onClose?.();
    },
    open,
    setOpen: (nextValue: SetStateAction<boolean>) =>
      commit(() =>
        setOpen((current) => {
          const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
          userClosedRef.current = !next;
          return next;
        }),
      ),
    toggle: () =>
      commit(() =>
        setOpen((value) => {
          const next = !value;
          userClosedRef.current = !next;
          return next;
        }),
      ),
  };
}
