import { useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { ConnectionForm } from './components/ConnectionForm';
import { FileBrowser } from './components/FileBrowser';
import { SettingsWindow } from './components/SettingsWindow';
import { SnapshotWithStats } from './types';
import { useRepositories } from './hooks/useRepositories';
import { useSnapshots } from './hooks/useSnapshots';
import { useSnapshotStats } from './hooks/useSnapshotStats';
import { useRepositoryStats } from './hooks/useRepositoryStats';
import { useWindowState } from './hooks/useWindowState';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { formatBytes } from './utils/formatters';
import { TIMING } from './config/constants';

function App() {
  const {
    repositories,
    selectedRepoId,
    selectedRepo,
    selectedConnection,
    setSelectedRepoId,
    connectRepository,
    removeRepository,
    updateRepositoryStats,
  } = useRepositories();

  const {
    snapshots,
    loading: snapshotLoading,
    isRefreshing,
    error: snapshotError,
    loadSnapshots,
    refreshSnapshots,
    updateSnapshotStats,
    updateMultipleSnapshotStats,
    clearSnapshots,
  } = useSnapshots();

  const { loadStatsInBackground, loadSingleStats } = useSnapshotStats();

  const { loadRepositoryStats } = useRepositoryStats();

  const {
    showAddRepo,
    showSettings,
    browsingSnapshot,
    openAddRepo,
    closeAddRepo,
    openSettings,
    closeSettings,
    setBrowsingSnapshot,
    closeFileBrowser,
  } = useWindowState();

  useEffect(() => {
    if (selectedRepoId && selectedConnection) {
      loadSnapshots(
        selectedRepoId,
        selectedConnection,
        formatBytes,
        (repoId, snapshotCount) => {
          updateRepositoryStats(repoId, { snapshotCount });
        }
      );
    } else {
      clearSnapshots();
    }
  }, [selectedRepoId, selectedConnection, loadSnapshots, formatBytes, updateRepositoryStats, clearSnapshots]);

  useEffect(() => {
    if (snapshots.length > 0 && selectedRepoId && selectedConnection) {
      const snapshotsNeedingStats = snapshots.filter(snap => !snap.size && !snap.fileCount);

      if (snapshotsNeedingStats.length > 0) {
        loadStatsInBackground(
          snapshotsNeedingStats,
          selectedConnection,
          selectedRepoId,
          (updates) => {
            updateMultipleSnapshotStats(updates);
          }
        );
      }
    }
  }, [snapshots.length, selectedRepoId, selectedConnection, loadStatsInBackground, updateMultipleSnapshotStats]);

  useEffect(() => {
    if (selectedRepoId && selectedConnection) {
      loadRepositoryStats(
        selectedRepoId,
        selectedConnection,
        formatBytes,
        (repoId, totalSize) => {
          updateRepositoryStats(repoId, { totalSize });
        }
      );
    }
  }, [selectedRepoId, selectedConnection, loadRepositoryStats, formatBytes, updateRepositoryStats]);

  useEffect(() => {
    if (!selectedRepoId || !selectedConnection) return;

    const interval = setInterval(() => {
      refreshSnapshots(selectedRepoId, selectedConnection, formatBytes);
    }, TIMING.AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [selectedRepoId, selectedConnection, refreshSnapshots, formatBytes]);

  const handleConnect = useCallback(async (repoPath: string, password: string) => {
    connectRepository(repoPath, password, (repoId, _snapshotCount) => {
      const connection = { id: repoId, path: repoPath, password };
      loadRepositoryStats(
        repoId,
        connection,
        formatBytes,
        (id, totalSize) => {
          updateRepositoryStats(id, { totalSize });
        }
      );

      closeAddRepo();
    });
  }, [connectRepository, loadRepositoryStats, formatBytes, updateRepositoryStats, closeAddRepo]);

  const handleBrowse = useCallback((snapshot: SnapshotWithStats) => {
    setBrowsingSnapshot({ snapshot, files: [] });
  }, [setBrowsingSnapshot]);

  const handleRefresh = useCallback(async () => {
    if (!selectedRepoId || !selectedConnection || isRefreshing) return;
    await refreshSnapshots(selectedRepoId, selectedConnection, formatBytes);
  }, [selectedRepoId, selectedConnection, isRefreshing, refreshSnapshots, formatBytes]);

  const handleLoadStats = useCallback((snapshotId: string) => {
    if (!selectedRepoId || !selectedConnection) return;

    loadSingleStats(
      snapshotId,
      selectedConnection,
      selectedRepoId,
      (id, stats) => {
        updateSnapshotStats(id, stats);
      }
    );
  }, [selectedRepoId, selectedConnection, loadSingleStats, updateSnapshotStats]);

  const handleRemoveRepository = useCallback(async () => {
    if (!selectedRepoId) return;
    await removeRepository(selectedRepoId);
  }, [selectedRepoId, removeRepository]);

  useKeyboardShortcuts({
    onEscape: useCallback(() => {
      if (showAddRepo) closeAddRepo();
      else if (showSettings) closeSettings();
      else if (browsingSnapshot) closeFileBrowser();
    }, [showAddRepo, showSettings, browsingSnapshot, closeAddRepo, closeSettings, closeFileBrowser])
  });

  return (
    <>
      <Layout
        sidebar={
          <Sidebar
            repositories={repositories}
            selectedRepoId={selectedRepoId}
            onSelectRepository={setSelectedRepoId}
            onAddRepository={openAddRepo}
          />
        }
        content={
          <MainContent
            repository={selectedRepo}
            snapshots={snapshots}
            loading={snapshotLoading}
            error={snapshotError}
            onBrowse={handleBrowse}
            onLoadStats={handleLoadStats}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onSettings={openSettings}
            hasRepositories={repositories.length > 0}
            onAddRepository={openAddRepo}
          />
        }
      />

      {showAddRepo && (
        <div
          className="window-overlay"
          onClick={closeAddRepo}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              closeAddRepo();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-repo-title"
        >
          <div
            className="window-content"
            onClick={(e) => e.stopPropagation()}
          >
            <ConnectionForm onConnect={handleConnect} />
          </div>
        </div>
      )}

      {browsingSnapshot && selectedConnection && (
        <FileBrowser
          snapshot={browsingSnapshot.snapshot}
          repo={selectedConnection.path}
          password={selectedConnection.password}
          onClose={closeFileBrowser}
        />
      )}

      {showSettings && selectedRepo && (
        <SettingsWindow
          repository={selectedRepo}
          onClose={closeSettings}
          onRemove={() => {
            closeSettings();
            handleRemoveRepository();
          }}
        />
      )}
    </>
  );
}

export default App;
