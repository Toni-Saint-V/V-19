export const testArtifactsRoot: string;

export function testArtifactPath(...segments: string[]): string;

export function isPortableTrackedArtifactReference(reference: unknown): boolean;

export function resolveTestArtifactReference(
  reference: unknown,
  baseDir?: string,
): string;
