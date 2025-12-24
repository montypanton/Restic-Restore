/**
 * @example
 * formatBytes(0) // "0 B"
 * formatBytes(1024) // "1.0 KB"
 * formatBytes(1536000) // "1.5 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Uses short_id or first 8 chars of full ID.
 *
 * @example
 * formatSnapshotId("a1b2c3d4e5f6g7h8", "a1b2c3d4") // "a1b2c3d4"
 * formatSnapshotId("a1b2c3d4e5f6g7h8") // "a1b2c3d4"
 */
export function formatSnapshotId(id: string, shortId?: string): string {
  return shortId || id.substring(0, 8);
}
