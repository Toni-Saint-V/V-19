type FetchLike = typeof fetch;
type FetchInput = Parameters<FetchLike>[0];
type FetchInit = Parameters<FetchLike>[1];

type ResilientFetchOptions = {
  attempts?: number;
  delayMs?: number;
  requestTimeoutMs?: number;
};

function requestMethod(input: FetchInput, init?: FetchInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function requestUrl(input: FetchInput) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function isSafeSupabaseNetworkRetry(
  input: FetchInput,
  init?: FetchInit,
) {
  const method = requestMethod(input, init);
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (method !== "POST") return false;

  try {
    const url = new URL(requestUrl(input));
    return (
      url.pathname.endsWith("/auth/v1/token") &&
      /^(password|refresh_token)$/.test(url.searchParams.get("grant_type") ?? "")
    );
  } catch {
    return false;
  }
}

function cloneInput(input: FetchInput) {
  return typeof Request !== "undefined" && input instanceof Request
    ? input.clone()
    : input;
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
}

export function createSupabaseResilientFetch(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  {
    attempts = 3,
    delayMs = 250,
    requestTimeoutMs = 12_000,
  }: ResilientFetchOptions = {},
): FetchLike {
  const boundedAttempts = Math.max(1, attempts);

  return (async (input: FetchInput, init?: FetchInit) => {
    const retryable = isSafeSupabaseNetworkRetry(input, init);
    const maxAttempts = retryable ? boundedAttempts : 1;
    const sourceSignal =
      init?.signal ??
      (typeof Request !== "undefined" && input instanceof Request
        ? input.signal
        : undefined);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (sourceSignal?.aborted) throw sourceSignal.reason;

      const controller = new AbortController();
      const forwardAbort = () => controller.abort(sourceSignal?.reason);
      sourceSignal?.addEventListener("abort", forwardAbort, { once: true });
      const timeout = globalThis.setTimeout(
        () => controller.abort(new DOMException("Supabase request timed out", "TimeoutError")),
        requestTimeoutMs,
      );

      try {
        return await fetchImpl(cloneInput(input), {
          ...init,
          signal: controller.signal,
        });
      } catch (error) {
        lastError = error;
        if (sourceSignal?.aborted || attempt === maxAttempts) throw error;
      } finally {
        globalThis.clearTimeout(timeout);
        sourceSignal?.removeEventListener("abort", forwardAbort);
      }

      await wait(delayMs * attempt);
    }

    throw lastError;
  }) as FetchLike;
}
