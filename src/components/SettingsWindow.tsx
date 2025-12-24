import { useState } from 'react';
import { Repository } from '../types';
import styles from './SettingsWindow.module.css';

interface SettingsWindowProps {
    repository: Repository;
    onClose: () => void;
    onRemove: () => void;
}

export function SettingsWindow({
    repository,
    onClose,
    onRemove
}: SettingsWindowProps) {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.window} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Repository Settings</h2>
                    <button
                        className={styles.closeButton}
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Repository Information</div>

                    <div className={styles.infoRow}>
                        <div className={styles.label}>Name</div>
                        <div className={styles.value}>{repository.name}</div>
                    </div>

                    <div className={styles.infoRow}>
                        <div className={styles.label}>Repository ID</div>
                        <div className={styles.value}>{repository.id}</div>
                    </div>

                    <div className={styles.infoRow}>
                        <div className={styles.label}>Location</div>
                        <div className={styles.value}>{repository.path}</div>
                    </div>

                    <div className={styles.infoRow}>
                        <div className={styles.label}>Password</div>
                        <div className={styles.passwordContainer}>
                            <div className={`${styles.passwordValue} ${showPassword ? styles.visible : styles.hidden}`}>
                                {showPassword
                                    ? (repository.password || '(no password)')
                                    : (repository.password ? '•'.repeat(repository.password.length) : '(no password)')
                                }
                            </div>
                            <button
                                className={styles.toggleButton}
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Statistics</div>

                    <div className={styles.infoRow}>
                        <div className={styles.label}>Total Snapshots</div>
                        <div className={styles.value}>
                            {repository.snapshotCount !== undefined ? repository.snapshotCount : 'N/A'}
                        </div>
                    </div>

                    <div className={styles.infoRow}>
                        <div className={styles.label}>Repository Size on Disk</div>
                        <div className={styles.value}>
                            {repository.totalSize || 'Loading...'}
                        </div>
                    </div>
                </div>

                <div className={styles.divider} />

                <button
                    className={styles.removeButton}
                    onClick={onRemove}
                >
                    Remove Repository
                </button>
            </div>
        </div>
    );
}

