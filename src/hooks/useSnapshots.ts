import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Snapshot, SnapshotWithStats, DbSnapshotWithStats, RepoMeta, LoadingState } from '../types';
import { CACHE } from '../config/constants';

interface RepositoryConnection {
  id: string;
  path: string;
  password: string;
}

interface RepositoryCache {
  repoId: string;
  snapshots: SnapshotWithStats[];
  loadedAt: number;
  activeBackgroundSync: AbortController | null;
}

interface UseSnapshotsReturn {
  snapshots: SnapshotWithStats[];
  loading: boolean;
  loadingState: LoadingState;
  error: string | undefined;
  loadSnapshots: (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    onSnapshotsLoaded: (repoId: string, snapshotCount: number) => void
  ) => Promise<void>;
  loadSingleSnapshotStats: (
    snapshotId: string,
    snapshotName: string,
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string
  ) => Promise<void>;
  updateSnapshotStats: (snapshotId: string, stats: { size: string; fileCount: number }) => void;
  clearSnapshots: () => void;
}

// Global state for multi-repository management
const memoryCacheMap = new Map<string, RepositoryCache>();
let currentActiveRepoId: string | null = null;

/**
 * Ultra-efficient SQLite-based snapshot management with perfect state isolation
 */
export function useSnapshots(): UseSnapshotsReturn {
  const [snapshots, setSnapshots] = useState<SnapshotWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>({ type: 'idle' });
  const [error, setError] = useState<string | undefined>(undefined);

  // Track current repo to prevent cross-contamination
  const currentRepoIdRef = useRef<string | null>(null);

  /**
   * Safe setState wrapper - only updates if repo matches current active repo
   */
  const safeSetSnapshots = useCallback((repoId: string, newSnapshots: SnapshotWithStats[]) => {
    if (currentActiveRepoId === repoId && currentRepoIdRef.current === repoId) {
      console.log(`✅ Updating UI for ${repoId} with ${newSnapshots.length} snapshots`);
      setSnapshots(newSnapshots);
    } else {
      console.warn(`⚠️ Ignoring setState for ${repoId}, current repo is ${currentActiveRepoId}`);
    }
  }, []);

  /**
   * Convert database snapshot to UI snapshot with formatted values
   */
  const convertDbSnapshotToUi = useCallback((
    dbSnapshot: DbSnapshotWithStats,
    formatBytes: (bytes: number) => string
  ): SnapshotWithStats => {
    return {
      ...dbSnapshot.snapshot,
      size: dbSnapshot.total_size !== undefined ? formatBytes(dbSnapshot.total_size) : undefined,
      fileCount: dbSnapshot.total_file_count !== undefined ? Number(dbSnapshot.total_file_count) : undefined,
    };
  }, []);

  /**
   * Queue background delta check if needed (non-blocking)
   */
  const queueDeltaCheckIfNeeded = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string
  ): Promise<void> => {
    try {
      const meta = await invoke<RepoMeta>('get_repo_meta', { repoId });
      const timeSinceLastCheck = Date.now() - (meta.last_delta_check * 1000);

      if (timeSinceLastCheck > CACHE.DELTA_CHECK_INTERVAL_MS) {
        console.log(`🔄 Queuing background delta check for ${repoId} (last check: ${Math.round(timeSinceLastCheck / 60000)}min ago)`);

        // Create abort controller for this sync
        const abortController = new AbortController();
        const cache = memoryCacheMap.get(repoId);
        if (cache) {
          cache.activeBackgroundSync = abortController;
        }

        // Run async (non-blocking)
        performDeltaCheck(repoId, connection, formatBytes, abortController)
          .catch(err => {
            if (err.name !== 'AbortError') {
              console.error('Delta check failed:', err);
            }
          });
      } else {
        console.log(`✅ Cache is fresh for ${repoId} (${Math.round(timeSinceLastCheck / 60000)}min old)`);
      }
    } catch (err) {
      console.error('Failed to get repo meta:', err);
    }
  }, []);

  /**
   * Background delta check (non-blocking)
   */
  const performDeltaCheck = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    abortController: AbortController
  ): Promise<void> => {
    // Check if aborted
    if (abortController.signal.aborted) {
      console.log(`🛑 Delta check aborted for ${repoId}`);
      return;
    }

    setLoadingState({ type: 'background-sync' });

    try {
      // Fetch fresh snapshot list
      const freshSnapshots = await invoke<Snapshot[]>('list_snapshots', {
        repo: connection.path,
        password: connection.password
      });

      if (abortController.signal.aborted) return;

      // Get cached IDs
      const cachedIds = await invoke<string[]>('get_cached_snapshot_ids', { repoId });

      // Find new snapshots
      const cachedIdSet = new Set(cachedIds);
      const newSnapshots = freshSnapshots.filter(s => !cachedIdSet.has(s.id));

      if (newSnapshots.length === 0) {
        console.log(`✅ No new snapshots for ${repoId}`);
        await invoke('update_last_delta_check', { repoId });
        setLoadingState({ type: 'idle' });
        return;
      }

      console.log(`🆕 Found ${newSnapshots.length} new snapshots for ${repoId}`);

      // Save metadata first (without stats)
      await invoke('save_snapshots_metadata_only', {
        repoId,
        snapshots: newSnapshots
      });

      // Fetch stats in batches
      setLoadingState({
        type: 'fetching-stats',
        current: 0,
        total: newSnapshots.length
      });

      const batchSize = CACHE.STATS_BATCH_SIZE;
      for (let i = 0; i < newSnapshots.length; i += batchSize) {
        if (abortController.signal.aborted) return;

        const batch = newSnapshots.slice(i, i + batchSize);

        // Fetch stats in parallel for batch
        const batchWithStats = await Promise.all(
          batch.map(async (snapshot) => {
            const stats = await invoke<{ total_size: number; total_file_count: number }>('get_snapshot_stats', {
              repo: connection.path,
              password: connection.password,
              snapshotId: snapshot.id
            });
            return {
              snapshot,
              total_size: stats.total_size,
              total_file_count: stats.total_file_count
            } as DbSnapshotWithStats;
          })
        );

        // Save batch to SQLite
        await invoke('save_snapshots_batch', {
          repoId,
          snapshots: batchWithStats
        });

        // Update UI if still on this repo
        if (currentActiveRepoId === repoId && !abortController.signal.aborted) {
          const updated = await invoke<DbSnapshotWithStats[]>('load_snapshots_from_db', { repoId });
          const uiSnapshots = updated.map(s => convertDbSnapshotToUi(s, formatBytes));
          safeSetSnapshots(repoId, uiSnapshots);
        }

        setLoadingState({
          type: 'fetching-stats',
          current: Math.min(i + batchSize, newSnapshots.length),
          total: newSnapshots.length
        });
      }

      await invoke('update_last_delta_check', { repoId });
      console.log(`✅ Delta sync complete for ${repoId}`);

    } catch (err) {
      console.error('Delta check error:', err);
    } finally {
      setLoadingState({ type: 'idle' });
    }
  }, [convertDbSnapshotToUi, safeSetSnapshots]);

  /**
   * Perform full sync (first run only)
   */
  const performFullSync = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string
  ): Promise<void> => {
    console.log(`🔄 ========== FULL SYNC START for ${repoId} ==========`);
    console.time(`Full sync for ${repoId}`);

    try {
      // Fetch all snapshots
      const allSnapshots = await invoke<Snapshot[]>('list_snapshots', {
        repo: connection.path,
        password: connection.password
      });

      console.log(`📊 Restic returned ${allSnapshots.length} snapshots for ${repoId}`);

      // Sort by time (newest first)
      const sortedByTime = [...allSnapshots].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );

      // Convert to UI format (without stats initially)
      const snapshotsWithoutStats: SnapshotWithStats[] = sortedByTime.map(s => ({ ...s }));

      // Display snapshots WITHOUT stats immediately
      console.log(`🖥️  Displaying ${snapshotsWithoutStats.length} snapshots immediately (no stats yet)`);
      safeSetSnapshots(repoId, snapshotsWithoutStats);
      setLoading(false);

      // Save metadata to SQLite
      console.log(`💾 Saving metadata for ${allSnapshots.length} snapshots to SQLite...`);
      await invoke('save_snapshots_metadata_only', {
        repoId,
        snapshots: allSnapshots
      });
      console.log(`✅ Metadata save command completed`);

      // Fetch stats for newest 20 first (priority)
      const prioritySnapshots = sortedByTime.slice(0, 20);
      const remainingSnapshots = sortedByTime.slice(20);
      console.log(`📊 Will fetch stats: ${prioritySnapshots.length} priority + ${remainingSnapshots.length} remaining = ${allSnapshots.length} total`);

      // Priority batch
      setLoadingState({
        type: 'fetching-stats',
        current: 0,
        total: allSnapshots.length
      });

      await fetchAndSaveBatch(
        repoId,
        connection,
        formatBytes,
        prioritySnapshots,
        0,
        allSnapshots.length
      );

      // Remaining batches
      if (remainingSnapshots.length > 0) {
        await fetchAndSaveBatch(
          repoId,
          connection,
          formatBytes,
          remainingSnapshots,
          20,
          allSnapshots.length
        );
      }

      await invoke('update_last_delta_check', { repoId });
      setLoadingState({ type: 'idle' });
      console.log(`✅ ========== FULL SYNC COMPLETE for ${repoId} ==========`);
      console.timeEnd(`Full sync for ${repoId}`);

    } catch (err) {
      console.error('Full sync error:', err);
      setError(`Failed to sync snapshots: ${err}`);
      setLoading(false);
      setLoadingState({ type: 'idle' });
    }
  }, [convertDbSnapshotToUi, safeSetSnapshots]);

  /**
   * Fetch and save a batch of snapshots with stats
   */
  const fetchAndSaveBatch = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    snapshots: Snapshot[],
    startIndex: number,
    totalCount: number
  ): Promise<void> => {
    const batchSize = CACHE.STATS_BATCH_SIZE;
    console.log(`📦 fetchAndSaveBatch: Processing ${snapshots.length} snapshots in batches of ${batchSize}`);

    for (let i = 0; i < snapshots.length; i += batchSize) {
      // Check if user switched repos
      if (currentActiveRepoId !== repoId) {
        console.log(`🛑 Aborting batch fetch, repo changed from ${repoId} to ${currentActiveRepoId}`);
        return;
      }

      const batch = snapshots.slice(i, i + batchSize);
      console.log(`  📦 Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} snapshots`);

      const batchWithStats = await Promise.all(
        batch.map(async (snapshot) => {
          const stats = await invoke<{ total_size: number; total_file_count: number }>('get_snapshot_stats', {
            repo: connection.path,
            password: connection.password,
            snapshotId: snapshot.id
          });
          return {
            snapshot,
            total_size: stats.total_size,
            total_file_count: stats.total_file_count
          } as DbSnapshotWithStats;
        })
      );

      console.log(`  💾 Saving batch of ${batchWithStats.length} snapshots with stats to SQLite...`);
      await invoke('save_snapshots_batch', {
        repoId,
        snapshots: batchWithStats
      });

      // Update UI
      if (currentActiveRepoId === repoId) {
        console.log(`  📂 Reloading all snapshots from database to update UI...`);
        const updated = await invoke<DbSnapshotWithStats[]>('load_snapshots_from_db', { repoId });
        const uiSnapshots = updated.map(s => convertDbSnapshotToUi(s, formatBytes));
        console.log(`  🖥️  Updating UI with ${uiSnapshots.length} snapshots from database`);
        safeSetSnapshots(repoId, uiSnapshots);
      }

      setLoadingState({
        type: 'fetching-stats',
        current: startIndex + i + batch.length,
        total: totalCount
      });
    }
  }, [convertDbSnapshotToUi, safeSetSnapshots]);

  /**
   * Main load function with complete flow
   */
  const loadSnapshots = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    onSnapshotsLoaded: (repoId: string, snapshotCount: number) => void
  ) => {
    console.time(`Load snapshots for ${repoId}`);

    // CRITICAL: Cancel any previous background sync when repo changes
    if (currentActiveRepoId !== repoId && currentActiveRepoId !== null) {
      const previousCache = memoryCacheMap.get(currentActiveRepoId);
      if (previousCache?.activeBackgroundSync) {
        previousCache.activeBackgroundSync.abort();
        console.log(`🛑 Cancelled background sync for ${currentActiveRepoId}`);
      }
    }

    currentActiveRepoId = repoId;
    currentRepoIdRef.current = repoId;

    // STEP 1: Check memory cache (1-hour TTL)
    const cached = memoryCacheMap.get(repoId);
    const now = Date.now();

    if (cached && (now - cached.loadedAt) < CACHE.SNAPSHOT_TTL_MS) {
      console.log(`✅ Memory cache hit for ${repoId}`);
      safeSetSnapshots(repoId, cached.snapshots);
      setLoading(false);
      onSnapshotsLoaded(repoId, cached.snapshots.length);

      // Still queue background check if needed
      queueDeltaCheckIfNeeded(repoId, connection, formatBytes);
      console.timeEnd(`Load snapshots for ${repoId}`);
      return;
    }

    try {
      setLoading(true);
      setError(undefined);

      // STEP 2: Load from SQLite
      console.log(`💾 ========== Loading from SQLite for ${repoId} ==========`);
      console.time(`SQLite load for ${repoId}`);

      const dbSnapshots = await invoke<DbSnapshotWithStats[]>('load_snapshots_from_db', { repoId });

      console.timeEnd(`SQLite load for ${repoId}`);
      console.log(`📂 SQLite returned ${dbSnapshots.length} snapshots`);

      if (dbSnapshots.length > 0) {
        // Convert to UI format
        const uiSnapshots = dbSnapshots.map(s => convertDbSnapshotToUi(s, formatBytes));

        // Update memory cache
        memoryCacheMap.set(repoId, {
          repoId,
          snapshots: uiSnapshots,
          loadedAt: now,
          activeBackgroundSync: null
        });

        // Display immediately
        safeSetSnapshots(repoId, uiSnapshots);
        setLoading(false);
        onSnapshotsLoaded(repoId, uiSnapshots.length);

        console.log(`✅ Loaded ${dbSnapshots.length} snapshots from SQLite`);

        // Check if delta sync needed
        await queueDeltaCheckIfNeeded(repoId, connection, formatBytes);
        console.timeEnd(`Load snapshots for ${repoId}`);
        return;
      }

      // STEP 3: No cache exists - perform full sync
      await performFullSync(repoId, connection, formatBytes);

      // Reload from DB after sync
      const finalSnapshots = await invoke<DbSnapshotWithStats[]>('load_snapshots_from_db', { repoId });
      const finalUiSnapshots = finalSnapshots.map(s => convertDbSnapshotToUi(s, formatBytes));

      // Update memory cache
      memoryCacheMap.set(repoId, {
        repoId,
        snapshots: finalUiSnapshots,
        loadedAt: Date.now(),
        activeBackgroundSync: null
      });

      onSnapshotsLoaded(repoId, finalUiSnapshots.length);
      console.timeEnd(`Load snapshots for ${repoId}`);

    } catch (err) {
      setError(`Failed to load snapshots: ${err}`);
      console.error('Load snapshots error:', err);
      setLoading(false);
      setLoadingState({ type: 'idle' });
      console.timeEnd(`Load snapshots for ${repoId}`);
    }
  }, [
    safeSetSnapshots,
    convertDbSnapshotToUi,
    queueDeltaCheckIfNeeded,
    performFullSync
  ]);

  /**
   * Update stats for a single snapshot (used when user manually expands)
   */
  const updateSnapshotStats = useCallback((
    snapshotId: string,
    stats: { size: string; fileCount: number }
  ) => {
    setSnapshots(prev =>
      prev.map(s =>
        s.id === snapshotId
          ? { ...s, ...stats }
          : s
      )
    );
  }, []);

  /**
   * Load stats for a single snapshot (manual load when user expands)
   */
  const loadSingleSnapshotStats = useCallback(async (
    snapshotId: string,
    snapshotName: string,
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string
  ) => {
    setLoadingState({
      type: 'manual-load',
      snapshotName
    });

    try {
      // Fetch stats from restic
      const stats = await invoke<{ total_size: number; total_file_count: number }>('get_snapshot_stats', {
        repo: connection.path,
        password: connection.password,
        snapshotId
      });

      // Find the snapshot
      const snapshot = snapshots.find(s => s.id === snapshotId);
      if (!snapshot) {
        console.error(`Snapshot ${snapshotId} not found`);
        return;
      }

      // Save to SQLite
      const dbSnapshot: DbSnapshotWithStats = {
        snapshot: snapshot as Snapshot,
        total_size: stats.total_size,
        total_file_count: stats.total_file_count
      };

      await invoke('save_snapshots_batch', {
        repoId,
        snapshots: [dbSnapshot]
      });

      // Update UI
      if (currentActiveRepoId === repoId) {
        const formattedStats = {
          size: formatBytes(stats.total_size),
          fileCount: Number(stats.total_file_count)
        };
        updateSnapshotStats(snapshotId, formattedStats);
      }

    } catch (err) {
      console.error('Failed to load single snapshot stats:', err);
    } finally {
      setLoadingState({ type: 'idle' });
    }
  }, [snapshots, updateSnapshotStats]);

  /**
   * Clear snapshots (when switching away from repository view)
   */
  const clearSnapshots = useCallback(() => {
    setSnapshots([]);
    currentActiveRepoId = null;
    currentRepoIdRef.current = null;
  }, []);

  return {
    snapshots,
    loading,
    loadingState,
    error,
    loadSnapshots,
    loadSingleSnapshotStats,
    updateSnapshotStats,
    clearSnapshots,
  };
}
