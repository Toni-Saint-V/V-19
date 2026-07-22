export interface PwaEnvironment {
  displayModeFullscreen: boolean;
  displayModeStandalone: boolean;
  maxTouchPoints: number;
  platform: string;
  standalone: boolean;
  userAgent: string;
}

export type IosInstallSurface = "safari" | "yandex" | null;

const IOS_DEVICE_PATTERN = /iPad|iPhone|iPod/i;
const ANDROID_DEVICE_PATTERN = /Android/i;
const YANDEX_BROWSER_PATTERN = /YaBrowser|YandexSearch|YaApp_iOS/i;
const NON_SAFARI_IOS_BROWSER_PATTERN =
  /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|YandexSearch|YaApp_iOS/i;

export function readPwaEnvironment(): PwaEnvironment {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  const canMatchDisplayMode = typeof window.matchMedia === "function";

  return {
    displayModeFullscreen:
      canMatchDisplayMode && window.matchMedia("(display-mode: fullscreen)").matches,
    displayModeStandalone:
      canMatchDisplayMode && window.matchMedia("(display-mode: standalone)").matches,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    platform: navigator.platform ?? "",
    standalone: standaloneNavigator.standalone === true,
    userAgent: navigator.userAgent,
  };
}

export function isPwaInstalled(environment: PwaEnvironment) {
  return (
    environment.standalone ||
    environment.displayModeStandalone ||
    environment.displayModeFullscreen
  );
}

export function isAndroidDevice(environment: PwaEnvironment) {
  return ANDROID_DEVICE_PATTERN.test(environment.userAgent);
}

export function isIosDevice(environment: PwaEnvironment) {
  return (
    IOS_DEVICE_PATTERN.test(environment.userAgent) ||
    (environment.platform === "MacIntel" && environment.maxTouchPoints > 1)
  );
}

export function getIosInstallSurface(environment: PwaEnvironment): IosInstallSurface {
  if (!isIosDevice(environment) || isPwaInstalled(environment)) return null;

  if (YANDEX_BROWSER_PATTERN.test(environment.userAgent)) return "yandex";

  const isSafari =
    /Safari/i.test(environment.userAgent) &&
    !NON_SAFARI_IOS_BROWSER_PATTERN.test(environment.userAgent);

  return isSafari ? "safari" : null;
}
