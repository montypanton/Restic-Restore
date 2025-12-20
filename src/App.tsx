import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import './App.css';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { ConnectionForm } from './components/ConnectionForm';
import { FileBrowser } from './components/FileBrowser';
import { SettingsModal } from './components/SettingsModal';
import { Repository, Snapshot, SnapshotWithStats, SavedRepository, StatsCache, FileNode } from './types';

const STATS_LOAD_LIMIT = 10;
const CACHE_TTL = 5 * 60 * 1000;

interface RepositoryConnection {
  id: string;
  path: string;
  password: string;
}

interface SnapshotCache {
  snapshots: SnapshotWithStats[];
  timestamp: number;
}

function App() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoConnections, setRepoConnections] = useState<Map<string, RepositoryConnection>>(new Map());
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [snapshotCache, setSnapshotCache] = useState<Map<string, SnapshotCache>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [showAddRepo, setShowAddRepo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [browsingSnapshot, setBrowsingSnapshot] = useState<{ snapshot: Snapshot; files: FileNode[] } | null>(null);

  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }, []);

  /**
   * Persists repository configurations to disk.
   * 
   * SECURITY NOTE: Passwords are currently stored in plain text in the user's Documents folder.
   * This is a temporary implementation. Future versions will migrate to OS-provided secure
   * credential storage (Windows Credential Manager, macOS Keychain, Linux Secret Service).
   */
  const saveRepositoriesToDisk = useCallback(async (repos: Repository[]) => {
    try {
      const savedRepos: SavedRepository[] = repos.map(r => ({
        id: r.id,
        name: r.name,
        path: r.path,
        password: r.password || ''
      }));
      await invoke('save_repositories', { repositories: savedRepos });
    } catch (err) {
      console.error('Failed to save repositories:', err);
    }
  }, []);

  /**
   * Loads saved repository configurations from disk on app startup.
   * Auto-selects the first repository if available.
   */
  const loadRepositoriesFromDisk = useCallback(async () => {
    try {
      const savedRepos = await invoke<SavedRepository[]>('load_repositories');
      
      if (savedRepos.length > 0) {
        const repos: Repository[] = savedRepos.map(sr => ({
          id: sr.id,
          name: sr.name,
          path: sr.path,
          password: sr.password,
          snapshotCount: undefined,
          totalSize: undefined
        }));
        
        const connections = new Map<string, RepositoryConnection>();
        savedRepos.forEach(sr => {
          connections.set(sr.id, {
            id: sr.id,
            path: sr.path,
            password: sr.password
          });
        });
        
        setRepositories(repos);
        setRepoConnections(connections);
        
        if (repos.length > 0) {
          setSelectedRepoId(repos[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load repositories:', err);
    }
  }, []);

  /**
   * Loads snapshot statistics in the background using parallel requests.
   * Only loads stats for the most recent snapshots (up to STATS_LOAD_LIMIT).
   * Updates both in-memory and persistent cache.
   */
  const loadStatsInBackground = useCallback(async (
    snapshotList: Snapshot[],
    repoPath: string,
    password: string,
    repoId: string
  ) => {
    const snapshotsToLoadStats = snapshotList.slice(0, STATS_LOAD_LIMIT);

    const statsPromises = snapshotsToLoadStats.map(async (snap) => {
      try {
        const stats = await invoke<any>('get_snapshot_stats', {
          repo: repoPath,
          password: password,
          snapshotId: snap.id
        });
        return {
          snapshotId: snap.id,
          size: formatBytes(stats.total_size),
          fileCount: stats.total_file_count,
          rawSize: stats.total_size
        };
      } catch (err) {
        return null;
      }
    });

    const results = await Promise.allSettled(statsPromises);

    const statsMap = new Map<string, { size: string; fileCount: number }>();

    results.forEach((result, _index) => {
      if (result.status === 'fulfilled' && result.value) {
        const stat = result.value;
        statsMap.set(stat.snapshotId, {
          size: stat.size,
          fileCount: stat.fileCount
        });
      }
    });

    if (statsMap.size > 0) {
      setSnapshots(prev =>
        prev.map(s =>
          statsMap.has(s.id)
            ? { ...s, ...statsMap.get(s.id) }
            : s
        )
      );

      setSnapshotCache(prev => {
        const cached = prev.get(repoId);
        if (cached) {
          const updatedSnapshots = cached.snapshots.map(s =>
            statsMap.has(s.id)
              ? { ...s, ...statsMap.get(s.id) }
              : s
          );
          return new Map(prev).set(repoId, {
            snapshots: updatedSnapshots,
            timestamp: cached.timestamp
          });
        }
        return prev;
      });

      try {
        invoke<StatsCache>('load_snapshot_stats_cache', {
          repoId: repoId
        }).then(diskCache => {
          results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
              const snap = snapshotsToLoadStats[index];
              diskCache.stats[snap.id] = {
                total_size: result.value.rawSize,
                total_file_count: result.value.fileCount
              };
            }
          });
          
          return invoke('save_snapshot_stats_cache', {
            repoId: repoId,
            cache: diskCache
          });
        }).catch(() => {});
      } catch (err) {}
    }
  }, [formatBytes]);

  /**
   * Loads statistics for a single snapshot on demand (when user expands it).
   */
  const loadSingleSnapshotStats = useCallback(async (snapshotId: string) => {
    if (!selectedRepoId) return;
    const connection = repoConnections.get(selectedRepoId);
    if (!connection) return;

    try {
      const stats = await invoke<any>('get_snapshot_stats', {
        repo: connection.path,
        password: connection.password,
        snapshotId: snapshotId
      });

      const statsData = {
        size: formatBytes(stats.total_size),
        fileCount: stats.total_file_count
      };

      setSnapshots(prev =>
        prev.map(s =>
          s.id === snapshotId
            ? { ...s, ...statsData }
            : s
        )
      );

      setSnapshotCache(prev => {
        const cached = prev.get(selectedRepoId);
        if (cached) {
          const updatedSnapshots = cached.snapshots.map(s =>
            s.id === snapshotId
              ? { ...s, ...statsData }
              : s
          );
          return new Map(prev).set(selectedRepoId, {
            snapshots: updatedSnapshots,
            timestamp: cached.timestamp
          });
        }
        return prev;
      });

      try {
        const diskCache = await invoke<StatsCache>('load_snapshot_stats_cache', {
          repoId: selectedRepoId
        });
        diskCache.stats[snapshotId] = stats;
        await invoke('save_snapshot_stats_cache', {
          repoId: selectedRepoId,
          cache: diskCache
        });
      } catch (err) {}
    } catch (err) {}
  }, [selectedRepoId, repoConnections, formatBytes]);

  /**
   * Loads repository size (actual disk usage).
   */
  const loadRepositoryStats = useCallback(async (repoId: string) => {
    const connection = repoConnections.get(repoId);
    if (!connection) return;

    try {
      const repoStats = await invoke<any>('get_repository_stats', {
        repo: connection.path,
        password: connection.password
      });

      const repoSize = formatBytes(repoStats.total_size);
      setRepositories(prev =>
        prev.map(r =>
          r.id === repoId
            ? { ...r, totalSize: repoSize }
            : r
        )
      );
    } catch (err) {
      console.error('Failed to load repository stats:', err);
    }
  }, [repoConnections, formatBytes]);

  /**
   * Loads snapshot list for a repository with caching.
   * Loads stats from persistent cache immediately, then fetches missing stats in background.
   */
  const loadSnapshots = useCallback(async (repoId: string) => {
    const connection = repoConnections.get(repoId);
    if (!connection) return;

    const cached = snapshotCache.get(repoId);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      setSnapshots(cached.snapshots);
      return;
    }

    try {
      setLoading(true);
      setError(undefined);

      const [snapshotList, diskCache] = await Promise.all([
        invoke<Snapshot[]>('list_snapshots', {
          repo: connection.path,
          password: connection.password
        }),
        invoke<StatsCache>('load_snapshot_stats_cache', {
          repoId: repoId
        }).catch(() => {
          return { stats: {} } as StatsCache;
        })
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

      setRepositories(prev =>
        prev.map(r =>
          r.id === repoId
            ? { ...r, snapshotCount: sortedSnapshotList.length }
            : r
        )
      );

      loadRepositoryStats(repoId);

      setLoading(false);

      const snapshotsNeedingStats = sortedSnapshotList
        .filter(snap => !diskCache.stats[snap.id])
        .slice(0, STATS_LOAD_LIMIT);
      
      if (snapshotsNeedingStats.length > 0) {
        loadStatsInBackground(snapshotsNeedingStats, connection.path, connection.password, repoId);
      }

    } catch (err) {
      setError(`Failed to load snapshots: ${err}`);
      console.error('Load snapshots error:', err);
      setLoading(false);
    }
  }, [repoConnections, snapshotCache, loadStatsInBackground, loadRepositoryStats]);

  /**
   * Connects to a new repository and adds it to the saved list.
   */
  const handleConnect = useCallback(async (repoPath: string, password: string) => {
    try {
      setLoading(true);
      setError(undefined);

      const snapshotList = await invoke<Snapshot[]>('list_snapshots', {
        repo: repoPath,
        password: password
      });

      const repoId = Date.now().toString();
      const pathParts = repoPath.split(/[/\\]/);
      const repoName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || 'Repository';

      const newRepo: Repository = {
        id: repoId,
        name: repoName,
        path: repoPath,
        password: password,
        snapshotCount: snapshotList.length,
        totalSize: undefined
      };

      const newConnection: RepositoryConnection = {
        id: repoId,
        path: repoPath,
        password: password
      };

      setRepoConnections(prev => new Map(prev).set(repoId, newConnection));
      const updatedRepos = [...repositories, newRepo];
      setRepositories(updatedRepos);
      setSelectedRepoId(repoId);
      setShowAddRepo(false);

      await saveRepositoriesToDisk(updatedRepos);

      const snapshotsWithoutStats: SnapshotWithStats[] = snapshotList.map(snap => ({
        ...snap,
        size: undefined,
        fileCount: undefined
      }));

      setSnapshots(snapshotsWithoutStats);
      setLoading(false);

      loadRepositoryStats(repoId);
      loadStatsInBackground(snapshotList, repoPath, password, repoId);

    } catch (err) {
      setError(`Failed to connect: ${err}`);
      console.error('Connection error:', err);
      setLoading(false);
    }
  }, [loadStatsInBackground, loadRepositoryStats, repositories, saveRepositoriesToDisk]);

  const handleBrowse = useCallback((snapshot: SnapshotWithStats) => {
    const connection = repoConnections.get(selectedRepoId || '');
    if (!connection) return;

    setBrowsingSnapshot({ snapshot, files: [] });
  }, [selectedRepoId, repoConnections]);

  const handleAddRepository = useCallback(() => {
    setShowAddRepo(true);
  }, []);

  const handleCloseAddRepo = useCallback(() => {
    setShowAddRepo(false);
  }, []);

  const handleCloseBrowser = useCallback(() => {
    setBrowsingSnapshot(null);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!selectedRepoId || isRefreshing) return;
    
    setIsRefreshing(true);
    setSnapshotCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(selectedRepoId);
      return newCache;
    });
    
    await loadSnapshots(selectedRepoId);
    setIsRefreshing(false);
  }, [selectedRepoId, isRefreshing, loadSnapshots]);

  const handleSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleRemoveRepository = useCallback(async () => {
    if (!selectedRepoId) return;
    
    const confirmed = await ask('Are you sure you want to remove this repository? This will delete the local cache but not affect the actual backup repository.', {
      title: 'Remove Repository',
      kind: 'warning'
    });
    
    if (!confirmed) return;

    try {
      await invoke('remove_repository', { repoId: selectedRepoId });
      
      setRepositories(prev => prev.filter(r => r.id !== selectedRepoId));
      repoConnections.delete(selectedRepoId);
      setRepoConnections(new Map(repoConnections));
      
      snapshotCache.delete(selectedRepoId);
      setSnapshotCache(new Map(snapshotCache));
      
      setSnapshots([]);
      setSelectedRepoId(null);
    } catch (err) {
      console.error('Failed to remove repository:', err);
      alert('Failed to remove repository. Please try again.');
    }
  }, [selectedRepoId, repoConnections, snapshotCache]);

  useEffect(() => {
    loadRepositoriesFromDisk();
  }, []);

  useEffect(() => {
    if (selectedRepoId) {
      loadSnapshots(selectedRepoId);
    }
  }, [selectedRepoId, loadSnapshots]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddRepo) setShowAddRepo(false);
        if (showSettings) setShowSettings(false);
        if (browsingSnapshot) setBrowsingSnapshot(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showAddRepo, showSettings, browsingSnapshot]);

  useEffect(() => {
    if (!selectedRepoId) return;

    const interval = setInterval(() => {
      handleRefresh();
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [selectedRepoId, handleRefresh]);

  const selectedRepo = repositories.find(r => r.id === selectedRepoId) || null;
  const connection = selectedRepoId ? repoConnections.get(selectedRepoId) : null;

  return (
    <>
      <Layout
        sidebar={
          <Sidebar
            repositories={repositories}
            selectedRepoId={selectedRepoId}
            onSelectRepository={setSelectedRepoId}
            onAddRepository={handleAddRepository}
          />
        }
        content={
          <MainContent
            repository={selectedRepo}
            snapshots={snapshots}
            loading={loading}
            error={error}
            onBrowse={handleBrowse}
            onLoadStats={loadSingleSnapshotStats}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onSettings={handleSettings}
            hasRepositories={repositories.length > 0}
            onAddRepository={handleAddRepository}
          />
        }
      />

      {showAddRepo && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={handleCloseAddRepo}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              handleCloseAddRepo();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-repo-title"
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ConnectionForm onConnect={handleConnect} />
          </div>
        </div>
      )}

      {browsingSnapshot && connection && (
        <FileBrowser
          snapshot={browsingSnapshot.snapshot}
          repo={connection.path}
          password={connection.password}
          onClose={handleCloseBrowser}
        />
      )}

      {showSettings && selectedRepo && (
        <SettingsModal
          repository={selectedRepo}
          onClose={handleCloseSettings}
          onRemove={() => {
            handleCloseSettings();
            handleRemoveRepository();
          }}
        />
      )}
    </>
  );
}

export default App;
