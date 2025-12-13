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
    onSettings?: () => void;
    hasRepositories?: boolean;
    onAddRepository?: () => void;
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
    isRefreshing,
    onSettings,
    hasRepositories = false,
    onAddRepository
}) => {
    const emptyStateStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-text-secondary)',
        fontSize: '14px',
        padding: '40px',
        gap: '16px'
    };

    const addButtonStyle: React.CSSProperties = {
        padding: '12px 24px',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        backgroundColor: 'var(--color-bg-white)',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--color-text-primary)',
        transition: 'all 0.15s ease'
    };

    if (!repository) {
        return (
            <div style={emptyStateStyle}>
                <div>
                    {hasRepositories 
                        ? 'Select a repository to view snapshots'
                        : 'Add a repository to view, browse and restore from'
                    }
                </div>
                {!hasRepositories && onAddRepository && (
                    <button
                        style={addButtonStyle}
                        onClick={onAddRepository}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-white)';
                        }}
                    >
                        + Add Repository
                    </button>
                )}
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
                onSettings={onSettings}
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
