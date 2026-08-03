type FetchLike = typeof fetch;
type FetchInput = Parameters<FetchLike>[0];
type FetchInit = Parameters<FetchLike>[1];

type EdgeFunctionsRoutingOptions = {
  edgeFunctionsUrl: string;
  projectId: string;
  supabaseUrl: string;
};

function baseUrl(value: string): URL {
  return new URL(`${value.replace(/\/+$/, "")}/`);
}

function isLoopbackHostname(hostname: string): boolean {
  return ["127.0.0.1", "[::1]", "localhost"].includes(hostname);
}

function trustedEdgeFunctionsBaseUrl({
  edgeFunctionsUrl,
  projectId,
  supabaseUrl,
}: EdgeFunctionsRoutingOptions): URL {
  const supabaseBaseUrl = baseUrl(supabaseUrl);
  const edgeBaseUrl = baseUrl(edgeFunctionsUrl);
  const normalizedProjectId = projectId.trim().toLowerCase();
  const canonicalProjectSupabaseHostname = `${normalizedProjectId}.supabase.co`;
  const matchingProjectFunctionsOrigin =
    /^[a-z0-9]+$/.test(normalizedProjectId) &&
    supabaseBaseUrl.protocol === "https:" &&
    supabaseBaseUrl.hostname === canonicalProjectSupabaseHostname &&
    supabaseBaseUrl.port === "" &&
    edgeBaseUrl.protocol === "https:" &&
    edgeBaseUrl.hostname === `${normalizedProjectId}.functions.supabase.co` &&
    edgeBaseUrl.port === "";
  const sameOrigin = edgeBaseUrl.origin === supabaseBaseUrl.origin;
  const secureTransport =
    edgeBaseUrl.protocol === "https:" ||
    (edgeBaseUrl.protocol === "http:" && isLoopbackHostname(edgeBaseUrl.hostname));

  if (
    edgeBaseUrl.username ||
    edgeBaseUrl.password ||
    edgeBaseUrl.search ||
    edgeBaseUrl.hash ||
    !secureTransport ||
    (!sameOrigin && !matchingProjectFunctionsOrigin)
  ) {
    throw new Error("Untrusted Supabase Edge Functions URL.");
  }

  return edgeBaseUrl;
}

export function routeSupabaseEdgeFunctionsUrl(
  value: string,
  { edgeFunctionsUrl, projectId, supabaseUrl }: EdgeFunctionsRoutingOptions,
): string {
  const requestUrl = new URL(value);
  const defaultFunctionsUrl = new URL("functions/v1/", baseUrl(supabaseUrl));

  if (
    requestUrl.origin !== defaultFunctionsUrl.origin ||
    !requestUrl.pathname.startsWith(defaultFunctionsUrl.pathname)
  ) {
    return value;
  }

  const functionPath = requestUrl.pathname.slice(defaultFunctionsUrl.pathname.length);
  if (/^\/|^[a-z][a-z0-9+.-]*:/i.test(functionPath)) {
    throw new Error("Untrusted Supabase Edge Functions path.");
  }

  const trustedBaseUrl = trustedEdgeFunctionsBaseUrl({
    edgeFunctionsUrl,
    projectId,
    supabaseUrl,
  });
  const trustedPathPrefix = `${trustedBaseUrl.pathname.replace(/\/+$/, "")}/`;
  const routedUrl = new URL(trustedBaseUrl);
  routedUrl.pathname = `${trustedPathPrefix}${functionPath}`;
  if (
    routedUrl.origin !== trustedBaseUrl.origin ||
    !routedUrl.pathname.startsWith(trustedPathPrefix)
  ) {
    throw new Error("Untrusted Supabase Edge Functions path.");
  }
  routedUrl.search = requestUrl.search;
  routedUrl.hash = requestUrl.hash;
  return routedUrl.toString();
}

export function createEdgeFunctionsRoutingFetch(
  fetchImpl: FetchLike,
  options: EdgeFunctionsRoutingOptions,
): FetchLike {
  return (async (input: FetchInput, init?: FetchInit) => {
    const originalUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const routedUrl = routeSupabaseEdgeFunctionsUrl(originalUrl, options);

    if (routedUrl === originalUrl) return fetchImpl(input, init);

    let routedInput: FetchInput;
    if (typeof input === "string") {
      routedInput = routedUrl;
    } else if (input instanceof URL) {
      routedInput = new URL(routedUrl);
    } else {
      const effectiveRequest = new Request(input, init);
      const body = ["GET", "HEAD"].includes(effectiveRequest.method)
        ? undefined
        : await effectiveRequest.arrayBuffer();
      routedInput = new Request(routedUrl, {
        body,
        cache: effectiveRequest.cache,
        credentials: effectiveRequest.credentials,
        headers: effectiveRequest.headers,
        integrity: effectiveRequest.integrity,
        keepalive: effectiveRequest.keepalive,
        method: effectiveRequest.method,
        mode: effectiveRequest.mode,
        redirect: effectiveRequest.redirect,
        referrer: effectiveRequest.referrer,
        referrerPolicy: effectiveRequest.referrerPolicy,
        signal: effectiveRequest.signal,
      });
      init = undefined;
    }

    return fetchImpl(routedInput, init);
  }) as FetchLike;
}
