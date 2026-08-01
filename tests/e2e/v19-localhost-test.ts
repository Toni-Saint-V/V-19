import { mkdirSync, writeFileSync } from "node:fs";

import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";

import { testRunArtifactPath } from "../support/artifacts";

type BrowserNetworkEvent = {
  method?: string;
  origin: string;
  path: string;
  resourceType?: string;
  status?: number;
  type: "blocked" | "request" | "response" | "websocket";
};

type LocalhostGuardState = {
  allowedHttpOrigin: string;
  allowedWebSocketOrigin: string;
  events: BrowserNetworkEvent[];
  observedProblems: string[];
  problems: string[];
};

const guardByContext = new WeakMap<BrowserContext, LocalhostGuardState>();

function localhostOrigins(baseURL: string | undefined) {
  if (!baseURL) {
    throw new Error("Localhost-only Playwright requires an explicit baseURL.");
  }

  const httpUrl = new URL(baseURL);
  if (
    httpUrl.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(httpUrl.hostname)
  ) {
    throw new Error(`Localhost-only Playwright rejected baseURL ${httpUrl.origin}.`);
  }

  const websocketUrl = new URL(httpUrl.origin);
  websocketUrl.protocol = "ws:";
  return {
    http: httpUrl.origin,
    websocket: websocketUrl.origin,
  };
}

function networkCoordinates(rawUrl: string) {
  const url = new URL(rawUrl);
  return {
    origin: url.origin,
    path: url.pathname,
    protocol: url.protocol,
  };
}

function artifactFileName(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}_.-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 160) || "browser-proof"
  );
}

function recordProblem(state: LocalhostGuardState, problem: string) {
  state.observedProblems.push(problem);
  state.problems.push(problem);
}

export function browserProblemsForPage(page: Page): string[] {
  return guardByContext.get(page.context())?.problems ?? [];
}

export function takeLocalhostGuardProblems(page: Page) {
  return guardByContext.get(page.context())?.problems.splice(0) ?? [];
}

export const test = base.extend({
  page: async ({ baseURL, context }, providePage, testInfo) => {
    const allowed = localhostOrigins(baseURL);
    const state: LocalhostGuardState = {
      allowedHttpOrigin: allowed.http,
      allowedWebSocketOrigin: allowed.websocket,
      events: [],
      observedProblems: [],
      problems: [],
    };
    guardByContext.set(context, state);

    await context.route("**/*", async (route) => {
      const request = route.request();
      const coordinates = networkCoordinates(request.url());
      const guardedProtocol =
        coordinates.protocol === "http:" || coordinates.protocol === "https:";
      const allowedOrigin =
        !guardedProtocol || coordinates.origin === state.allowedHttpOrigin;
      state.events.push({
        ...coordinates,
        method: request.method(),
        resourceType: request.resourceType(),
        type: allowedOrigin ? "request" : "blocked",
      });
      if (!allowedOrigin) {
        recordProblem(
          state,
          `blocked-origin: ${request.method()} ${coordinates.origin}${coordinates.path}`,
        );
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    await context.routeWebSocket(/.*/, async (socket) => {
      const coordinates = networkCoordinates(socket.url());
      const allowedOrigin = coordinates.origin === state.allowedWebSocketOrigin;
      state.events.push({
        ...coordinates,
        type: allowedOrigin ? "websocket" : "blocked",
      });
      if (!allowedOrigin) {
        recordProblem(
          state,
          `blocked-websocket-origin: ${coordinates.origin}${coordinates.path}`,
        );
        await socket.close({
          code: 1008,
          reason: "Only the approved localhost origin is allowed.",
        });
        return;
      }
      socket.connectToServer();
    });

    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        recordProblem(state, `console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      recordProblem(state, `pageerror: ${error.message}`);
    });
    page.on("requestfailed", (request) => {
      const coordinates = networkCoordinates(request.url());
      if (coordinates.origin !== state.allowedHttpOrigin) return;
      const errorText = request.failure()?.errorText ?? "request failed";
      // A new page.goto() intentionally cancels assets that are still in flight
      // from the previous proof viewport. Chromium reports those cancellations as
      // request failures even though the destination page loads successfully.
      if (errorText === "net::ERR_ABORTED") return;
      recordProblem(
        state,
        `network: ${errorText} ${request.method()} ${coordinates.origin}${coordinates.path}`,
      );
    });
    page.on("response", (response) => {
      const request = response.request();
      const coordinates = networkCoordinates(response.url());
      state.events.push({
        ...coordinates,
        method: request.method(),
        resourceType: request.resourceType(),
        status: response.status(),
        type: "response",
      });
      if (coordinates.origin === state.allowedHttpOrigin && response.status() >= 400) {
        recordProblem(
          state,
          `network: HTTP ${response.status()} ${request.method()} ${coordinates.origin}${coordinates.path}`,
        );
      }
    });

    let browserProofError: Error | undefined;
    try {
      await providePage(page);
    } finally {
      const effectiveStatus =
        state.problems.length > 0 && testInfo.status === "passed"
          ? "failed"
          : testInfo.status;
      const outputRoot = testRunArtifactPath("browser-network");
      mkdirSync(outputRoot, { recursive: true });
      const fileName = artifactFileName(
        `${testInfo.project.name}-${testInfo.titlePath.join("-")}`,
      );
      writeFileSync(
        `${outputRoot}/${fileName}.json`,
        `${JSON.stringify(
          {
            allowedHttpOrigins: [state.allowedHttpOrigin],
            allowedWebSocketOrigins: [state.allowedWebSocketOrigin],
            events: state.events,
            observedProblems: state.observedProblems,
            problems: state.problems,
            bodyStatus: testInfo.status,
            status: effectiveStatus,
            title: testInfo.titlePath,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      if (effectiveStatus === "failed" && testInfo.status === "passed") {
        browserProofError = new Error(
          `Browser proof recorded forbidden or failed runtime activity:\n${state.problems.join("\n")}`,
        );
      }
    }
    if (browserProofError) throw browserProofError;
  },
});

export { expect };
