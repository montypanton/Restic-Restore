import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Snapshot, SnapshotWithStats, StatsCache } from '../types';
import { CACHE } from '../config/constants';

interface RepositoryConnection {
  id: string;
  path: string;
  password: string;
}

interface SnapshotCache {
  snapshots: SnapshotWithStats[];
  timestamp: number;
}

interface UseSnapshotsReturn {
  snapshots: SnapshotWithStats[];
  loading: boolean;
  isRefreshing: boolean;
  error: string | undefined;
  loadSnapshots: (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    onSnapshotsLoaded: (repoId: string, snapshotCount: number) => void
  ) => Promise<void>;
  refreshSnapshots: (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string
  ) => Promise<void>;
  updateSnapshotStats: (snapshotId: string, stats: { size: string; fileCount: number }) => void;
  updateMultipleSnapshotStats: (updates: Map<string, { size: string; fileCount: number }>) => void;
  clearSnapshots: () => void;
}

/**
 * Loads snapshots with TTL cache and stats updates.
 */
export function useSnapshots(): UseSnapshotsReturn {
  const [snapshots, setSnapshots] = useState<SnapshotWithStats[]>([]);
  const [snapshotCache, setSnapshotCache] = useState<Map<string, SnapshotCache>>(new Map());
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /**
   * Loads cached stats first, fetches missing ones later.
   */
  const loadSnapshots = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    onSnapshotsLoaded: (repoId: string, snapshotCount: number) => void
  ) => {
    const cached = snapshotCache.get(repoId);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE.SNAPSHOT_TTL_MS)) {
      setSnapshots(cached.snapshots);
      return;
    }

    try {
      setLoading(true);
      setError(undefined);

      const loadDiskCache = async (): Promise<StatsCache> => {
        try {
          return await invoke<StatsCache>('load_snapshot_stats_cache', {
            repoId: repoId
          });
        } catch {
          return { stats: {} } as StatsCache;
        }
      };

      const [snapshotList, diskCache] = await Promise.all([
        invoke<Snapshot[]>('list_snapshots', {
          repo: connection.path,
          password: connection.password
        }),
        loadDiskCache()
      ]);

      const sortedSnapshotList = [...snapshotList].sort((a, b) => {
        return new Date(b.time).getTime() - new Date(a.time).getTime();
      });

      const snapshotsWithCachedStats: SnapshotWithStats[] = sortedSnapshotList.map(snap => {
        const cached = diskCache.stats[snap.id];
        return {
          ...snap,
          size: cached ? formatBytes(cached.total_size) : undefined,
          fileCount: cached ? cached.total_file_count : undefined
        };
      });

      setSnapshots(snapshotsWithCachedStats);

      setSnapshotCache(prev => new Map(prev).set(repoId, {
        snapshots: snapshotsWithCachedStats,
        timestamp: now
      }));

      onSnapshotsLoaded(repoId, sortedSnapshotList.length);

      setLoading(false);
    } catch (err) {
      setError(`Failed to load snapshots: ${err}`);
      console.error('Load snapshots error:', err);
      setLoading(false);
    }
  }, [snapshotCache]);

  /**
   * Reloads snapshots ignoring cache.
   */
  const refreshSnapshots = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string
  ) => {
    setIsRefreshing(true);

    setSnapshotCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(repoId);
      return newCache;
    });

    await loadSnapshots(repoId, connection, formatBytes, () => {});

    setIsRefreshing(false);
  }, [loadSnapshots]);

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

  const updateMultipleSnapshotStats = useCallback((
    updates: Map<string, { size: string; fileCount: number }>
  ) => {
    setSnapshots(prev =>
      prev.map(s =>
        updates.has(s.id)
          ? { ...s, ...updates.get(s.id) }
          : s
      )
    );
  }, []);

  const clearSnapshots = useCallback(() => {
    setSnapshots([]);
  }, []);

  return {
    snapshots,
    loading,
    isRefreshing,
    error,
    loadSnapshots,
    refreshSnapshots,
    updateSnapshotStats,
    updateMultipleSnapshotStats,
    clearSnapshots,
  };
}
