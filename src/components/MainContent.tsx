import React from 'react';
import { Header } from './Header';
import { TimelineView } from './TimelineView';
import { Repository, SnapshotWithStats } from '../types';

interface MainContentProps {
    repository: Repository | null;
    snapshots: SnapshotWithStats[];
    loading: boolean;
    error: string | undefined;
    onBrowse: (snapshot: SnapshotWithStats) => void;
    onLoadStats?: (snapshotId: string) => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

/**
 * Main content area displaying repository header and snapshot timeline.
 * Shows empty state when no repository is selected.
 */
export const MainContent: React.FC<MainContentProps> = ({
    repository,
    snapshots,
    loading,
    error,
    onBrowse,
    onLoadStats,
    onRefresh,
    isRefreshing
}) => {
    const emptyStateStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-text-secondary)',
        fontSize: '14px',
        padding: '40px'
    };

    if (!repository) {
        return (
            <div style={emptyStateStyle}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>📦</div>
                <div>Select a repository to view snapshots</div>
            </div>
        );
    }

    const lastBackupTime = snapshots.length > 0
        ? snapshots.reduce((latest, snap) => {
            return new Date(snap.time) > new Date(latest) ? snap.time : latest;
        }, snapshots[0].time)
        : undefined;

    return (
        <>
            <Header
                repository={repository}
                snapshotCount={snapshots.length}
                lastBackupTime={lastBackupTime}
                onRefresh={onRefresh}
                isRefreshing={isRefreshing}
            />
            <TimelineView
                snapshots={snapshots}
                onBrowse={onBrowse}
                onLoadStats={onLoadStats}
                loading={loading}
                error={error}
            />
        </>
    );
};
