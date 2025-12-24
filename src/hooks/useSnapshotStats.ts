import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Snapshot, StatsCache, ResticSnapshotStats } from '../types';
import { formatBytes } from '../utils/formatters';
import { CACHE } from '../config/constants';

interface RepositoryConnection {
  id: string;
  path: string;
  password: string;
}

interface SnapshotStatsUpdate {
  size: string;
  fileCount: number;
}

interface UseSnapshotStatsReturn {
  loadStatsInBackground: (
    snapshotList: Snapshot[],
    connection: RepositoryConnection,
    repoId: string,
    onUpdate: (updates: Map<string, SnapshotStatsUpdate>) => void
  ) => Promise<void>;

  loadSingleStats: (
    snapshotId: string,
    connection: RepositoryConnection,
    repoId: string,
    onUpdate: (snapshotId: string, stats: SnapshotStatsUpdate) => void
  ) => Promise<void>;
}

/**
 * Loads stats in parallel with disk cache.
 */
export function useSnapshotStats(): UseSnapshotStatsReturn {

  /**
   * Loads stats for recent snapshots in parallel.
   */
  const loadStatsInBackground = useCallback(async (
    snapshotList: Snapshot[],
    connection: RepositoryConnection,
    repoId: string,
    onUpdate: (updates: Map<string, SnapshotStatsUpdate>) => void
  ) => {
    const snapshotsToLoadStats = snapshotList.slice(0, CACHE.STATS_PARALLEL_LIMIT);

    const statsPromises = snapshotsToLoadStats.map(async (snap) => {
      try {
        const stats = await invoke<ResticSnapshotStats>('get_snapshot_stats', {
          repo: connection.path,
          password: connection.password,
          snapshotId: snap.id
        });
        return {
          snapshotId: snap.id,
          size: formatBytes(stats.total_size),
          fileCount: stats.total_file_count,
          rawSize: stats.total_size
        };
      } catch (err) {
        console.error(`Failed to load stats for snapshot ${snap.id}:`, err);
        return null;
      }
    });

    const results = await Promise.allSettled(statsPromises);

    const statsMap = new Map<string, SnapshotStatsUpdate>();

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        const stat = result.value;
        statsMap.set(stat.snapshotId, {
          size: stat.size,
          fileCount: stat.fileCount
        });
      }
    });

    if (statsMap.size > 0) {
      onUpdate(statsMap);

      try {
        const diskCache = await invoke<StatsCache>('load_snapshot_stats_cache', {
          repoId: repoId
        });

        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            const snap = snapshotsToLoadStats[index];
            diskCache.stats[snap.id] = {
              total_size: result.value.rawSize,
              total_file_count: result.value.fileCount
            };
          }
        });

        await invoke('save_snapshot_stats_cache', {
          repoId: repoId,
          cache: diskCache
        });
      } catch (err) {
        console.error('Failed to update stats cache:', err);
      }
    }
  }, [formatBytes]);

  /**
   * Loads stats for one snapshot.
   */
  const loadSingleStats = useCallback(async (
    snapshotId: string,
    connection: RepositoryConnection,
    repoId: string,
    onUpdate: (snapshotId: string, stats: SnapshotStatsUpdate) => void
  ) => {
    try {
      const stats = await invoke<ResticSnapshotStats>('get_snapshot_stats', {
        repo: connection.path,
        password: connection.password,
        snapshotId: snapshotId
      });

      const statsData = {
        size: formatBytes(stats.total_size),
        fileCount: stats.total_file_count
      };

      onUpdate(snapshotId, statsData);

      try {
        const diskCache = await invoke<StatsCache>('load_snapshot_stats_cache', {
          repoId: repoId
        });
        diskCache.stats[snapshotId] = {
          total_size: stats.total_size,
          total_file_count: stats.total_file_count
        };
        await invoke('save_snapshot_stats_cache', {
          repoId: repoId,
          cache: diskCache
        });
      } catch (err) {
        console.error('Failed to update stats cache for snapshot:', snapshotId, err);
      }
    } catch (err) {
      console.error('Failed to load snapshot stats:', err);
    }
  }, []);

  return {
    loadStatsInBackground,
    loadSingleStats,
  };
}
