import { describe, expect, it } from "vitest";

import { workspaceSurfaceMotion } from "../../src/components/workspaceSurfaceMotion";

describe("workspaceSurfaceMotion", () => {
  it("keeps the existing short transition when motion is allowed", () => {
    expect(workspaceSurfaceMotion(false)).toEqual({
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -6 },
      initial: { opacity: 0, y: 6 },
      transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
    });
  });

  it("removes movement and exit animation when reduced motion is requested", () => {
    expect(workspaceSurfaceMotion(true)).toEqual({
      animate: { opacity: 1, y: 0 },
      exit: undefined,
      initial: false,
      transition: { duration: 0 },
    });
  });
});
