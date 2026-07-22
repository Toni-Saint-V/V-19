import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PwaInstallAssistant } from "../../src/pwa/PwaInstallAssistant";
import type { PwaEnvironment } from "../../src/pwa/installEnvironment";

const baseEnvironment: PwaEnvironment = {
  displayModeFullscreen: false,
  displayModeStandalone: false,
  maxTouchPoints: 0,
  platform: "",
  standalone: false,
  userAgent: "",
};

describe("PwaInstallAssistant", () => {
  it("offers the native install action only after Android eligibility", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted"; platform: string }>;
    };
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });

    render(
      <PwaInstallAssistant
        environment={{
          ...baseEnvironment,
          userAgent:
            "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36",
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Установить приложение" })).toBeNull();
    window.dispatchEvent(event);

    fireEvent.click(
      await screen.findByRole("button", { name: "Установить приложение" }),
    );
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByTestId("pwa-install-assistant")).toBeNull(),
    );
  });

  it("shows the exact Safari Home Screen instruction", () => {
    render(
      <PwaInstallAssistant
        environment={{
          ...baseEnvironment,
          platform: "iPhone",
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1",
        }}
      />,
    );

    expect(screen.getByText("Нажмите “Поделиться” → “На экран Домой”")).toBeVisible();
  });

  it("asks Yandex Browser users to open Safari", () => {
    render(
      <PwaInstallAssistant
        environment={{
          ...baseEnvironment,
          platform: "iPhone",
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 YaBrowser/25.6 Mobile/15E148 Safari/604.1",
        }}
      />,
    );

    expect(screen.getByText(/Откройте сайт в Safari/)).toBeVisible();
    expect(screen.queryByText(/полноэкран/i)).toBeNull();
  });

  it("renders nothing when already installed", () => {
    render(
      <PwaInstallAssistant
        environment={{
          ...baseEnvironment,
          displayModeFullscreen: true,
          userAgent:
            "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36",
        }}
      />,
    );

    expect(screen.queryByTestId("pwa-install-assistant")).toBeNull();
  });
});
