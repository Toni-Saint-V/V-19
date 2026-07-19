import { useEffect, useState } from "react";

export const drawerMotion = {
  overlay: {
    duration: 0.18,
  },
  panel: {
    damping: 28,
    mass: 0.8,
    stiffness: 240,
    type: "spring" as const,
  },
  reduced: {
    duration: 0.01,
  },
  reference: {
    duration: 0.14,
  },
  tab: {
    duration: 0.18,
  },
  tabIndicator: {
    bounce: 0.18,
    duration: 0.42,
    type: "spring" as const,
  },
} as const;

export function drawerPanelInitial(isDesktop: boolean, reducedMotion: boolean) {
  if (reducedMotion) return { opacity: 1, x: 0, y: 0 };

  return {
    opacity: 0.72,
    x: isDesktop ? "100%" : 0,
    y: isDesktop ? 0 : "100%",
  };
}

export function drawerPanelExit(isDesktop: boolean, reducedMotion: boolean) {
  if (reducedMotion) return { opacity: 0, x: 0, y: 0 };

  return {
    opacity: 0,
    x: isDesktop ? "100%" : 0,
    y: isDesktop ? 0 : "100%",
  };
}

export function drawerPanelTransition(reducedMotion: boolean) {
  return reducedMotion ? drawerMotion.reduced : drawerMotion.panel;
}

export function drawerTabInitial(reducedMotion: boolean) {
  return reducedMotion ? { opacity: 0, y: 0 } : { opacity: 0, y: 8 };
}

export function drawerTabExit(reducedMotion: boolean) {
  return reducedMotion ? { opacity: 0, y: 0 } : { opacity: 0, y: -8 };
}

export function useDrawerDesktopQuery() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);

    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
