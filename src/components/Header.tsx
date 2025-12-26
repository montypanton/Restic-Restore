import { Repository, LoadingState } from '../types';
import { formatRelativeTime } from '../utils/dateFormatters';
import { LoadingIndicator } from './LoadingIndicator';
import styles from './Header.module.css';

interface HeaderProps {
    repository: Repository;
    snapshotCount: number;
    lastBackupTime?: string;
    loadingState: LoadingState;
    onSettings?: () => void;
}

export function Header({
    repository,
    snapshotCount,
    lastBackupTime,
    loadingState,
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
                <LoadingIndicator state={loadingState} />
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
