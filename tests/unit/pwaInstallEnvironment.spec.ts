import { describe, expect, it } from "vitest";
import {
  getIosInstallSurface,
  isAndroidDevice,
  isPwaInstalled,
  type PwaEnvironment,
} from "../../src/pwa/installEnvironment";

const baseEnvironment: PwaEnvironment = {
  displayModeFullscreen: false,
  displayModeStandalone: false,
  maxTouchPoints: 0,
  platform: "",
  standalone: false,
  userAgent: "",
};

describe("PWA install environment", () => {
  it("detects Android without treating it as installed", () => {
    const environment = {
      ...baseEnvironment,
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36",
    };

    expect(isAndroidDevice(environment)).toBe(true);
    expect(isPwaInstalled(environment)).toBe(false);
  });

  it("detects Safari on iPhone and desktop-mode iPadOS", () => {
    expect(
      getIosInstallSurface({
        ...baseEnvironment,
        platform: "iPhone",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1",
      }),
    ).toBe("safari");

    expect(
      getIosInstallSurface({
        ...baseEnvironment,
        maxTouchPoints: 5,
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15",
      }),
    ).toBe("safari");
  });

  it("routes Yandex Browser users to Safari without a fullscreen promise", () => {
    expect(
      getIosInstallSurface({
        ...baseEnvironment,
        platform: "iPhone",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 YaBrowser/25.6 Mobile/15E148 Safari/604.1",
      }),
    ).toBe("yandex");
  });

  it("suppresses guidance in installed and unrelated browser modes", () => {
    const safariEnvironment = {
      ...baseEnvironment,
      platform: "iPhone",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1",
    };

    expect(
      getIosInstallSurface({ ...safariEnvironment, displayModeStandalone: true }),
    ).toBeNull();
    expect(
      getIosInstallSurface({
        ...safariEnvironment,
        userAgent: safariEnvironment.userAgent.replace("Version/18.5", "CriOS/138"),
      }),
    ).toBeNull();
  });
});
