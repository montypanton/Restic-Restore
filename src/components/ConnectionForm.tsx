import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ConnectionFormProps {
    onConnect: (repo: string, password: string) => void;
}

/**
 * Form for adding a new Restic repository connection.
 * Validates connection before adding to saved repositories.
 */
export function ConnectionForm({ onConnect }: ConnectionFormProps) {
    const [repo, setRepo] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<{repo?: string; password?: string}>({});

    const validateForm = (): boolean => {
        const errors: {repo?: string; password?: string} = {};
        
        if (!repo.trim()) {
            errors.repo = 'Repository path is required';
        } else if (repo.trim().length < 3) {
            errors.repo = 'Repository path is too short';
        } else {
            const isLocalPath = /^[a-zA-Z]:[\\\/]/.test(repo) || /^[\/~]/.test(repo);
            const isRemoteUrl = /^(sftp|rest|s3|b2|azure|gs|rclone):/.test(repo);
            
            if (!isLocalPath && !isRemoteUrl) {
                errors.repo = 'Must be a valid local path (e.g., C:\\backup) or remote URL (e.g., sftp:user@host:/path)';
            }
        }
        
        if (!password) {
            errors.password = 'Password is required';
        } else if (password.length < 1) {
            errors.password = 'Password cannot be empty';
        }
        
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (!validateForm()) {
            return;
        }
        
        setLoading(true);

        try {
            await invoke('connect_repository', { repo, password });
            onConnect(repo, password);
        } catch (err) {
            setError(`Connection failed: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const titleStyle: React.CSSProperties = {
        fontSize: '20px',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
        marginBottom: '20px'
    };

    const formGroupStyle: React.CSSProperties = {
        marginBottom: '20px'
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--color-text-primary)',
        marginBottom: '8px'
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 12px',
        fontSize: '14px',
        border: '1px solid var(--color-border-light)',
        borderRadius: '8px',
        outline: 'none',
        transition: 'border-color 0.2s ease',
        fontFamily: 'var(--font-family)'
    };

    const buttonStyle: React.CSSProperties = {
        width: '100%',
        padding: '12px',
        fontSize: '14px',
        fontWeight: 500,
        backgroundColor: 'var(--color-primary-blue)',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
    };

    const errorStyle: React.CSSProperties = {
        padding: '12px',
        backgroundColor: '#fff5f5',
        border: '1px solid #feb2b2',
        borderRadius: '8px',
        color: '#c53030',
        fontSize: '13px',
        marginBottom: '16px'
    };

    const hintStyle: React.CSSProperties = {
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
        marginTop: '6px'
    };

    return (
        <div>
            <h2 style={titleStyle}>Add Repository</h2>
            <form onSubmit={handleSubmit}>
                <div style={formGroupStyle}>
                    <label htmlFor="repo" style={labelStyle}>
                        Repository Path
                    </label>
                    <input
                        id="repo"
                        type="text"
                        value={repo}
                        onChange={(e) => {
                            setRepo(e.target.value);
                            if (validationErrors.repo) {
                                setValidationErrors(prev => ({...prev, repo: undefined}));
                            }
                        }}
                        placeholder="/path/to/repo"
                        required
                        style={{
                            ...inputStyle,
                            borderColor: validationErrors.repo ? '#ef4444' : 'var(--color-border-light)'
                        }}
                        onFocus={(e) => {
                            if (!validationErrors.repo) {
                                e.currentTarget.style.borderColor = 'var(--color-primary-blue)';
                            }
                        }}
                        onBlur={(e) => {
                            if (!validationErrors.repo) {
                                e.currentTarget.style.borderColor = 'var(--color-border-light)';
                            }
                        }}
                    />
                    {validationErrors.repo && (
                        <div style={{ ...hintStyle, color: '#ef4444', marginTop: '4px' }}>
                            {validationErrors.repo}
                        </div>
                    )}
                </div>

                <div style={formGroupStyle}>
                    <label htmlFor="password" style={labelStyle}>
                        Repository Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            if (validationErrors.password) {
                                setValidationErrors(prev => ({...prev, password: undefined}));
                            }
                        }}
                        placeholder="Enter password"
                        required
                        style={{
                            ...inputStyle,
                            borderColor: validationErrors.password ? '#ef4444' : 'var(--color-border-light)'
                        }}
                        onFocus={(e) => {
                            if (!validationErrors.password) {
                                e.currentTarget.style.borderColor = 'var(--color-primary-blue)';
                            }
                        }}
                        onBlur={(e) => {
                            if (!validationErrors.password) {
                                e.currentTarget.style.borderColor = 'var(--color-border-light)';
                            }
                        }}
                    />
                    {validationErrors.password && (
                        <div style={{ ...hintStyle, color: '#ef4444', marginTop: '4px' }}>
                            {validationErrors.password}
                        </div>
                    )}
                </div>

                {error && <div style={errorStyle}>{error}</div>}

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        ...buttonStyle,
                        opacity: loading ? 0.6 : 1,
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                    onMouseEnter={(e) => {
                        if (!loading) {
                            e.currentTarget.style.opacity = '0.9';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!loading) {
                            e.currentTarget.style.opacity = '1';
                        }
                    }}
                >
                    {loading ? 'Connecting...' : 'Connect Repository'}
                </button>
            </form>
        </div>
    );
}
