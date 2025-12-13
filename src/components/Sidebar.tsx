import React from 'react';
import { RepositoryCard } from './RepositoryCard';
import { Repository } from '../types';

interface SidebarProps {
    repositories: Repository[];
    selectedRepoId: string | null;
    onSelectRepository: (id: string) => void;
    onAddRepository: () => void;
}

/**
 * Sidebar component displaying list of saved repositories and add repository button.
 */
export const Sidebar: React.FC<SidebarProps> = ({
    repositories,
    selectedRepoId,
    onSelectRepository,
    onAddRepository
}) => {
    const headerStyle: React.CSSProperties = {
        marginBottom: '20px'
    };

    const titleStyle: React.CSSProperties = {
        fontSize: '20px',
        fontWeight: 600,
        color: 'var(--color-text-primary)'
    };

    const emptyStateStyle: React.CSSProperties = {
        textAlign: 'center',
        padding: '40px 20px',
        color: 'var(--color-text-secondary)',
        fontSize: '13px'
    };

    const addButtonStyle: React.CSSProperties = {
        width: '100%',
        padding: '12px',
        marginTop: '12px',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        backgroundColor: 'var(--color-bg-white)',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--color-text-primary)',
        transition: 'all 0.15s ease'
    };

    return (
        <div>
            <div style={headerStyle}>
                <div style={titleStyle}>Repositories</div>
            </div>

            {repositories.length === 0 ? (
                <div style={emptyStateStyle}>
                    <div style={{ marginBottom: '8px' }}>No repositories</div>
                </div>
            ) : (
                <div>
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
        </div>
    );
};
