import { Repository } from '../types';
import styles from './RepositoryCard.module.css';

interface RepositoryCardProps {
    repository: Repository;
    isSelected: boolean;
    onClick: () => void;
}

export function RepositoryCard({
    repository,
    isSelected,
    onClick
}: RepositoryCardProps) {
    return (
        <div
            className={`${styles.card} ${isSelected ? styles.selected : ''}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={`Repository ${repository.name}`}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
        >
            <div className={styles.name}>{repository.name}</div>
            <div className={styles.stats}>
                <span>{repository.snapshotCount || 0} snapshots</span>
                <span>{repository.totalSize || '—'}</span>
            </div>
        </div>
    );
}
