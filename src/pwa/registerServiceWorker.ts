export function registerVisaFlowServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  const register = () => {
    void navigator.serviceWorker
      .register("/service-worker.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch((error: unknown) => {
        console.warn("VisaFlow service worker registration failed", error);
      });
  };

  if (document.readyState === "complete") {
    register();
    return;
  }

  window.addEventListener("load", register, { once: true });
}
