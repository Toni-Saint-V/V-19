export const linearDrawerMotion = {
  overlay: { duration: 0.25 },
  panel: { damping: 28, mass: 0.8, stiffness: 240, type: "spring" },
  reduced: { duration: 0.01 },
  tab: { duration: 0.2 },
  tabIndicator: { bounce: 0.2, duration: 0.5, type: "spring" },
} as const;
