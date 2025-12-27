import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Snapshot, FileNode } from '../types';
import { FolderIcon, FileIcon, EmptyFolderIcon } from './Icons';
import { formatSnapshotId } from '../utils/formatters';
import { TIMING } from '../config/constants';
import styles from './FileBrowser.module.css';

interface FileBrowserProps {
    snapshot: Snapshot;
    repo: string;
    password: string;
    onClose: () => void;
}

interface FileTree {
    [path: string]: FileNode[];
}

interface FileNodeWithNormalized extends FileNode {
    normalizedPath: string;
}

interface SelectedItem {
    file: FileNode;
    restorePath: string;
}

export function FileBrowser({ snapshot, repo, password, onClose }: FileBrowserProps) {
    const [allFiles, setAllFiles] = useState<FileNode[]>([]);
    const [currentPath, setCurrentPath] = useState<string>('/');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
    const [restoreAllToPath, setRestoreAllToPath] = useState('');
    
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [statusType, setStatusType] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [showConfirmRestore, setShowConfirmRestore] = useState(false);
    const [pendingRestore, setPendingRestore] = useState<{path: string, paths: string[], count: number} | null>(null);

    const loadAllFiles = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<FileNode[]>('browse_snapshot', {
                repo,
                password,
                snapshotId: snapshot.id,
                path: null,
            });
            setAllFiles(result);
        } catch (err) {
            setError(`Failed to load files: ${err}`);
        } finally {
            setLoading(false);
        }
    }, [repo, password, snapshot.id]);

    useEffect(() => {
        loadAllFiles();
    }, [loadAllFiles]);

    // Normalize paths to use forward slashes
    const normalizePath = (path: string): string => {
        return path.replace(/\\/g, '/');
    };

    const fileTree = useMemo<FileTree>(() => {
        const tree: FileTree = {};

        allFiles.forEach(file => {
            const filePath = normalizePath(file.path || '');
            const parts = filePath.split(/[/\\]/).filter(p => p);

            let parentPath: string;
            if (parts.length === 0) {
                return;
            } else if (parts.length === 1) {
                parentPath = '/';
            } else {
                parentPath = '/' + parts.slice(0, -1).join('/');
            }

            if (!tree[parentPath]) {
                tree[parentPath] = [];
            }

            const fileWithNormalized: FileNodeWithNormalized = {
                ...file,
                normalizedPath: filePath
            };
            tree[parentPath].push(fileWithNormalized as FileNode);
        });

        return tree;
    }, [allFiles]);

    const files = useMemo(() => {
        return fileTree[currentPath] || [];
    }, [fileTree, currentPath]);

    const handleUp = () => {
        if (currentPath === '/') return;
        const parent = normalizePath(currentPath).split('/').slice(0, -1).join('/') || '/';
        setCurrentPath(parent);
    };

    const handleItemClick = (file: FileNode) => {
        if (file.type === 'dir') {
            if (file.path) {
                setCurrentPath(normalizePath(file.path));
            }
        }
    };

    const handleCheckboxChange = (file: FileNode, checked: boolean) => {
        const newSelected = new Map(selectedItems);
        const normalizedFilePath = normalizePath(file.path);

        if (checked) {
            newSelected.set(normalizedFilePath, {
                file,
                restorePath: file.path
            });

            // Remove children when parent is selected
            if (file.type === 'dir') {
                const dirPath = normalizedFilePath.endsWith('/') ? normalizedFilePath : normalizedFilePath + '/';
                const keysToRemove: string[] = [];
                newSelected.forEach((_item, path) => {
                    if (path !== normalizedFilePath && path.startsWith(dirPath)) {
                        keysToRemove.push(path);
                    }
                });
                keysToRemove.forEach(key => newSelected.delete(key));
            }
        } else {
            newSelected.delete(normalizedFilePath);

            // Uncheck child: remove parent, add siblings
            const parentSelected = Array.from(newSelected.keys()).find(selectedPath => {
                const selectedItem = newSelected.get(selectedPath);
                if (selectedItem?.file.type === 'dir' && selectedPath !== normalizedFilePath) {
                    const dirPath = selectedPath.endsWith('/') ? selectedPath : selectedPath + '/';
                    return normalizedFilePath.startsWith(dirPath);
                }
                return false;
            });

            if (parentSelected) {
                newSelected.delete(parentSelected);

                const parentDirPath = parentSelected.endsWith('/') ? parentSelected : parentSelected + '/';
                allFiles.forEach(childFile => {
                    const normalizedChildPath = normalizePath(childFile.path);
                    if (normalizedChildPath.startsWith(parentDirPath) &&
                        normalizedChildPath !== parentSelected &&
                        normalizedChildPath !== normalizedFilePath) {
                        const relativePath = normalizedChildPath.substring(parentDirPath.length);
                        const isDirectChild = !relativePath.includes('/') ||
                                            (relativePath.endsWith('/') && relativePath.split('/').filter(p => p).length === 1);

                        if (isDirectChild) {
                            newSelected.set(normalizedChildPath, {
                                file: childFile,
                                restorePath: childFile.path
                            });
                        }
                    }
                });
            }
        }

        setSelectedItems(newSelected);
    };

    const handleRemoveFromSelection = (filePath: string) => {
        const newSelected = new Map(selectedItems);
        newSelected.delete(normalizePath(filePath));
        setSelectedItems(newSelected);
    };

    const handleBrowseRestorePath = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: 'Select Restore Destination',
            });
            if (selected && typeof selected === 'string') {
                setRestoreAllToPath(selected);
            }
        } catch (err) {
            console.error('Failed to open directory picker:', err);
            setStatusType('error');
            setStatusMessage('Failed to open directory picker');
            setTimeout(() => setStatusType('idle'), TIMING.INFO_MESSAGE_DURATION_MS);
        }
    };

    const handleRestore = () => {
        if (!restoreAllToPath) {
            setStatusType('error');
            setStatusMessage('Please select a restore destination folder');
            setTimeout(() => setStatusType('idle'), TIMING.WARNING_MESSAGE_DURATION_MS);
            return;
        }

        if (selectedItems.size === 0) {
            setStatusType('error');
            setStatusMessage('No items selected for restore');
            setTimeout(() => setStatusType('idle'), TIMING.WARNING_MESSAGE_DURATION_MS);
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const restoreSubdir = `restore_${timestamp}`;
        const separator = restoreAllToPath.includes('\\') ? '\\' : '/';
        const fullRestorePath = `${restoreAllToPath}${restoreAllToPath.endsWith('\\') || restoreAllToPath.endsWith('/') ? '' : separator}${restoreSubdir}`;

        const itemCount = selectedItems.size;
        const includePaths = Array.from(selectedItems.values()).map(item => item.file.path);
        
        setPendingRestore({ path: fullRestorePath, paths: includePaths, count: itemCount });
        setShowConfirmRestore(true);
    };

    const executeRestore = async () => {
        if (!pendingRestore) return;
        
        setShowConfirmRestore(false);
        setStatusType('loading');
        setStatusMessage(`Restoring ${pendingRestore.count} item${pendingRestore.count !== 1 ? 's' : ''}...`);

        try {
            await invoke<string>('restore_selective', {
                repo,
                password,
                snapshotId: snapshot.id,
                target: pendingRestore.path,
                includePaths: pendingRestore.paths,
            });

            setStatusType('success');
            const itemText = pendingRestore.count === 1 ? 'item' : 'items';
            const pathParts = pendingRestore.path.split(/[/\\]/);
            const folderName = pathParts[pathParts.length - 1] || 'restore folder';
            setStatusMessage(`✓ Successfully restored ${pendingRestore.count} ${itemText} to "${folderName}"`);

            setSelectedItems(new Map());

            setTimeout(() => setStatusType('idle'), TIMING.SUCCESS_MESSAGE_DURATION_MS);
            
        } catch (err) {
            setStatusType('error');
            setStatusMessage(`✗ Restore failed: ${err}`);
            setTimeout(() => setStatusType('idle'), TIMING.ERROR_MESSAGE_DURATION_MS);
        } finally {
            setPendingRestore(null);
        }
    };

    const cancelRestore = () => {
        setShowConfirmRestore(false);
        setPendingRestore(null);
    };

    const pathSegments = useMemo(() =>
        normalizePath(currentPath).split('/').filter(s => s),
        [currentPath]
    );

    return (
        <div className="window-overlay" onClick={onClose}>
            <div className={styles.content} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.titleRow}>
                        <h3 className={styles.title}>Browse Snapshot</h3>
                        <button
                            className={styles.closeButton}
                            onClick={onClose}
                            aria-label="Close"
                        >
                            ×
                        </button>
                    </div>

                    <div className={styles.subtitle}>
                        {formatSnapshotId(snapshot.id, snapshot.short_id)} • {new Date(snapshot.time).toLocaleString()}
                    </div>
                </div>

                <div className={styles.breadcrumb}>
                    <button
                        className={styles.navButton}
                        onClick={handleUp}
                        disabled={currentPath === '/'}
                    >
                        ←
                    </button>

                    <div className={styles.pathDisplay}>
                        <button
                            onClick={() => setCurrentPath('/')}
                            className={`${styles.pathButton} ${styles.root}`}
                        >
                            ~
                        </button>
                        {pathSegments.map((segment, index) => (
                            <div key={index} className={styles.pathSegment}>
                                <span className={styles.pathSeparator}>/</span>
                                <button
                                    onClick={() => {
                                        const newPath = '/' + pathSegments.slice(0, index + 1).join('/');
                                        setCurrentPath(newPath);
                                    }}
                                    className={styles.pathButton}
                                >
                                    {segment}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={styles.contentWrapper}>
                    <div className={styles.fileListContainer}>
                    <div className={styles.fileGridHeader}>
                        <div></div>
                        <div>NAME</div>
                        <div>MODIFIED</div>
                    </div>
                    <div className={styles.fileListScrollable}>
                        {loading ? (
                            <div className={styles.emptyState}>
                                <div className={styles.loadingTitle}>
                                    Loading snapshot files...
                                </div>
                                <div className={styles.loadingBar}>
                                    <div className={styles.loadingProgress} />
                                </div>
                                <div className={styles.loadingHint}>
                                    This may take a moment for large snapshots
                                </div>
                            </div>
                        ) : error ? (
                            <div className={styles.emptyState}>
                                <div className={styles.errorText}>Error loading files</div>
                                <div className={styles.errorDetails}>{error}</div>
                            </div>
                        ) : files.length === 0 ? (
                            <div className={styles.emptyState}>
                                <EmptyFolderIcon />
                                <div>This directory is empty</div>
                            </div>
                        ) : (
                            <>
                                {files.map((file, idx) => {
                                    const normalizedFilePath = (file as FileNodeWithNormalized).normalizedPath || normalizePath(file.path);
                                    const isDirectlySelected = selectedItems.has(normalizedFilePath);

                                    const hasParentSelected = Array.from(selectedItems.keys()).some(selectedPath => {
                                        const selectedItem = selectedItems.get(selectedPath);
                                        if (selectedItem?.file.type === 'dir' && selectedPath !== normalizedFilePath) {
                                            const dirPath = selectedPath.endsWith('/') ? selectedPath : selectedPath + '/';
                                            return normalizedFilePath.startsWith(dirPath);
                                        }
                                        return false;
                                    });

                                    const isSelected = isDirectlySelected || hasParentSelected;
                                    
                                    return (
                                        <div
                                            key={idx}
                                            className={styles.fileRow}
                                        >
                                            <div className={styles.fileCheckbox}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        handleCheckboxChange(file, e.target.checked);
                                                    }}
                                                />
                                            </div>
                                            <div
                                                className={`${styles.fileName} ${file.type === 'dir' ? styles.clickable : ''}`}
                                                onClick={() => handleItemClick(file)}
                                            >
                                                {file.type === 'dir' ? <FolderIcon /> : <FileIcon />}
                                                <span>{file.name}</span>
                                            </div>
                                            <div className={styles.fileDate}>
                                                {file.mtime ? new Date(file.mtime).toLocaleString() : '—'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>

                {!loading && !error && (
                    <div className={styles.itemCount}>
                        {files.length} {files.length === 1 ? 'item' : 'items'}
                    </div>
                )}

                {selectedItems.size > 0 && (
                    <div className={styles.restorePanel}>
                        <div className={styles.restorePanelHeader}>
                            <h3 className={styles.restorePanelTitle}>
                                Restore Selected ({selectedItems.size})
                            </h3>
                        </div>

                        <div className={styles.restoreToSection}>
                            <label className={styles.restoreToLabel}>
                                Restore To:
                            </label>
                            <div className={styles.restoreToInputWrapper}>
                                <input
                                    type="text"
                                    value={restoreAllToPath}
                                    readOnly
                                    className={styles.restoreToInput}
                                    placeholder="Click Browse to select destination folder..."
                                    onClick={handleBrowseRestorePath}
                                />
                                <button
                                    onClick={handleBrowseRestorePath}
                                    className={styles.browseButton}
                                >
                                    Browse...
                                </button>
                            </div>
                        </div>

                        <div className={styles.selectedItemsContainer}>
                            <div className={styles.selectedItemsList}>
                                {Array.from(selectedItems.values()).map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={styles.selectedItemRow}
                                    >
                                        {item.file.type === 'dir' ? <FolderIcon /> : <FileIcon />}
                                        <span className={styles.selectedItemName}>
                                            {item.file.name}
                                        </span>
                                        <span className={styles.selectedItemPath}>
                                            {item.file.path}
                                        </span>
                                        <button
                                            onClick={() => handleRemoveFromSelection(item.file.path)}
                                            className={styles.removeButton}
                                            title="Remove from selection"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.restoreButtonContainer}>
                            <button
                                className={styles.restoreButton}
                                onClick={handleRestore}
                            >
                                Restore {selectedItems.size} Item{selectedItems.size !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                )}

                <div className={`${styles.statusBar} ${styles[statusType]}`}>
                    <div className={`${styles.statusContent} ${styles[statusType]}`}>
                        {statusType === 'loading' && (
                            <>
                                <div className={styles.statusProgressBar}>
                                    <div className={styles.statusProgress} />
                                </div>
                                <span>{statusMessage}</span>
                            </>
                        )}
                        {statusType === 'success' && (
                            <span className={styles.statusText}>{statusMessage}</span>
                        )}
                        {statusType === 'error' && (
                            <span className={styles.statusText}>{statusMessage}</span>
                        )}
                    </div>
                </div>
                </div>

                {showConfirmRestore && pendingRestore && (
                    <div className={styles.confirmOverlay}>
                        <div className={styles.confirmContent}>
                            <h3 className={styles.confirmTitle}>
                                Confirm Restore
                            </h3>
                            <div className={styles.confirmBody}>
                                <p>
                                    Restore <strong>{pendingRestore.count} item{pendingRestore.count !== 1 ? 's' : ''}</strong> to:
                                </p>
                                <p className={styles.confirmPath}>
                                    {pendingRestore.path}
                                </p>
                                <p className={styles.confirmHint}>
                                    Files will be restored with their original directory structure inside a new subfolder.
                                </p>
                            </div>
                            <div className={styles.confirmButtons}>
                                <button
                                    onClick={cancelRestore}
                                    className={styles.confirmCancel}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={executeRestore}
                                    className={styles.confirmRestore}
                                >
                                    Restore
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
