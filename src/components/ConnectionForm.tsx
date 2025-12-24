import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VALIDATION } from '../config/constants';
import { REPO_PATH_PATTERNS } from '../config/patterns';
import styles from './ConnectionForm.module.css';

interface ConnectionFormProps {
    onConnect: (repo: string, password: string) => void;
}

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
        } else if (repo.trim().length < VALIDATION.MIN_REPO_PATH_LENGTH) {
            errors.repo = 'Repository path is too short';
        } else {
            const isLocalPath = REPO_PATH_PATTERNS.WINDOWS_ABSOLUTE.test(repo) || REPO_PATH_PATTERNS.UNIX_ABSOLUTE.test(repo);
            const isRemoteUrl = REPO_PATH_PATTERNS.RESTIC_REMOTE.test(repo);
            
            if (!isLocalPath && !isRemoteUrl) {
                errors.repo = 'Must be a valid local path (e.g., C:\\backup) or remote URL (e.g., sftp:user@host:/path)';
            }
        }
        
        if (!password) {
            errors.password = 'Password is required';
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

    return (
        <div>
            <h2 className={styles.title}>Add Repository</h2>
            <form onSubmit={handleSubmit}>
                <div className={styles.formGroup}>
                    <label htmlFor="repo" className={styles.label}>
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
                        className={`${styles.input} ${validationErrors.repo ? styles.error : ''}`}
                    />
                    {validationErrors.repo && (
                        <div className={styles.validationError}>
                            {validationErrors.repo}
                        </div>
                    )}
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="password" className={styles.label}>
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
                        className={`${styles.input} ${validationErrors.password ? styles.error : ''}`}
                    />
                    {validationErrors.password && (
                        <div className={styles.validationError}>
                            {validationErrors.password}
                        </div>
                    )}
                </div>

                {error && <div className={styles.errorMessage}>{error}</div>}

                <button
                    type="submit"
                    disabled={loading}
                    className={styles.submitButton}
                >
                    {loading ? 'Connecting...' : 'Connect Repository'}
                </button>
            </form>
        </div>
    );
}
