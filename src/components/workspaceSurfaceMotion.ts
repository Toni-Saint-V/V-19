export function workspaceSurfaceMotion(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      animate: { opacity: 1, y: 0 },
      exit: undefined,
      initial: false as const,
      transition: { duration: 0 },
    };
  }

  return {
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    initial: { opacity: 0, y: 6 },
    transition: {
      duration: 0.18,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  };
}
