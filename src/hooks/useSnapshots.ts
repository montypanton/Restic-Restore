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
  syncInProgress: boolean;
  statsBackfillInProgress: boolean;
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

const memoryCacheMap = new Map<string, RepositoryCache>();
let currentActiveRepoId: string | null = null;

const loadingStateMap = new Map<string, LoadingState>();

export function useSnapshots(): UseSnapshotsReturn {
  const [snapshots, setSnapshots] = useState<SnapshotWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>({ type: 'idle' });
  const [error, setError] = useState<string | undefined>(undefined);

  const currentRepoIdRef = useRef<string | null>(null);

  const getRepoLoadingState = useCallback((repoId: string): LoadingState => {
    return loadingStateMap.get(repoId) || { type: 'idle' };
  }, []);

  const setRepoLoadingState = useCallback((repoId: string, state: LoadingState) => {
    loadingStateMap.set(repoId, state);

    if (currentActiveRepoId === repoId && currentRepoIdRef.current === repoId) {
      setLoadingState(state);
    }
  }, []);

  const safeSetSnapshots = useCallback((repoId: string, newSnapshots: SnapshotWithStats[]) => {
    if (currentActiveRepoId === repoId && currentRepoIdRef.current === repoId) {
      console.log(` Updating UI for ${repoId} with ${newSnapshots.length} snapshots`);
      setSnapshots(newSnapshots);
    } else {
      console.warn(` Ignoring setState for ${repoId}, current repo is ${currentActiveRepoId}`);
    }
  }, []);

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

  const queueDeltaCheckIfNeeded = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string
  ): Promise<void> => {
    try {
      const meta = await invoke<RepoMeta>('get_repo_meta', { repoId });
      const timeSinceLastCheck = Date.now() - (meta.last_delta_check * 1000);

      if (timeSinceLastCheck > CACHE.DELTA_CHECK_INTERVAL_MS) {
        console.log(` Queuing background delta check for ${repoId} (last check: ${Math.round(timeSinceLastCheck / 60000)}min ago)`);

        const abortController = new AbortController();
        const cache = memoryCacheMap.get(repoId);
        if (cache) {
          cache.activeBackgroundSync = abortController;
        }

        performDeltaCheck(repoId, connection, formatBytes, abortController)
          .catch(err => {
            if (err.name !== 'AbortError') {
              console.error('Delta check failed:', err);
            }
          });
      } else {
        console.log(` Cache is fresh for ${repoId} (${Math.round(timeSinceLastCheck / 60000)}min old)`);
      }
    } catch (err) {
      console.error('Failed to get repo meta:', err);
    }
  }, []);

  const performDeltaCheck = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    abortController: AbortController
  ): Promise<void> => {
    if (abortController.signal.aborted) {
      console.log(` Delta check aborted for ${repoId}`);
      return;
    }

    setRepoLoadingState(repoId, { type: 'background-sync' });

    try {
      const freshSnapshots = await invoke<Snapshot[]>('list_snapshots', {
        repo: connection.path,
        password: connection.password
      });

      if (abortController.signal.aborted) return;

      const cachedIds = await invoke<string[]>('get_cached_snapshot_ids', { repoId });

      const cachedIdSet = new Set(cachedIds);
      const newSnapshots = freshSnapshots.filter(s => !cachedIdSet.has(s.id));

      if (newSnapshots.length === 0) {
        console.log(` No new snapshots for ${repoId}`);
        await invoke('update_last_delta_check', { repoId });
        setRepoLoadingState(repoId, { type: 'idle' });
        return;
      }

      console.log(` Found ${newSnapshots.length} new snapshots for ${repoId}`);

      await invoke('save_snapshots_metadata_only', {
        repoId,
        snapshots: newSnapshots
      });

      setRepoLoadingState(repoId, {
        type: 'fetching-stats',
        processed: 0
      });

      const batchSize = CACHE.STATS_BATCH_SIZE;
      for (let i = 0; i < newSnapshots.length; i += batchSize) {
        if (abortController.signal.aborted) return;

        const batch = newSnapshots.slice(i, i + batchSize);

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

        await invoke('save_snapshots_batch', {
          repoId,
          snapshots: batchWithStats
        });

        if (currentActiveRepoId === repoId && !abortController.signal.aborted) {
          const updated = await invoke<DbSnapshotWithStats[]>('load_snapshots_from_db', { repoId });
          const uiSnapshots = updated.map(s => convertDbSnapshotToUi(s, formatBytes));
          safeSetSnapshots(repoId, uiSnapshots);

          const cache = memoryCacheMap.get(repoId);
          if (cache) {
            cache.snapshots = uiSnapshots;
          }
        }

        if (currentActiveRepoId === repoId) {
          setRepoLoadingState(repoId, {
            type: 'fetching-stats',
            processed: Math.min(i + batchSize, newSnapshots.length)
          });
        }
      }

      await invoke('update_last_delta_check', { repoId });
      console.log(` Delta sync complete for ${repoId}`);

    } catch (err) {
      console.error('Delta check error:', err);
    } finally {
      setRepoLoadingState(repoId, { type: 'idle' });
    }
  }, [convertDbSnapshotToUi, safeSetSnapshots, setRepoLoadingState]);

  const performFullSync = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string
  ): Promise<void> => {
    console.log(` ========== FULL SYNC START for ${repoId} ==========`);
    console.time(`Full sync for ${repoId}`);

    const cache = memoryCacheMap.get(repoId);
    if (cache?.syncInProgress) {
      console.warn(` Sync already in progress for ${repoId}, skipping duplicate sync`);
      return;
    }

    if (cache) {
      cache.syncInProgress = true;
    } else {
      memoryCacheMap.set(repoId, {
        repoId,
        snapshots: [],
        loadedAt: 0,
        activeBackgroundSync: null,
        syncInProgress: true,
        statsBackfillInProgress: false
      });
    }

    try {
      const allSnapshots = await invoke<Snapshot[]>('list_snapshots', {
        repo: connection.path,
        password: connection.password
      });

      console.log(` Restic returned ${allSnapshots.length} snapshots for ${repoId}`);

      const sortedByTime = [...allSnapshots].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );

      const snapshotsWithoutStats: SnapshotWithStats[] = sortedByTime.map(s => ({ ...s }));

      console.log(`  Displaying ${snapshotsWithoutStats.length} snapshots immediately (no stats yet)`);
      safeSetSnapshots(repoId, snapshotsWithoutStats);
      setLoading(false);

      console.log(` Saving metadata for ${allSnapshots.length} snapshots to SQLite...`);
      await invoke('save_snapshots_metadata_only', {
        repoId,
        snapshots: allSnapshots
      });
      console.log(` Metadata save command completed`);

      const prioritySnapshots = sortedByTime.slice(0, 20);
      const remainingSnapshots = sortedByTime.slice(20);
      console.log(` Will fetch stats: ${prioritySnapshots.length} priority + ${remainingSnapshots.length} remaining = ${allSnapshots.length} total`);

      setRepoLoadingState(repoId, {
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
      setRepoLoadingState(repoId, { type: 'idle' });
      console.log(` ========== FULL SYNC COMPLETE for ${repoId} ==========`);
      console.timeEnd(`Full sync for ${repoId}`);

    } catch (err) {
      console.error('Full sync error:', err);
      setError(`Failed to sync snapshots: ${err}`);
      setLoading(false);
      setRepoLoadingState(repoId, { type: 'idle' });
    } finally {
      const cache = memoryCacheMap.get(repoId);
      if (cache) {
        cache.syncInProgress = false;
      }
    }
  }, [convertDbSnapshotToUi, safeSetSnapshots, setRepoLoadingState]);

  const fetchAndSaveBatch = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    snapshots: Snapshot[],
    startIndex: number,
    totalCount: number
  ): Promise<void> => {
    const batchSize = CACHE.STATS_BATCH_SIZE;
    console.log(` fetchAndSaveBatch: Processing ${snapshots.length} snapshots in batches of ${batchSize}`);

    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} snapshots`);

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

      console.log(`   Saving batch of ${batchWithStats.length} snapshots with stats to SQLite...`);
      await invoke('save_snapshots_batch', {
        repoId,
        snapshots: batchWithStats
      });

      if (currentActiveRepoId === repoId) {
        console.log(`   Reloading all snapshots from database to update UI...`);
        const updated = await invoke<DbSnapshotWithStats[]>('load_snapshots_from_db', { repoId });
        const uiSnapshots = updated.map(s => convertDbSnapshotToUi(s, formatBytes));
        console.log(`    Updating UI with ${uiSnapshots.length} snapshots from database`);
        safeSetSnapshots(repoId, uiSnapshots);

        const cache = memoryCacheMap.get(repoId);
        if (cache) {
          cache.snapshots = uiSnapshots;
        }

        setRepoLoadingState(repoId, {
          type: 'fetching-stats',
          processed: startIndex + i + batch.length
        });
      }
    }
  }, [convertDbSnapshotToUi, safeSetSnapshots, setRepoLoadingState]);

  const queueMissingStatsFetch = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    snapshots: SnapshotWithStats[]
  ): Promise<void> => {
    const missingStats = snapshots.filter(s => !s.size || !s.fileCount);

    if (missingStats.length === 0) {
      console.log(` All snapshots have stats for ${repoId}`);
      setRepoLoadingState(repoId, { type: 'idle' });
      return;
    }

    console.log(` Queueing stats fetch for ${missingStats.length} snapshots in ${repoId}`);

    const cache = memoryCacheMap.get(repoId);
    if (cache?.statsBackfillInProgress) {
      console.log(` Stats backfill already in progress for ${repoId}, skipping duplicate`);
      return;
    }
    if (cache?.syncInProgress) {
      console.log(` Sync already in progress for ${repoId}, skipping stats backfill`);
      return;
    }

    if (cache) {
      cache.statsBackfillInProgress = true;
    } else {
      memoryCacheMap.set(repoId, {
        repoId,
        snapshots: [],
        loadedAt: 0,
        activeBackgroundSync: null,
        syncInProgress: false,
        statsBackfillInProgress: true
      });
    }

    const snapshotsToFetch: Snapshot[] = missingStats.map(s => ({
      id: s.id,
      short_id: s.short_id,
      time: s.time,
      hostname: s.hostname,
      username: s.username,
      paths: s.paths,
      tags: s.tags,
      parent: s.parent,
      tree: s.tree,
    }));

    const sortedByTime = snapshotsToFetch.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );

    setRepoLoadingState(repoId, {
      type: 'fetching-stats',
      processed: 0
    });

    fetchAndSaveBatch(
      repoId,
      connection,
      formatBytes,
      sortedByTime,
      0,
      missingStats.length 
    ).then(() => {
      console.log(` Completed stats backfill for ${repoId}`);
      const cache = memoryCacheMap.get(repoId);
      if (cache) cache.statsBackfillInProgress = false;
      setRepoLoadingState(repoId, { type: 'idle' });
    }).catch(err => {
      console.error(`Failed to fetch missing stats for ${repoId}:`, err);
      const cache = memoryCacheMap.get(repoId);
      if (cache) cache.statsBackfillInProgress = false;
      setRepoLoadingState(repoId, { type: 'idle' });
    });
  }, [fetchAndSaveBatch, setRepoLoadingState]);

  const loadSnapshots = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    onSnapshotsLoaded: (repoId: string, snapshotCount: number) => void
  ) => {
    console.time(`Load snapshots for ${repoId}`);

    currentActiveRepoId = repoId;
    currentRepoIdRef.current = repoId;

    const repoLoadingState = getRepoLoadingState(repoId);
    setLoadingState(repoLoadingState);

    const cached = memoryCacheMap.get(repoId);
    const now = Date.now();

    if (cached && (now - cached.loadedAt) < CACHE.SNAPSHOT_TTL_MS) {
      console.log(` Memory cache hit for ${repoId}`);
      safeSetSnapshots(repoId, cached.snapshots);
      setLoading(false);
      onSnapshotsLoaded(repoId, cached.snapshots.length);

      queueMissingStatsFetch(repoId, connection, formatBytes, cached.snapshots);

      queueDeltaCheckIfNeeded(repoId, connection, formatBytes);
      console.timeEnd(`Load snapshots for ${repoId}`);
      return;
    }

    try {
      setLoading(true);
      setError(undefined);

      console.log(` ========== Loading from SQLite for ${repoId} ==========`);
      console.time(`SQLite load for ${repoId}`);

      const dbSnapshots = await invoke<DbSnapshotWithStats[]>('load_snapshots_from_db', { repoId });

      console.timeEnd(`SQLite load for ${repoId}`);
      console.log(` SQLite returned ${dbSnapshots.length} snapshots`);

      if (dbSnapshots.length > 0) {
        const uiSnapshots = dbSnapshots.map(s => convertDbSnapshotToUi(s, formatBytes));

        memoryCacheMap.set(repoId, {
          repoId,
          snapshots: uiSnapshots,
          loadedAt: now,
          activeBackgroundSync: null,
          syncInProgress: false,
          statsBackfillInProgress: false
        });

        safeSetSnapshots(repoId, uiSnapshots);
        setLoading(false);
        onSnapshotsLoaded(repoId, uiSnapshots.length);

        console.log(` Loaded ${dbSnapshots.length} snapshots from SQLite`);

        queueMissingStatsFetch(repoId, connection, formatBytes, uiSnapshots);

        await queueDeltaCheckIfNeeded(repoId, connection, formatBytes);
        console.timeEnd(`Load snapshots for ${repoId}`);
        return;
      }

      await performFullSync(repoId, connection, formatBytes);

      const finalSnapshots = await invoke<DbSnapshotWithStats[]>('load_snapshots_from_db', { repoId });
      const finalUiSnapshots = finalSnapshots.map(s => convertDbSnapshotToUi(s, formatBytes));

      memoryCacheMap.set(repoId, {
        repoId,
        snapshots: finalUiSnapshots,
        loadedAt: Date.now(),
        activeBackgroundSync: null,
        syncInProgress: false,
        statsBackfillInProgress: false
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
    queueMissingStatsFetch,
    performFullSync,
    getRepoLoadingState
  ]);


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


  const loadSingleSnapshotStats = useCallback(async (
    snapshotId: string,
    snapshotName: string,
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string
  ) => {
    setRepoLoadingState(repoId, {
      type: 'manual-load',
      snapshotName
    });

    try {
      const stats = await invoke<{ total_size: number; total_file_count: number }>('get_snapshot_stats', {
        repo: connection.path,
        password: connection.password,
        snapshotId
      });

      const snapshot = snapshots.find(s => s.id === snapshotId);
      if (!snapshot) {
        console.error(`Snapshot ${snapshotId} not found`);
        return;
      }

      const dbSnapshot: DbSnapshotWithStats = {
        snapshot: snapshot as Snapshot,
        total_size: stats.total_size,
        total_file_count: stats.total_file_count
      };

      await invoke('save_snapshots_batch', {
        repoId,
        snapshots: [dbSnapshot]
      });

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
      setRepoLoadingState(repoId, { type: 'idle' });
    }
  }, [snapshots, updateSnapshotStats, setRepoLoadingState]);


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
