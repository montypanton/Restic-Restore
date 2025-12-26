export const CACHE = {
  // Memory cache TTL (1 hour)
  SNAPSHOT_TTL_MS: 60 * 60 * 1000,

  // Background delta check interval (2 hours)
  DELTA_CHECK_INTERVAL_MS: 2 * 60 * 60 * 1000,

  /** Batch size for parallel stats fetching */
  STATS_BATCH_SIZE: 5,
} as const;

export const TIMING = {
  SUCCESS_MESSAGE_DURATION_MS: 10000,
  ERROR_MESSAGE_DURATION_MS: 15000,
  WARNING_MESSAGE_DURATION_MS: 5000,
  INFO_MESSAGE_DURATION_MS: 3000,
} as const;

export const VALIDATION = {
  MIN_REPO_PATH_LENGTH: 3,
} as const;
