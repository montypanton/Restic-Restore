import { Header } from './Header';
import { TimelineView } from './TimelineView';
import { Repository, SnapshotWithStats, LoadingState } from '../types';
import styles from './MainContent.module.css';

interface MainContentProps {
    repository: Repository | null;
    snapshots: SnapshotWithStats[];
    loading: boolean;
    loadingState: LoadingState;
    error: string | undefined;
    onBrowse: (snapshot: SnapshotWithStats) => void;
    onLoadStats?: (snapshotId: string) => void;
    onSettings?: () => void;
    hasRepositories?: boolean;
    onAddRepository?: () => void;
}

export function MainContent({
    repository,
    snapshots,
    loading,
    loadingState,
    error,
    onBrowse,
    onLoadStats,
    onSettings,
    hasRepositories = false,
    onAddRepository
}: MainContentProps) {
    if (!repository) {
        return (
            <div className={styles.emptyState}>
                <div>
                    {hasRepositories
                        ? 'Select a repository to view snapshots'
                        : 'Add a repository to view, browse and restore from'
                    }
                </div>
                {!hasRepositories && onAddRepository && (
                    <button
                        className={styles.addButton}
                        onClick={onAddRepository}
                    >
                        + Add Repository
                    </button>
                )}
            </div>
        );
    }

    const lastBackupTime = snapshots[0]?.time;

    return (
        <>
            <Header
                repository={repository}
                snapshotCount={snapshots.length}
                lastBackupTime={lastBackupTime}
                loadingState={loadingState}
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
}
