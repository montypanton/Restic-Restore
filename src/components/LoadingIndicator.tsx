import { LoadingState } from '../types';
import styles from './LoadingIndicator.module.css';

interface LoadingIndicatorProps {
    state: LoadingState;
}

export function LoadingIndicator({ state }: LoadingIndicatorProps) {
    if (state.type === 'idle') {
        return null;
    }

    return (
        <div className={styles.container}>
            <div className={styles.spinner} />
            <span className={styles.text}>
                {state.type === 'background-sync' && 'Checking for new snapshots...'}
                {state.type === 'fetching-stats' && (
                    `Loading stats: ${state.processed ?? 0}`
                )}
                {state.type === 'manual-load' && (
                    `Loading stats for ${state.snapshotName}`
                )}
            </span>
        </div>
    );
}
