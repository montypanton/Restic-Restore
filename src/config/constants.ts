export const CACHE = {
  SNAPSHOT_TTL_MS: 5 * 60 * 1000,

  /** Max snapshots to load stats in parallel */
  STATS_PARALLEL_LIMIT: 10,
} as const;

export const TIMING = {
  AUTO_REFRESH_INTERVAL_MS: 30 * 60 * 1000,
  SUCCESS_MESSAGE_DURATION_MS: 10000,
  ERROR_MESSAGE_DURATION_MS: 15000,
  WARNING_MESSAGE_DURATION_MS: 5000,
  INFO_MESSAGE_DURATION_MS: 3000,
} as const;

export const VALIDATION = {
  MIN_REPO_PATH_LENGTH: 3,
} as const;
