use std::io;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Repository path cannot be empty")]
    EmptyRepositoryPath,

    #[error("Repository path contains invalid characters")]
    InvalidRepositoryPath,

    #[error("Unsupported repository protocol. Expected one of: {0}")]
    UnsupportedProtocol(String),

    #[error("Remote repository path too short")]
    RemotePathTooShort,

    #[error("Repository path cannot contain '..' components")]
    PathTraversal,

    #[error("Snapshot ID cannot be empty")]
    EmptySnapshotId,

    #[error("Snapshot ID contains invalid characters")]
    InvalidSnapshotId,

    #[error("Snapshot ID too short (minimum 8 characters)")]
    SnapshotIdTooShort,

    #[error("Snapshot ID too long (maximum 64 characters)")]
    SnapshotIdTooLong,

    #[error("Snapshot ID must be hexadecimal (0-9, a-f)")]
    SnapshotIdNotHex,

    #[error("Target path cannot be empty")]
    EmptyTargetPath,

    #[error("Target path contains invalid characters")]
    InvalidTargetPath,

    #[error("Target path must be absolute (e.g., C:\\restore or /home/user/restore)")]
    RelativeTargetPath,

    #[error("Parent directory does not exist: {0}")]
    ParentDirectoryNotFound(PathBuf),

    #[error("Include path cannot be empty")]
    EmptyIncludePath,

    #[error("Include path contains invalid characters")]
    InvalidIncludePath,

    #[error("Include path contains excessive '..' components (max 3)")]
    ExcessiveParentTraversal,

    #[error("Include path should be relative, not absolute")]
    AbsoluteIncludePath,

    #[error("Repository ID cannot be empty")]
    EmptyRepoId,

    #[error("Repository ID contains invalid characters")]
    InvalidRepoId,

    #[error("Repository ID can only contain letters, numbers, hyphens, and underscores")]
    InvalidRepoIdCharacters,

    #[error("Repository ID too long (maximum 100 characters)")]
    RepoIdTooLong,

    #[error("Password cannot be empty")]
    EmptyPassword,

    #[error("Password contains invalid characters")]
    InvalidPassword,

    #[error("Repository name cannot be empty")]
    EmptyRepositoryName,

    #[error("Repository name too long (maximum 200 characters)")]
    RepositoryNameTooLong,

    #[error("At least one include path is required for selective restore")]
    NoIncludePaths,

    #[error("Failed to execute restic: {0}")]
    ResticExecution(String),

    #[error("Restic error: {0}")]
    ResticError(String),

    #[error("Restore failed: {0}")]
    RestoreFailed(String),

    #[error("Failed to parse snapshots JSON: {0}")]
    SnapshotJsonParse(String),

    #[error("Failed to parse stats JSON: {0}")]
    StatsJsonParse(String),

    #[error("Failed to parse repository stats JSON: {0}")]
    RepoStatsJsonParse(String),

    #[error("IO error: {0}")]
    Io(#[from] io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Storage(String),
}

impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.to_string()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
