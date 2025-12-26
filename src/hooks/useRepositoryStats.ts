import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ResticRepositoryStats } from '../types';

interface RepositoryConnection {
  id: string;
  path: string;
  password: string;
}

interface UseRepositoryStatsReturn {
  loadRepositoryStats: (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    onUpdate: (repoId: string, totalSize: string) => void
  ) => Promise<void>;
}

export function useRepositoryStats(): UseRepositoryStatsReturn {
  const loadRepositoryStats = useCallback(async (
    repoId: string,
    connection: RepositoryConnection,
    formatBytes: (bytes: number) => string,
    onUpdate: (repoId: string, totalSize: string) => void
  ) => {
    try {
      const repoStats = await invoke<ResticRepositoryStats>('get_repository_stats', {
        repo: connection.path,
        password: connection.password
      });

      const repoSize = formatBytes(repoStats.total_size);
      onUpdate(repoId, repoSize);
    } catch (err) {
      console.error('Failed to load repository stats:', err);
    }
  }, []);

  return {
    loadRepositoryStats,
  };
}
