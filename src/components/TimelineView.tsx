import React, { useState, useMemo } from 'react';
import { SnapshotWithStats } from '../types';

interface TimelineViewProps {
    snapshots: SnapshotWithStats[];
    onBrowse: (snapshot: SnapshotWithStats) => void;
    onLoadStats?: (snapshotId: string) => void;
    loading?: boolean;
    error?: string;
}

/**
 * Displays snapshots in a timeline view grouped by date.
 * Supports expanding snapshots to view details and load statistics on demand.
 */
export const TimelineView: React.FC<TimelineViewProps> = ({
    snapshots,
    onBrowse,
    onLoadStats,
    loading,
    error
}) => {
    const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
    const [loadingStatsIds, setLoadingStatsIds] = useState<Set<string>>(new Set());

    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        } catch {
            return dateString;
        }
    };

    const formatTime = (dateString: string) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return '';
        }
    };

    const truncateId = (id: string, shortId?: string) => {
        return shortId || id.substring(0, 8);
    };

    const sortedSnapshots = useMemo(() => {
        return [...snapshots].sort((a, b) => {
            return new Date(b.time).getTime() - new Date(a.time).getTime();
        });
    }, [snapshots]);

    const groupedSnapshots = useMemo(() => {
        const groups: { date: string; snapshots: SnapshotWithStats[] }[] = [];
        let currentDate = '';

        sortedSnapshots.forEach((snapshot) => {
            const date = formatDate(snapshot.time);
            if (date !== currentDate) {
                currentDate = date;
                groups.push({ date, snapshots: [] });
            }
            groups[groups.length - 1].snapshots.push(snapshot);
        });

        return groups;
    }, [sortedSnapshots]);

    const handleToggle = (snapshotId: string) => {
        const isExpanding = expandedSnapshotId !== snapshotId;
        setExpandedSnapshotId(isExpanding ? snapshotId : null);
        
        if (isExpanding && onLoadStats) {
            const snapshot = snapshots.find(s => s.id === snapshotId);
            if (snapshot && !snapshot.size && !snapshot.fileCount) {
                setLoadingStatsIds(prev => new Set(prev).add(snapshotId));
                onLoadStats(snapshotId);
            }
        }
    };

    React.useEffect(() => {
        setLoadingStatsIds(prev => {
            const updated = new Set(prev);
            let changed = false;
            prev.forEach(id => {
                const snapshot = snapshots.find(s => s.id === id);
                if (snapshot && (snapshot.size || snapshot.fileCount)) {
                    updated.delete(id);
                    changed = true;
                }
            });
            return changed ? updated : prev;
        });
    }, [snapshots]);

    const containerStyle: React.CSSProperties = {
        overflowY: 'auto',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '0',
        paddingBottom: '40px',
        position: 'relative'
    };

    const timelineContainerStyle: React.CSSProperties = {
        maxWidth: '896px',
        width: '100%',
        paddingLeft: '24px',
        paddingRight: '24px',
        position: 'relative'
    };

    const emptyStateStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-text-secondary)',
        fontSize: '14px'
    };

    if (loading) {
        return (
            <div style={emptyStateStyle}>
                <div>Loading snapshots...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={emptyStateStyle}>
                <div style={{ color: '#ef4444', marginBottom: '8px' }}>Error loading snapshots</div>
                <div style={{ fontSize: '12px' }}>{error}</div>
            </div>
        );
    }

    if (snapshots.length === 0) {
        return (
            <div style={emptyStateStyle}>
                <div>No snapshots available for this repository</div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            <div style={timelineContainerStyle}>
                {groupedSnapshots.map((group, groupIndex) => (
                    <div key={group.date} style={{ position: 'relative' }}>
                        <div
                            style={{
                                position: 'sticky',
                                top: 0,
                                fontSize: '14px',
                                fontWeight: 600,
                                color: 'var(--color-text-primary)',
                                marginBottom: '16px',
                                paddingTop: '16px',
                                paddingBottom: '12px',
                                marginTop: '0',
                                borderBottom: '1px solid var(--color-border)',
                                backgroundColor: 'var(--color-bg-white)',
                                zIndex: 100,
                                boxShadow: '0 1px 0 0 var(--color-bg-white)'
                            }}
                        >
                            {group.date}
                        </div>

                        {group.snapshots.map((snapshot, index) => {
                            const isLatest = groupIndex === 0 && index === 0;
                            const isExpanded = expandedSnapshotId === snapshot.id;

                            return (
                                <div
                                    key={snapshot.id}
                                    style={{
                                        marginBottom: index === group.snapshots.length - 1 ? '40px' : '24px',
                                        position: 'relative',
                                        zIndex: 1
                                    }}
                                >
                                    <div
                                        style={{
                                            border: `${isExpanded ? '2px' : '1px'} solid var(--color-border)`,
                                            borderRadius: '8px',
                                            backgroundColor: 'var(--color-bg-white)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            overflow: 'hidden',
                                            position: 'relative',
                                            zIndex: 0
                                        }}
                                        onClick={() => handleToggle(snapshot.id)}
                                        onMouseEnter={(e) => {
                                            if (!isExpanded) {
                                                e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--color-bg-white)';
                                        }}
                                    >
                                        <div
                                            style={{
                                                padding: '16px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span
                                                    style={{
                                                        fontSize: '18px',
                                                        fontWeight: 600,
                                                        color: 'var(--color-text-primary)'
                                                    }}
                                                >
                                                    {formatTime(snapshot.time)}
                                                </span>
                                                {isLatest && (
                                                    <span
                                                        style={{
                                                            border: '1px solid var(--color-border)',
                                                            borderRadius: '9999px',
                                                            padding: '2px 8px',
                                                            fontSize: '12px',
                                                            fontWeight: 500,
                                                            color: 'var(--color-text-primary)'
                                                        }}
                                                    >
                                                        LATEST
                                                    </span>
                                                )}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: '20px',
                                                    transition: 'transform 0.15s ease',
                                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                                                }}
                                            >
                                                ›
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div>
                                                <div
                                                    style={{
                                                        borderTop: '1px solid var(--color-border)',
                                                        margin: '0 16px'
                                                    }}
                                                />

                                                <div
                                                    style={{
                                                        padding: '16px',
                                                        display: 'grid',
                                                        gridTemplateColumns: 'repeat(3, 1fr)',
                                                        gap: '16px'
                                                    }}
                                                >
                                                    <div>
                                                        <div
                                                            style={{
                                                                fontSize: '12px',
                                                                color: 'var(--color-text-secondary)',
                                                                marginBottom: '4px'
                                                            }}
                                                        >
                                                            Snapshot ID
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontFamily: 'monospace',
                                                                fontSize: '14px',
                                                                color: 'var(--color-text-primary)'
                                                            }}
                                                        >
                                                            {truncateId(snapshot.id, snapshot.short_id)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div
                                                            style={{
                                                                fontSize: '12px',
                                                                color: 'var(--color-text-secondary)',
                                                                marginBottom: '4px'
                                                            }}
                                                        >
                                                            Size
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: '14px',
                                                                color: 'var(--color-text-primary)',
                                                                fontWeight: 500
                                                            }}
                                                        >
                                                            {loadingStatsIds.has(snapshot.id) ? 'Loading...' : (snapshot.size || '—')}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div
                                                            style={{
                                                                fontSize: '12px',
                                                                color: 'var(--color-text-secondary)',
                                                                marginBottom: '4px'
                                                            }}
                                                        >
                                                            Files
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: '14px',
                                                                color: 'var(--color-text-primary)',
                                                                fontWeight: 500
                                                            }}
                                                        >
                                                            {loadingStatsIds.has(snapshot.id) ? 'Loading...' : (snapshot.fileCount
                                                                ? snapshot.fileCount.toLocaleString()
                                                                : '—')}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div
                                                    style={{
                                                        padding: '0 16px 16px 16px'
                                                    }}
                                                >
                                                    <button
                                                        style={{
                                                            width: '100%',
                                                            padding: '12px',
                                                            border: '2px solid var(--color-border)',
                                                            borderRadius: '8px',
                                                            backgroundColor: 'var(--color-bg-white)',
                                                            fontSize: '14px',
                                                            fontWeight: 600,
                                                            color: 'var(--color-text-primary)',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onBrowse(snapshot);
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'var(--color-bg-white)';
                                                        }}
                                                    >
                                                        Browse + Restore Snapshot
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

