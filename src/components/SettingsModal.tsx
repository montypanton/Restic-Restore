import React, { useState } from 'react';
import { Repository } from '../types';

interface SettingsModalProps {
    repository: Repository;
    onClose: () => void;
    onRemove: () => void;
}

/**
 * Settings modal for viewing repository details and managing repository settings.
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({
    repository,
    onClose,
    onRemove
}) => {
    const [showPassword, setShowPassword] = useState(false);

    const modalOverlayStyle: React.CSSProperties = {
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

    const modalContentStyle: React.CSSProperties = {
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto'
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
    };

    const titleStyle: React.CSSProperties = {
        fontSize: '24px',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
        margin: 0
    };

    const closeButtonStyle: React.CSSProperties = {
        background: 'none',
        border: 'none',
        fontSize: '28px',
        cursor: 'pointer',
        color: 'var(--color-text-primary)',
        padding: '4px 8px',
        borderRadius: '4px',
        transition: 'background-color 0.15s ease'
    };

    const sectionStyle: React.CSSProperties = {
        marginBottom: '24px'
    };

    const sectionTitleStyle: React.CSSProperties = {
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '12px'
    };

    const infoRowStyle: React.CSSProperties = {
        marginBottom: '16px'
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--color-text-secondary)',
        marginBottom: '6px'
    };

    const valueStyle: React.CSSProperties = {
        fontSize: '14px',
        color: 'var(--color-text-primary)',
        padding: '10px 12px',
        backgroundColor: 'var(--color-bg-hover)',
        borderRadius: '6px',
        fontFamily: 'monospace',
        wordBreak: 'break-all'
    };

    const passwordContainerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    };

    const passwordValueStyle: React.CSSProperties = {
        ...valueStyle,
        flex: 1,
        userSelect: showPassword ? 'text' : 'none',
        cursor: showPassword ? 'text' : 'default',
        overflow: showPassword ? 'auto' : 'hidden',
        textOverflow: showPassword ? 'clip' : 'clip',
        whiteSpace: showPassword ? 'normal' : 'nowrap',
        wordBreak: showPassword ? 'break-all' : 'normal'
    };

    const toggleButtonStyle: React.CSSProperties = {
        padding: '8px 12px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap'
    };

    const dividerStyle: React.CSSProperties = {
        height: '1px',
        backgroundColor: 'var(--color-border)',
        margin: '24px 0'
    };

    const removeButtonStyle: React.CSSProperties = {
        width: '100%',
        padding: '14px 24px',
        fontSize: '16px',
        fontWeight: 600,
        backgroundColor: 'white',
        border: '2px solid #ef4444',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        color: '#ef4444'
    };

    return (
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
                <div style={headerStyle}>
                    <h2 style={titleStyle}>Repository Settings</h2>
                    <button
                        style={closeButtonStyle}
                        onClick={onClose}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Repository Information</div>
                    
                    <div style={infoRowStyle}>
                        <div style={labelStyle}>Name</div>
                        <div style={valueStyle}>{repository.name}</div>
                    </div>

                    <div style={infoRowStyle}>
                        <div style={labelStyle}>Repository ID</div>
                        <div style={valueStyle}>{repository.id}</div>
                    </div>

                    <div style={infoRowStyle}>
                        <div style={labelStyle}>Location</div>
                        <div style={valueStyle}>{repository.path}</div>
                    </div>

                    <div style={infoRowStyle}>
                        <div style={labelStyle}>Password</div>
                        <div style={passwordContainerStyle}>
                            <div style={passwordValueStyle}>
                                {showPassword 
                                    ? (repository.password || '(no password)')
                                    : (repository.password ? '•'.repeat(repository.password.length) : '(no password)')
                                }
                            </div>
                            <button
                                style={toggleButtonStyle}
                                onClick={() => setShowPassword(!showPassword)}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'white';
                                }}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </div>
                </div>

                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Statistics</div>
                    
                    <div style={infoRowStyle}>
                        <div style={labelStyle}>Total Snapshots</div>
                        <div style={valueStyle}>
                            {repository.snapshotCount !== undefined ? repository.snapshotCount : 'N/A'}
                        </div>
                    </div>

                    <div style={infoRowStyle}>
                        <div style={labelStyle}>Repository Size on Disk</div>
                        <div style={valueStyle}>
                            {repository.totalSize || 'Loading...'}
                        </div>
                    </div>
                </div>

                <div style={dividerStyle} />

                <button
                    style={removeButtonStyle}
                    onClick={onRemove}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fef2f2';
                        e.currentTarget.style.borderColor = '#dc2626';
                        e.currentTarget.style.color = '#dc2626';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                        e.currentTarget.style.borderColor = '#ef4444';
                        e.currentTarget.style.color = '#ef4444';
                    }}
                >
                    Remove Repository
                </button>
            </div>
        </div>
    );
};

