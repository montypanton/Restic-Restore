import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Snapshot, FileNode } from '../types';

interface FileBrowserProps {
    snapshot: Snapshot;
    repo: string;
    password: string;
    onClose: () => void;
}

interface FileTree {
    [path: string]: FileNode[];
}

interface SelectedItem {
    file: FileNode;
    restorePath: string;
}

/**
 * File browser modal for navigating snapshot contents and selecting files for restore.
 * Loads the entire file tree once on mount for instant navigation.
 */
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

    useEffect(() => {
        loadAllFiles();
    }, []);

    const loadAllFiles = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<FileNode[]>('browse_snapshot_full', {
                repo,
                password,
                snapshotId: snapshot.id,
            });
            setAllFiles(result);
        } catch (err) {
            setError(`Failed to load files: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const fileTree = useMemo<FileTree>(() => {
        const tree: FileTree = {};
        
        allFiles.forEach(file => {
            const filePath = file.path || '';
            const parts = filePath.split('/').filter(p => p);
            
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
            tree[parentPath].push(file);
        });
        
        return tree;
    }, [allFiles]);

    const files = useMemo(() => {
        return fileTree[currentPath] || [];
    }, [fileTree, currentPath]);

    const handleUp = () => {
        if (currentPath === '/') return;
        const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
        setCurrentPath(parent);
    };

    const handleItemClick = (file: FileNode) => {
        if (file.type === 'dir') {
            if (file.path) {
                setCurrentPath(file.path);
            }
        }
    };

    const handleCheckboxChange = (file: FileNode, checked: boolean) => {
        const newSelected = new Map(selectedItems);
        
        if (checked) {
            newSelected.set(file.path, {
                file,
                restorePath: file.path
            });
            
            // Remove redundant child selections since parent directory includes them
            if (file.type === 'dir') {
                const dirPath = file.path.endsWith('/') ? file.path : file.path + '/';
                const keysToRemove: string[] = [];
                newSelected.forEach((_item, path) => {
                    if (path !== file.path && path.startsWith(dirPath)) {
                        keysToRemove.push(path);
                    }
                });
                keysToRemove.forEach(key => newSelected.delete(key));
            }
        } else {
            newSelected.delete(file.path);
            
            // When unchecking a child of a selected directory, replace parent with individual siblings
            const parentSelected = Array.from(newSelected.keys()).find(selectedPath => {
                const selectedItem = newSelected.get(selectedPath);
                if (selectedItem?.file.type === 'dir' && selectedPath !== file.path) {
                    const dirPath = selectedPath.endsWith('/') ? selectedPath : selectedPath + '/';
                    return file.path.startsWith(dirPath);
                }
                return false;
            });
            
            if (parentSelected) {
                newSelected.delete(parentSelected);
                
                const parentDirPath = parentSelected.endsWith('/') ? parentSelected : parentSelected + '/';
                allFiles.forEach(childFile => {
                    if (childFile.path.startsWith(parentDirPath) && 
                        childFile.path !== parentSelected &&
                        childFile.path !== file.path) {
                        const relativePath = childFile.path.substring(parentDirPath.length);
                        const isDirectChild = !relativePath.includes('/') || 
                                            (relativePath.endsWith('/') && relativePath.split('/').filter(p => p).length === 1);
                        
                        if (isDirectChild) {
                            newSelected.set(childFile.path, {
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
        newSelected.delete(filePath);
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
        } catch (err) {}
    };

    const handleRestore = () => {
        if (!restoreAllToPath) {
            setStatusType('error');
            setStatusMessage('Please select a restore destination folder');
            setTimeout(() => setStatusType('idle'), 5000);
            return;
        }

        if (selectedItems.size === 0) {
            setStatusType('error');
            setStatusMessage('No items selected for restore');
            setTimeout(() => setStatusType('idle'), 5000);
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
            
            setTimeout(() => setStatusType('idle'), 10000);
            
        } catch (err) {
            setStatusType('error');
            setStatusMessage(`✗ Restore failed: ${err}`);
            setTimeout(() => setStatusType('idle'), 15000);
        } finally {
            setPendingRestore(null);
        }
    };

    const cancelRestore = () => {
        setShowConfirmRestore(false);
        setPendingRestore(null);
    };

    const pathSegments = currentPath.split('/').filter(s => s);

    const modalStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
    };

    const contentStyle: React.CSSProperties = {
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid black',
        width: '900px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden'
    };

    const headerStyle: React.CSSProperties = {
        padding: '16px'
    };

    const titleRowStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
    };

    const titleStyle: React.CSSProperties = {
        fontSize: '20px',
        fontWeight: 600,
        color: 'black',
        margin: 0
    };

    const closeButtonStyle: React.CSSProperties = {
        background: 'none',
        border: 'none',
        fontSize: '24px',
        cursor: 'pointer',
        color: 'black',
        padding: '4px 8px',
        borderRadius: '4px',
        transition: 'background-color 0.2s'
    };

    const subtitleStyle: React.CSSProperties = {
        fontSize: '14px',
        color: '#666',
        marginBottom: '12px'
    };

    const breadcrumbStyle: React.CSSProperties = {
        backgroundColor: '#f9fafb',
        borderBottom: '1px solid black',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    };

    const navButtonStyle: React.CSSProperties = {
        padding: '6px 12px',
        border: '1px solid black',
        background: 'white',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 500
    };

    const pathDisplayStyle: React.CSSProperties = {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '8px 12px',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid black',
        fontSize: '13px',
        overflow: 'auto',
        whiteSpace: 'nowrap',
        fontFamily: 'monospace'
    };

    const fileListContainerStyle: React.CSSProperties = {
        minHeight: '280px',
        overflow: 'hidden',
        border: '1px solid black',
        borderRadius: '8px',
        margin: '12px',
        backgroundColor: 'white',
        display: 'flex',
        flexDirection: 'column'
    };

    const fileListScrollableStyle: React.CSSProperties = {
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden'
    };

    const fileGridHeaderStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '50px 1fr 250px',
        padding: '12px 16px',
        borderBottom: '1px solid black',
        fontWeight: 600,
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        color: '#666',
        position: 'sticky',
        top: 0,
        backgroundColor: 'white',
        zIndex: 1
    };

    const fileRowStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '50px 1fr 250px',
        padding: '12px 16px',
        alignItems: 'center',
        transition: 'background-color 0.2s',
        cursor: 'default'
    };

    const emptyStateStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        color: '#666',
        fontSize: '14px'
    };

    const restorePanelStyle: React.CSSProperties = {
        borderTop: '2px solid black',
        backgroundColor: 'white',
        display: 'flex',
        flexDirection: 'column'
    };

    const restoreAllToSectionStyle: React.CSSProperties = {
        padding: '12px 16px 16px 16px',
        backgroundColor: 'white'
    };

    const restoreAllToLabelStyle: React.CSSProperties = {
        fontSize: '13px',
        fontWeight: 600,
        marginBottom: '8px',
        display: 'block',
        color: 'black'
    };

    const restoreAllToInputStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid black',
        borderRadius: '8px',
        fontSize: '13px',
        fontFamily: 'monospace',
        backgroundColor: 'white',
        boxSizing: 'border-box'
    };

    const selectedItemsListContainerStyle: React.CSSProperties = {
        minHeight: '150px',
        overflow: 'hidden',
        border: '1px solid black',
        borderRadius: '8px',
        margin: '0 16px 16px 16px',
        backgroundColor: 'white',
        display: 'flex',
        flexDirection: 'column'
    };

    const selectedItemsListStyle: React.CSSProperties = {
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '16px',
        backgroundColor: 'white'
    };

    const selectedItemRowStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 0',
        backgroundColor: 'white'
    };

    const restoreButtonContainerStyle: React.CSSProperties = {
        padding: '16px',
        display: 'flex',
        justifyContent: 'flex-end'
    };

    const statusBarStyle: React.CSSProperties = {
        borderTop: '1px solid black',
        padding: '12px 16px',
        backgroundColor: statusType === 'success' ? '#ecfdf5' : 
                         statusType === 'error' ? '#fef2f2' : 
                         statusType === 'loading' ? '#eff6ff' : 'white',
        display: statusType !== 'idle' ? 'block' : 'none',
        minHeight: '48px'
    };

    const statusBarContentStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '13px',
        color: statusType === 'success' ? '#065f46' : 
               statusType === 'error' ? '#991b1b' : 
               statusType === 'loading' ? '#1e40af' : '#666'
    };

    const confirmModalOverlayStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
    };

    const confirmModalContentStyle: React.CSSProperties = {
        backgroundColor: 'white',
        border: '1px solid black',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '500px',
        width: '90%'
    };

    const confirmModalButtonsStyle: React.CSSProperties = {
        display: 'flex',
        gap: '12px',
        justifyContent: 'flex-end',
        marginTop: '20px'
    };

    const restoreButtonStyle: React.CSSProperties = {
        padding: '12px 32px',
        border: '2px solid black',
        borderRadius: '8px',
        background: 'white',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 600,
        transition: 'background-color 0.2s'
    };

    const contentWrapperStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column'
    };

    return (
        <div style={modalStyle} onClick={onClose}>
            <style>{`
                @keyframes slideProgress {
                    0% {
                        transform: translateX(-100%);
                    }
                    50% {
                        transform: translateX(250%);
                    }
                    100% {
                        transform: translateX(-100%);
                    }
                }
            `}</style>
            <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
                <div style={headerStyle}>
                    <div style={titleRowStyle}>
                        <h3 style={titleStyle}>Browse Snapshot</h3>
                        <button
                            style={closeButtonStyle}
                            onClick={onClose}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            aria-label="Close"
                        >
                            ×
                        </button>
                    </div>

                    <div style={subtitleStyle}>
                        {snapshot.id.substring(0, 8)} • {new Date(snapshot.time).toLocaleString()}
                    </div>
                </div>

                <div style={breadcrumbStyle}>
                    <button
                        style={{
                            ...navButtonStyle,
                            opacity: currentPath === '/' ? 0.3 : 1,
                            cursor: currentPath === '/' ? 'not-allowed' : 'pointer'
                        }}
                        onClick={handleUp}
                        disabled={currentPath === '/'}
                        onMouseEnter={(e) => {
                            if (currentPath !== '/') {
                                e.currentTarget.style.backgroundColor = '#f9fafb';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                        }}
                    >
                        ←
                    </button>

                    <div style={pathDisplayStyle}>
                        <button
                            onClick={() => setCurrentPath('/')}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#666',
                                cursor: 'pointer',
                                padding: '0',
                                fontSize: '13px',
                                fontFamily: 'monospace'
                            }}
                        >
                            ~
                        </button>
                        {pathSegments.map((segment, index) => (
                            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: '#666' }}>/</span>
                                <button
                                    onClick={() => {
                                        const newPath = '/' + pathSegments.slice(0, index + 1).join('/');
                                        setCurrentPath(newPath);
                                    }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'black',
                                        cursor: 'pointer',
                                        padding: '0',
                                        fontSize: '13px',
                                        fontFamily: 'monospace'
                                    }}
                                >
                                    {segment}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={contentWrapperStyle}>
                    <div style={fileListContainerStyle}>
                    <div style={fileGridHeaderStyle}>
                        <div></div>
                        <div>NAME</div>
                        <div>MODIFIED</div>
                    </div>
                    <div style={fileListScrollableStyle}>
                        {loading ? (
                            <div style={emptyStateStyle}>
                                <div style={{ fontSize: '16px', marginBottom: '16px', fontWeight: 500 }}>
                                    Loading snapshot files...
                                </div>
                                <div style={{
                                    width: '300px',
                                    height: '8px',
                                    backgroundColor: '#e5e7eb',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    position: 'relative'
                                }}>
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        height: '100%',
                                        width: '40%',
                                        backgroundColor: '#3b82f6',
                                        borderRadius: '4px',
                                        animation: 'slideProgress 1.5s ease-in-out infinite'
                                    }} />
                                </div>
                                <div style={{ fontSize: '12px', color: '#666', marginTop: '12px' }}>
                                    This may take a moment for large snapshots
                                </div>
                            </div>
                        ) : error ? (
                            <div style={emptyStateStyle}>
                                <div style={{ color: '#ef4444', marginBottom: '8px' }}>Error loading files</div>
                                <div style={{ fontSize: '12px' }}>{error}</div>
                            </div>
                        ) : files.length === 0 ? (
                            <div style={emptyStateStyle}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: '12px' }}>
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                </svg>
                                <div>This directory is empty</div>
                            </div>
                        ) : (
                            <>
                                {files.map((file, idx, array) => {
                                    const isDirectlySelected = selectedItems.has(file.path);
                                    
                                    const hasParentSelected = Array.from(selectedItems.keys()).some(selectedPath => {
                                        const selectedItem = selectedItems.get(selectedPath);
                                        if (selectedItem?.file.type === 'dir' && selectedPath !== file.path) {
                                            const dirPath = selectedPath.endsWith('/') ? selectedPath : selectedPath + '/';
                                            return file.path.startsWith(dirPath);
                                        }
                                        return false;
                                    });
                                    
                                    const isSelected = isDirectlySelected || hasParentSelected;
                                    
                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                ...fileRowStyle,
                                                borderBottom: idx === array.length - 1 ? 'none' : '1px solid #e5e7eb'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = '#f9fafb';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = 'white';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: '8px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        handleCheckboxChange(file, e.target.checked);
                                                    }}
                                                    style={{ 
                                                        width: '18px', 
                                                        height: '18px', 
                                                        cursor: 'pointer'
                                                    }}
                                                />
                                            </div>
                                            <div
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: file.type === 'dir' ? 'pointer' : 'default' }}
                                                onClick={() => handleItemClick(file)}
                                            >
                                                {file.type === 'dir' ? (
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                                    </svg>
                                                ) : (
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                                        <polyline points="13 2 13 9 20 9"></polyline>
                                                    </svg>
                                                )}
                                                <span style={{ fontSize: '14px', color: 'black' }}>{file.name}</span>
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#666' }}>
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
                    <div style={{ padding: '0 12px 8px 12px', fontSize: '12px', color: '#666' }}>
                        {files.length} {files.length === 1 ? 'item' : 'items'}
                    </div>
                )}

                {selectedItems.size > 0 && (
                    <div style={restorePanelStyle}>
                        <div style={{ padding: '16px 16px 8px 16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'black' }}>
                                Restore Selected ({selectedItems.size})
                            </h3>
                        </div>

                        <div style={restoreAllToSectionStyle}>
                            <label style={restoreAllToLabelStyle}>
                                Restore To:
                            </label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={restoreAllToPath}
                                    readOnly
                                    style={{ 
                                        ...restoreAllToInputStyle, 
                                        flex: 1,
                                        backgroundColor: '#f9fafb',
                                        cursor: 'pointer'
                                    }}
                                    placeholder="Click Browse to select destination folder..."
                                    onClick={handleBrowseRestorePath}
                                />
                                <button
                                    onClick={handleBrowseRestorePath}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: 'white',
                                        border: '1px solid black',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                >
                                    Browse...
                                </button>
                            </div>
                        </div>

                        <div style={selectedItemsListContainerStyle}>
                            <div style={selectedItemsListStyle}>
                                {Array.from(selectedItems.values()).map((item, idx, array) => (
                                    <div 
                                        key={idx} 
                                        style={{
                                            ...selectedItemRowStyle,
                                            borderBottom: idx === array.length - 1 ? 'none' : '1px solid #e5e7eb'
                                        }}
                                    >
                                        {item.file.type === 'dir' ? (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                            </svg>
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                                <polyline points="13 2 13 9 20 9"></polyline>
                                            </svg>
                                        )}
                                        <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '120px', flex: '0 0 auto' }}>
                                            {item.file.name}
                                        </span>
                                        <span style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace', flex: '1' }}>
                                            {item.file.path}
                                        </span>
                                        <button
                                            onClick={() => handleRemoveFromSelection(item.file.path)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                fontSize: '20px',
                                                cursor: 'pointer',
                                                padding: '0 8px',
                                                color: 'black',
                                                flex: '0 0 auto'
                                            }}
                                            title="Remove from selection"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={restoreButtonContainerStyle}>
                            <button
                                style={restoreButtonStyle}
                                onClick={handleRestore}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                Restore {selectedItems.size} Item{selectedItems.size !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                )}

                <div style={statusBarStyle}>
                    <div style={statusBarContentStyle}>
                        {statusType === 'loading' && (
                            <>
                                <div style={{
                                    width: '200px',
                                    height: '4px',
                                    backgroundColor: '#dbeafe',
                                    borderRadius: '2px',
                                    overflow: 'hidden',
                                    position: 'relative'
                                }}>
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        height: '100%',
                                        width: '40%',
                                        backgroundColor: '#3b82f6',
                                        borderRadius: '2px',
                                        animation: 'slideProgress 1.5s ease-in-out infinite'
                                    }} />
                                </div>
                                <span>{statusMessage}</span>
                            </>
                        )}
                        {statusType === 'success' && (
                            <span style={{ fontWeight: 500 }}>{statusMessage}</span>
                        )}
                        {statusType === 'error' && (
                            <span style={{ fontWeight: 500 }}>{statusMessage}</span>
                        )}
                    </div>
                </div>
                </div>

                {showConfirmRestore && pendingRestore && (
                    <div style={confirmModalOverlayStyle}>
                        <div style={confirmModalContentStyle}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>
                                Confirm Restore
                            </h3>
                            <div style={{ fontSize: '14px', marginBottom: '12px', color: '#333' }}>
                                <p style={{ margin: '8px 0' }}>
                                    Restore <strong>{pendingRestore.count} item{pendingRestore.count !== 1 ? 's' : ''}</strong> to:
                                </p>
                                <p style={{ 
                                    margin: '8px 0', 
                                    padding: '8px 12px', 
                                    backgroundColor: '#f9fafb', 
                                    borderRadius: '4px',
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    wordBreak: 'break-all'
                                }}>
                                    {pendingRestore.path}
                                </p>
                                <p style={{ margin: '8px 0', fontSize: '12px', color: '#666' }}>
                                    Files will be restored with their original directory structure inside a new subfolder.
                                </p>
                            </div>
                            <div style={confirmModalButtonsStyle}>
                                <button
                                    onClick={cancelRestore}
                                    style={{
                                        padding: '8px 20px',
                                        backgroundColor: 'white',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={executeRestore}
                                    style={{
                                        padding: '8px 20px',
                                        backgroundColor: '#3b82f6',
                                        color: 'white',
                                        border: '1px solid #2563eb',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: 500
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
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
