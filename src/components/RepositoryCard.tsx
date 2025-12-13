import React from 'react';
import { Repository } from '../types';

interface RepositoryCardProps {
    repository: Repository;
    isSelected: boolean;
    onClick: () => void;
}

/**
 * Repository card component displayed in the sidebar.
 * Shows repository name, snapshot count, and total size.
 */
export const RepositoryCard: React.FC<RepositoryCardProps> = ({
    repository,
    isSelected,
    onClick
}) => {
    const cardStyle: React.CSSProperties = {
        backgroundColor: 'var(--color-bg-white)',
        border: `${isSelected ? '2px' : '1px'} solid var(--color-border)`,
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        color: 'var(--color-text-primary)'
    };

    const nameStyle: React.CSSProperties = {
        fontSize: '14px',
        fontWeight: 600,
        marginBottom: '8px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--color-text-primary)'
    };

    const statsRowStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: 'var(--color-text-primary)'
    };

    return (
        <div
            style={cardStyle}
            onClick={onClick}
            onMouseEnter={(e) => {
                if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                }
            }}
            onMouseLeave={(e) => {
                if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-white)';
                }
            }}
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
            <div style={nameStyle}>{repository.name}</div>
            <div style={statsRowStyle}>
                <span>{repository.snapshotCount || 0} snapshots</span>
                <span>{repository.totalSize || '—'}</span>
            </div>
        </div>
    );
};
