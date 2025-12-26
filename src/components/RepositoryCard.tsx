import { useState } from 'react';
import { Repository } from '../types';
import styles from './RepositoryCard.module.css';

interface RepositoryCardProps {
    repository: Repository;
    isSelected: boolean;
    onClick: () => void;
    onRename?: (repoId: string, newName: string) => void;
}

export function RepositoryCard({
    repository,
    isSelected,
    onClick,
    onRename
}: RepositoryCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(repository.name);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onRename) {
            setIsEditing(true);
            setEditedName(repository.name);
        }
    };

    const handleBlur = () => {
        if (editedName.trim() && editedName !== repository.name) {
            onRename?.(repository.id, editedName);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleBlur();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditedName(repository.name);
        }
    };

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
            {isEditing ? (
                <input
                    type="text"
                    className={styles.nameInput}
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                />
            ) : (
                <div
                    className={styles.name}
                    onDoubleClick={handleDoubleClick}
                    title="Double-click to rename"
                >
                    {repository.name}
                </div>
            )}
            <div className={styles.stats}>
                <span>{repository.snapshotCount || 0} snapshots</span>
                <span>{repository.totalSize || '—'}</span>
            </div>
        </div>
    );
}
