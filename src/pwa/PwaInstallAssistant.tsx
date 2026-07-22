import { useEffect, useRef, useState } from "react";
import {
  getIosInstallSurface,
  isAndroidDevice,
  isPwaInstalled,
  readPwaEnvironment,
  type PwaEnvironment,
} from "./installEnvironment";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PwaInstallAssistantProps {
  environment?: PwaEnvironment;
}

export function PwaInstallAssistant({ environment }: PwaInstallAssistantProps) {
  const initialEnvironment = environment ?? readPwaEnvironment();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(() => isPwaInstalled(initialEnvironment));
  const installedRef = useRef(installed);

  useEffect(() => {
    installedRef.current = installed;
  }, [installed]);

  useEffect(() => {
    const currentEnvironment = () => environment ?? readPwaEnvironment();
    const syncInstalledMode = () => {
      const nextInstalled = isPwaInstalled(currentEnvironment());
      installedRef.current = nextInstalled;
      setInstalled(nextInstalled);
      if (nextInstalled) setDeferredPrompt(null);
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      const nextEnvironment = currentEnvironment();
      if (installedRef.current || !isAndroidDevice(nextEnvironment)) return;

      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      installedRef.current = true;
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    const mediaQueries = environment
      ? []
      : [
          window.matchMedia("(display-mode: standalone)"),
          window.matchMedia("(display-mode: fullscreen)"),
        ];
    mediaQueries.forEach((query) =>
      query.addEventListener("change", syncInstalledMode),
    );

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mediaQueries.forEach((query) =>
        query.removeEventListener("change", syncInstalledMode),
      );
    };
  }, [environment]);

  const currentEnvironment = environment ?? readPwaEnvironment();
  const iosSurface = installed ? null : getIosInstallSurface(currentEnvironment);
  const showAndroidInstall =
    !installed && deferredPrompt !== null && isAndroidDevice(currentEnvironment);

  if (installed || dismissed || (!showAndroidInstall && iosSurface === null))
    return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    const prompt = deferredPrompt;
    setDeferredPrompt(null);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.warn("VisaFlow install prompt was not completed", error);
    } finally {
      setDismissed(true);
    }
  };

  const message =
    iosSurface === "safari"
      ? "Нажмите “Поделиться” → “На экран Домой”"
      : iosSurface === "yandex"
        ? "Откройте сайт в Safari, затем нажмите “Поделиться” → “На экран Домой”"
        : "Установите VisaFlow на устройство для запуска как отдельного приложения.";

  return (
    <aside
      aria-label="Установка VisaFlow"
      className="vf-pwa-install-assistant"
      data-testid="pwa-install-assistant"
    >
      <div className="vf-pwa-install-card">
        <div className="vf-pwa-install-copy">
          <strong>VisaFlow</strong>
          <span>{message}</span>
        </div>
        {showAndroidInstall ? (
          <button
            className="vf-pwa-install-action"
            type="button"
            onClick={() => void handleInstall()}
          >
            Установить приложение
          </button>
        ) : null}
        <button
          aria-label="Скрыть подсказку об установке"
          className="vf-pwa-install-dismiss"
          type="button"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      </div>
    </aside>
  );
}
