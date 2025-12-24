import { useState, useCallback } from 'react';
import { Snapshot, FileNode } from '../types';

interface BrowsingSnapshot {
  snapshot: Snapshot;
  files: FileNode[];
}

interface UseWindowStateReturn {
  showAddRepo: boolean;
  showSettings: boolean;
  browsingSnapshot: BrowsingSnapshot | null;
  openAddRepo: () => void;
  closeAddRepo: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setBrowsingSnapshot: (data: BrowsingSnapshot | null) => void;
  closeFileBrowser: () => void;
}

export function useWindowState(): UseWindowStateReturn {
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [browsingSnapshot, setBrowsingSnapshot] = useState<BrowsingSnapshot | null>(null);

  const openAddRepo = useCallback(() => {
    setShowAddRepo(true);
  }, []);

  const closeAddRepo = useCallback(() => {
    setShowAddRepo(false);
  }, []);

  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const closeFileBrowser = useCallback(() => {
    setBrowsingSnapshot(null);
  }, []);

  return {
    showAddRepo,
    showSettings,
    browsingSnapshot,
    openAddRepo,
    closeAddRepo,
    openSettings,
    closeSettings,
    setBrowsingSnapshot,
    closeFileBrowser,
  };
}
