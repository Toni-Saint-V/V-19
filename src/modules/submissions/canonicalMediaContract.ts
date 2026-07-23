export const CANONICAL_FRONTEND_MEDIA_TYPES = [
  "passport_scan",
  "selfie",
  "selfie_2",
] as const;

export type CanonicalFrontendMediaType =
  (typeof CANONICAL_FRONTEND_MEDIA_TYPES)[number];

export const REJECTED_LEGACY_MEDIA_TYPES = [
  "photo",
  "photo_white",
  "video",
] as const;

export type RejectedLegacyMediaType =
  (typeof REJECTED_LEGACY_MEDIA_TYPES)[number];

export const CANONICAL_STORAGE_MEDIA_TYPES = {
  passport_scan: "passport_scan",
  selfie: "selfie",
  selfie_2: "selfie_2",
} as const satisfies Record<
  CanonicalFrontendMediaType,
  CanonicalFrontendMediaType
>;

type CanonicalMediaContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

export function isCanonicalFrontendMediaType(
  value: unknown,
): value is CanonicalFrontendMediaType {
  return CANONICAL_FRONTEND_MEDIA_TYPES.includes(
    value as CanonicalFrontendMediaType,
  );
}

export function isRejectedLegacyMediaType(
  value: unknown,
): value is RejectedLegacyMediaType {
  return REJECTED_LEGACY_MEDIA_TYPES.includes(value as RejectedLegacyMediaType);
}

export function toCanonicalStorageMediaType(
  value: unknown,
): CanonicalMediaContractResult<CanonicalFrontendMediaType> {
  if (!isCanonicalFrontendMediaType(value)) {
    return { ok: false, reason: "Media type is not canonical for Package 1." };
  }

  return { ok: true, data: CANONICAL_STORAGE_MEDIA_TYPES[value] };
}
