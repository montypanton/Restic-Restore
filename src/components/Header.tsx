import { Repository } from '../types';
import { formatRelativeTime } from '../utils/dateFormatters';
import styles from './Header.module.css';

interface HeaderProps {
    repository: Repository;
    snapshotCount: number;
    lastBackupTime?: string;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onSettings?: () => void;
}

export function Header({
    repository,
    snapshotCount,
    lastBackupTime,
    onRefresh,
    isRefreshing = false,
    onSettings
}: HeaderProps) {
    const lastBackupFormatted = lastBackupTime ? formatRelativeTime(lastBackupTime) : 'Never';

    return (
        <div className={styles.container}>
            <div className={styles.title}>{repository.name}</div>
            <div className={styles.subtitle}>
                <span>
                    {snapshotCount} snapshot{snapshotCount !== 1 ? 's' : ''} • Last backup: {lastBackupFormatted}
                </span>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className={styles.refreshButton}
                        title="Refresh snapshots"
                    >
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                )}
                {onSettings && (
                    <button
                        onClick={onSettings}
                        className={styles.settingsButton}
                        title="Repository settings"
                    >
                        Settings
                    </button>
                )}
            </div>
        </div>
    );
}
