import { useEffect, useState, type RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function visibleFocusableElements(container: HTMLElement | null) {
  return Array.from(
    container?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
  ).filter((element) => element.getClientRects().length > 0);
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener("change", updateMatch);
    return () => mediaQuery.removeEventListener("change", updateMatch);
  }, [query]);

  return matches;
}

export function useModalSheetFocus({
  mediaQuery,
  onClose,
  open,
  sheetRef,
}: {
  mediaQuery: string;
  onClose: () => void;
  open: boolean;
  sheetRef: RefObject<HTMLElement | null>;
}) {
  const matchesModalBreakpoint = useMediaQuery(mediaQuery);
  const modalOpen = open && matchesModalBreakpoint;

  useEffect(() => {
    if (open && !matchesModalBreakpoint) onClose();
  }, [matchesModalBreakpoint, onClose, open]);

  useEffect(() => {
    if (!modalOpen || typeof document === "undefined") return;

    const sheet = sheetRef.current;
    const returnFocusTarget =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      const firstFocusable = visibleFocusableElements(sheet)[0];
      (firstFocusable ?? sheet)?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = visibleFocusableElements(sheet);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        sheet?.focus({ preventScroll: true });
        return;
      }

      const active = document.activeElement;
      if (!sheet?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      if (
        returnFocusTarget &&
        document.contains(returnFocusTarget) &&
        returnFocusTarget.getClientRects().length > 0
      ) {
        returnFocusTarget.focus({ preventScroll: true });
      } else {
        const firstVisible = visibleFocusableElements(sheet)[0];
        (firstVisible ?? sheet)?.focus({ preventScroll: true });
      }
    };
  }, [modalOpen, onClose, sheetRef]);

  return modalOpen;
}
