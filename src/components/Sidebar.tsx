import { RepositoryCard } from './RepositoryCard';
import { Repository } from '../types';
import styles from './Sidebar.module.css';

interface SidebarProps {
    repositories: Repository[];
    selectedRepoId: string | null;
    onSelectRepository: (id: string) => void;
    onAddRepository: () => void;
}

export function Sidebar({
    repositories,
    selectedRepoId,
    onSelectRepository,
    onAddRepository
}: SidebarProps) {
    return (
        <div className={styles.container}>
            <div>
                <div className={styles.header}>
                    <div className={styles.title}>Repositories</div>
                </div>

                {repositories.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyStateText}>No repositories</div>
                    </div>
                ) : (
                    <div className={styles.repoList}>
                        {repositories.map((repo) => (
                            <RepositoryCard
                                key={repo.id}
                                repository={repo}
                                isSelected={selectedRepoId === repo.id}
                                onClick={() => onSelectRepository(repo.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {repositories.length > 0 && (
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
