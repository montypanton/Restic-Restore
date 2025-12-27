import { useState, useMemo, useEffect } from 'react';
import { SnapshotWithStats } from '../types';
import { formatSnapshotId } from '../utils/formatters';
import { formatShortDate, formatTime } from '../utils/dateFormatters';
import styles from './TimelineView.module.css';

interface TimelineViewProps {
    snapshots: SnapshotWithStats[];
    onBrowse: (snapshot: SnapshotWithStats) => void;
    onLoadStats?: (snapshotId: string) => void;
    loading?: boolean;
    error?: string;
}

export function TimelineView({
    snapshots,
    onBrowse,
    onLoadStats,
    loading,
    error
}: TimelineViewProps) {
    const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
    const [loadingStatsIds, setLoadingStatsIds] = useState<Set<string>>(new Set());

    const sortedSnapshots = useMemo(() => {
        return [...snapshots].sort((a, b) => {
            return new Date(b.time).getTime() - new Date(a.time).getTime();
        });
    }, [snapshots]);

    const groupedSnapshots = useMemo(() => {
        const groups: { date: string; snapshots: SnapshotWithStats[] }[] = [];
        let currentDate = '';

        sortedSnapshots.forEach((snapshot) => {
            const date = formatShortDate(snapshot.time);
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

    useEffect(() => {
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

    if (loading) {
        return (
            <div className={styles.emptyState}>
                <div>Loading snapshots...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorState}>
                <div className={styles.errorTitle}>Error loading snapshots</div>
                <div className={styles.errorMessage}>{error}</div>
            </div>
        );
    }

    if (snapshots.length === 0) {
        return (
            <div className={styles.emptyState}>
                <div>No snapshots available for this repository</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.timelineContainer}>
                {groupedSnapshots.map((group, groupIndex) => (
                    <div key={group.date} className={styles.dateGroup}>
                        <div className={styles.dateHeader}>
                            {group.date}
                        </div>

                        {group.snapshots.map((snapshot, index) => {
                            const isLatest = groupIndex === 0 && index === 0;
                            const isExpanded = expandedSnapshotId === snapshot.id;

                            return (
                                <div
                                    key={snapshot.id}
                                    className={styles.snapshotWrapper}
                                >
                                    <div
                                        className={`${styles.snapshotCard} ${isExpanded ? styles.expanded : ''}`}
                                        onClick={() => handleToggle(snapshot.id)}
                                    >
                                        <div className={styles.snapshotHeader}>
                                            <div className={styles.snapshotHeaderLeft}>
                                                <span className={styles.snapshotTime}>
                                                    {formatTime(snapshot.time)}
                                                </span>
                                                {isLatest && (
                                                    <span className={styles.latestBadge}>
                                                        LATEST
                                                    </span>
                                                )}
                                            </div>
                                            <div className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
                                                ›
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div>
                                                <div className={styles.detailsSection} />

                                                <div className={styles.detailsGrid}>
                                                    <div className={styles.detailItem}>
                                                        <div className={styles.detailLabel}>
                                                            Snapshot ID
                                                        </div>
                                                        <div className={`${styles.detailValue} ${styles.mono}`}>
                                                            {formatSnapshotId(snapshot.id, snapshot.short_id)}
                                                        </div>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <div className={styles.detailLabel}>
                                                            Snapshot Size
                                                        </div>
                                                        <div className={styles.detailValue}>
                                                            {loadingStatsIds.has(snapshot.id) ? 'Loading...' : (snapshot.size || '—')}
                                                        </div>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <div className={styles.detailLabel}>
                                                            Files
                                                        </div>
                                                        <div className={styles.detailValue}>
                                                            {loadingStatsIds.has(snapshot.id) ? 'Loading...' : (snapshot.fileCount
                                                                ? snapshot.fileCount.toLocaleString()
                                                                : '—')}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={styles.browseButtonWrapper}>
                                                    <button
                                                        className={styles.browseButton}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onBrowse(snapshot);
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
}

