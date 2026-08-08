// src/services/aiEdgeClient.ts
import { getSupabaseClient } from "../lib/supabase/client";
import {
  parseAiHelperResult,
  type AiHelperActor,
  type AiHelperIntent,
  type AiHelperResult,
  type AiHelperRequest,
} from "../shared/ai-helper-contract";

export interface AiHelperCacheOptions {
  bypassCache?: boolean;
  ttlMs?: number;
}

interface AiHelperCacheEntry {
  expiresAt: number;
  result: AiHelperResult | null;
}

const defaultCacheTtlMs = 5 * 60 * 1000;
const unavailableCacheTtlMs = 30 * 1000;
const maxCacheEntries = 40;
const resultCache = new Map<string, AiHelperCacheEntry>();
const inFlightRequests = new Map<string, Promise<AiHelperResult | null>>();

export async function invokeAiHelperEdge(
  intent: AiHelperIntent,
  context: Record<string, unknown>,
  actor: AiHelperActor,
): Promise<AiHelperResult | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const request: AiHelperRequest = {
    intent,
    context,
    actor,
  };
  const { data, error } = await client.functions.invoke<unknown>("ai-helper", {
    body: request,
  });

  if (error) throw error;
  const parsed = parseAiHelperResult(data);
  if (!parsed.ok) {
    throw new Error(parsed.safeMessage);
  }

  return parsed.data;
}

export async function invokeAiHelperEdgeCached(
  intent: AiHelperIntent,
  context: Record<string, unknown>,
  actor: AiHelperActor,
  options: AiHelperCacheOptions = {},
): Promise<AiHelperResult | null> {
  const cacheKey = aiHelperRequestCacheKey(intent, context, actor);
  const now = Date.now();
  const cached = resultCache.get(cacheKey);

  if (!options.bypassCache && cached && cached.expiresAt > now) {
    return cached.result;
  }
  if (cached) resultCache.delete(cacheKey);

  if (!options.bypassCache) {
    const existingRequest = inFlightRequests.get(cacheKey);
    if (existingRequest) return existingRequest;
  }

  const request = invokeAiHelperEdge(intent, context, actor)
    .then((result) => {
      cacheResult(
        cacheKey,
        result,
        result
          ? normalizedTtl(options.ttlMs)
          : Math.min(normalizedTtl(options.ttlMs), unavailableCacheTtlMs),
      );
      return result;
    })
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, request);
  return request;
}

export function clearAiHelperEdgeCache(): void {
  resultCache.clear();
  inFlightRequests.clear();
}

export function aiHelperRequestCacheKey(
  intent: AiHelperIntent,
  context: Record<string, unknown>,
  actor: AiHelperActor,
): string {
  const serialized = stableSerialize({
    actorId: actor.id,
    actorRole: actor.role,
    canUseAI: actor.canUseAI,
    context,
    intent,
  });

  return `ai-${hashString(serialized)}`;
}

function cacheResult(key: string, result: AiHelperResult | null, ttlMs: number): void {
  const now = Date.now();
  for (const [cachedKey, entry] of resultCache) {
    if (entry.expiresAt <= now) resultCache.delete(cachedKey);
  }

  resultCache.delete(key);
  resultCache.set(key, {
    expiresAt: now + ttlMs,
    result,
  });

  while (resultCache.size > maxCacheEntries) {
    const oldestKey = resultCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    resultCache.delete(oldestKey);
  }
}

function normalizedTtl(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value < 1_000) {
    return defaultCacheTtlMs;
  }
  return Math.min(value, 30 * 60 * 1000);
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function hashString(value: string): string {
  let primary = 2166136261;
  let secondary = 5381;

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    primary ^= codePoint;
    primary = Math.imul(primary, 16777619);
    secondary = Math.imul(secondary, 33) ^ codePoint;
  }

  return [primary, secondary]
    .map((hash) => (hash >>> 0).toString(16).padStart(8, "0"))
    .join("");
}
