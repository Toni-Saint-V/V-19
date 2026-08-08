export const canonicalProductionApplicationUrl =
  "https://document-intake-system.vercel.app/";

type BrowserLocation = {
  origin: string;
  pathname: string;
};

export function resolvePasswordResetRedirectTo(
  location: BrowserLocation | undefined,
  activationTarget: "production" | "sandbox",
): string | undefined {
  if (!location) return undefined;
  if (activationTarget === "production") {
    return canonicalProductionApplicationUrl;
  }
  return `${location.origin}${location.pathname}`;
}
