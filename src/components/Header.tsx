import React from 'react';
import { Repository } from '../types';

interface HeaderProps {
    repository: Repository;
    snapshotCount: number;
    lastBackupTime?: string;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

/**
 * Header component displaying repository name, snapshot count, and last backup time.
 */
export const Header: React.FC<HeaderProps> = ({
    repository,
    snapshotCount,
    lastBackupTime,
    onRefresh,
    isRefreshing = false
}) => {
    const containerStyle: React.CSSProperties = {
        padding: '24px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-white)'
    };

    const titleStyle: React.CSSProperties = {
        fontSize: '28px',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
        marginBottom: '8px'
    };

    const subtitleStyle: React.CSSProperties = {
        fontSize: '14px',
        color: 'var(--color-text-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    };

    const refreshButtonStyle: React.CSSProperties = {
        padding: '2px 8px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '9999px',
        cursor: isRefreshing ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        opacity: isRefreshing ? 0.6 : 1
    };

    const formatLastBackup = (time?: string) => {
        if (!time) return 'Never';
        try {
            const date = new Date(time);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
            if (diffDays === 1) return '1 day ago';
            if (diffDays < 7) return `${diffDays} days ago`;
            
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        } catch {
            return 'Unknown';
        }
    };

    return (
        <div style={containerStyle}>
            <div style={titleStyle}>{repository.name}</div>
            <div style={subtitleStyle}>
                <span>
                    {snapshotCount} snapshot{snapshotCount !== 1 ? 's' : ''} • Last backup: {formatLastBackup(lastBackupTime)}
                </span>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        style={refreshButtonStyle}
                        onMouseEnter={(e) => {
                            if (!isRefreshing) {
                                e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                        }}
                        title="Refresh snapshots"
                    >
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                )}
            </div>
        </div>
    );
};
