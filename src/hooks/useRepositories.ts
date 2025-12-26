import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { Repository, SavedRepository, Snapshot } from '../types';

interface RepositoryConnection {
  id: string;
  path: string;
  password: string;
}

interface UseRepositoriesReturn {
  repositories: Repository[];
  repoConnections: Map<string, RepositoryConnection>;
  selectedRepoId: string | null;
  selectedRepo: Repository | null;
  selectedConnection: RepositoryConnection | null;
  setSelectedRepoId: (id: string | null) => void;
  connectRepository: (
    repoPath: string,
    password: string,
    onSuccess: (repoId: string, snapshotCount: number) => void
  ) => Promise<void>;
  removeRepository: (repoId: string) => Promise<void>;
  updateRepositoryStats: (repoId: string, stats: Partial<Repository>) => void;
  loading: boolean;
  error: string | undefined;
}

export function useRepositories(): UseRepositoriesReturn {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoConnections, setRepoConnections] = useState<Map<string, RepositoryConnection>>(new Map());
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /**
   * TODO: Passwords stored in plain text. Move to OS secure keychain.
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
      setError('Failed to save repository configuration');
    }
  }, []);

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
      setError('Failed to load saved repositories');
    }
  }, []);

  // Validates credentials by attempting to list snapshots (fastest connection test)
  const connectRepository = useCallback(async (
    repoPath: string,
    password: string,
    onSuccess: (repoId: string, snapshotCount: number) => void
  ) => {
    try {
      setLoading(true);
      setError(undefined);

      const snapshotList = await invoke<Snapshot[]>('list_snapshots', {
        repo: repoPath,
        password: password
      });

      const repoId = crypto.randomUUID();

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

      await saveRepositoriesToDisk(updatedRepos);

      setLoading(false);

      onSuccess(repoId, snapshotList.length);
    } catch (err) {
      setError(`Failed to connect: ${err}`);
      console.error('Connection error:', err);
      setLoading(false);
    }
  }, [repositories, saveRepositoriesToDisk]);

  const removeRepository = useCallback(async (repoId: string) => {
    const confirmed = await ask(
      'Are you sure you want to remove this repository? This will delete the local cache but not affect the actual backup repository.',
      {
        title: 'Remove Repository',
        kind: 'warning'
      }
    );

    if (!confirmed) return;

    try {
      await invoke('remove_repository', { repoId });

      setRepositories(prev => prev.filter(r => r.id !== repoId));
      setRepoConnections(prev => {
        const newMap = new Map(prev);
        newMap.delete(repoId);
        return newMap;
      });

      if (selectedRepoId === repoId) {
        setSelectedRepoId(null);
      }
    } catch (err) {
      console.error('Failed to remove repository:', err);
      setError('Failed to remove repository. Please try again.');
    }
  }, [selectedRepoId]);

  const updateRepositoryStats = useCallback((repoId: string, stats: Partial<Repository>) => {
    setRepositories(prev =>
      prev.map(r =>
        r.id === repoId
          ? { ...r, ...stats }
          : r
      )
    );
  }, []);

  useEffect(() => {
    loadRepositoriesFromDisk();
  }, [loadRepositoriesFromDisk]);

  const selectedRepo = repositories.find(r => r.id === selectedRepoId) || null;
  const selectedConnection = selectedRepoId ? repoConnections.get(selectedRepoId) || null : null;

  return {
    repositories,
    repoConnections,
    selectedRepoId,
    selectedRepo,
    selectedConnection,
    setSelectedRepoId,
    connectRepository,
    removeRepository,
    updateRepositoryStats,
    loading,
    error,
  };
}
