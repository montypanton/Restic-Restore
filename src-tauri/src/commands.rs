use crate::error::{AppError, Result};
use crate::models::{Snapshot, FileNode};
use crate::storage::{AppConfig, SavedRepository, StatsCache, save_config, load_config, save_stats_cache, load_stats_cache, delete_stats_cache};
use std::process::Command;
use std::path::{Path, PathBuf, Component};
use tauri::command;
use serde_json::Value;
use dirs;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn validate_repository_path(repo: &str) -> Result<()> {
    if repo.trim().is_empty() {
        return Err(AppError::EmptyRepositoryPath);
    }

    if repo.contains('\0') {
        return Err(AppError::InvalidRepositoryPath);
    }

    if repo.contains(':') && !repo.starts_with("C:") && !repo.starts_with("c:") {
        let valid_protocols = ["s3:", "rest:", "sftp:", "b2:", "azure:", "gs:", "rclone:"];
        if !valid_protocols.iter().any(|p| repo.starts_with(p)) {
            if cfg!(windows) && repo.len() >= 2 && repo.chars().nth(1) == Some(':') {
            } else {
                return Err(AppError::UnsupportedProtocol(valid_protocols.join(", ")));
            }
        } else {
            if repo.len() < 5 {
                return Err(AppError::RemotePathTooShort);
            }
            return Ok(());
        }
    }

    let path = Path::new(repo);

    for component in path.components() {
        if matches!(component, Component::ParentDir) {
            return Err(AppError::PathTraversal);
        }
    }

    // Don't check if path exists, user might be initializing a new repo or currently unavalilable
    Ok(())
}

fn validate_snapshot_id(snapshot_id: &str) -> Result<()> {
    if snapshot_id.trim().is_empty() {
        return Err(AppError::EmptySnapshotId);
    }

    if snapshot_id.contains('\0') {
        return Err(AppError::InvalidSnapshotId);
    }

    // Short IDs are typically 8 chars, full IDs are 64 chars
    if snapshot_id.len() < 8 {
        return Err(AppError::SnapshotIdTooShort);
    }

    if snapshot_id.len() > 64 {
        return Err(AppError::SnapshotIdTooLong);
    }

    if !snapshot_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::SnapshotIdNotHex);
    }

    Ok(())
}

fn validate_target_path(target: &str) -> Result<PathBuf> {
    if target.trim().is_empty() {
        return Err(AppError::EmptyTargetPath);
    }

    if target.contains('\0') {
        return Err(AppError::InvalidTargetPath);
    }

    let path = PathBuf::from(target);

    if !path.is_absolute() {
        return Err(AppError::RelativeTargetPath);
    }

    for component in path.components() {
        match component {
            Component::ParentDir => {
                return Err(AppError::PathTraversal);
            }
            Component::Normal(s) => {
                let component_str = s.to_string_lossy();
                if component_str.contains('\0') {
                    return Err(AppError::InvalidTargetPath);
                }
            }
            _ => {}
        }
    }

    // Target itself might not exist yet, but parent should
    if let Some(parent) = path.parent() {
        if !parent.exists() && parent.components().count() > 1 {
            return Err(AppError::ParentDirectoryNotFound(parent.to_path_buf()));
        }
    }

    Ok(path)
}

fn validate_include_path(include_path: &str) -> Result<()> {
    if include_path.trim().is_empty() {
        return Err(AppError::EmptyIncludePath);
    }

    if include_path.contains('\0') {
        return Err(AppError::InvalidIncludePath);
    }

    let parent_count = include_path.matches("..").count();
    if parent_count > 3 {
        return Err(AppError::ExcessiveParentTraversal);
    }

    // Must be relative to snapshot root
    let path = Path::new(include_path);
    if path.is_absolute() {
        return Err(AppError::AbsoluteIncludePath);
    }

    Ok(())
}

fn validate_repo_id(repo_id: &str) -> Result<()> {
    if repo_id.trim().is_empty() {
        return Err(AppError::EmptyRepoId);
    }

    if repo_id.contains('\0') {
        return Err(AppError::InvalidRepoId);
    }

    // Alphanumeric with hyphens/underscores only (safe for filenames)
    if !repo_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(AppError::InvalidRepoIdCharacters);
    }

    if repo_id.len() > 100 {
        return Err(AppError::RepoIdTooLong);
    }

    Ok(())
}

fn validate_password(password: &str) -> Result<()> {
    if password.is_empty() {
        return Err(AppError::EmptyPassword);
    }

    if password.contains('\0') {
        return Err(AppError::InvalidPassword);
    }

    Ok(())
}

fn find_restic_binary() -> String {
    #[cfg(target_os = "macos")]
    let platform_locations: Vec<String> = vec![
        "/opt/homebrew/bin/restic".to_string(),
        "/usr/local/bin/restic".to_string(),
        "/usr/bin/restic".to_string(),
    ];

    #[cfg(target_os = "windows")]
    let platform_locations = {
        let mut locations = vec![];

        if let Some(home_dir) = dirs::home_dir() {
            let scoop_shim = home_dir.join("scoop\\shims\\restic.exe");
            if let Some(path_str) = scoop_shim.to_str() {
                locations.push(path_str.to_string());
            }
        }

        locations.push("C:\\Program Files\\Restic\\restic.exe".to_string());
        locations.push("C:\\Program Files (x86)\\Restic\\restic.exe".to_string());

        locations
    };

    for location in &platform_locations {
        if Path::new(location).exists() {
            return location.to_string();
        }
    }

    "restic".to_string()
}

enum ErrorHandling {
    Strict,
    Lenient, // Treat some errors as warnings during restore operations
}

fn run_restic_command(
    repo: &str,
    password: &str,
    args: &[&str],
    error_mode: ErrorHandling,
) -> Result<String> {
    let mut cmd = Command::new(find_restic_binary());
    cmd.arg("-r")
       .arg(repo)
       .args(args)
       .env("RESTIC_PASSWORD", password);

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| AppError::ResticExecution(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        match error_mode {
            ErrorHandling::Strict => {
                Err(AppError::ResticError(stderr))
            }
            ErrorHandling::Lenient => {
                let is_fatal = stderr.contains("repository does not exist")
                    || stderr.contains("wrong password")
                    || stderr.contains("unable to open repository")
                    || (stderr.contains("snapshot") && stderr.contains("not found"));

                if is_fatal {
                    Err(AppError::RestoreFailed(stderr))
                } else {
                    Ok(format!("Restored with warnings:\n{}", stderr))
                }
            }
        }
    } else {
        Ok(stdout)
    }
}

fn run_restic(repo: &str, password: &str, args: &[&str]) -> Result<String> {
    run_restic_command(repo, password, args, ErrorHandling::Strict)
}

// Fatal errors (wrong password, missing repo) still fail, but warnings are allowed
fn run_restic_restore(repo: &str, password: &str, args: &[&str]) -> Result<String> {
    run_restic_command(repo, password, args, ErrorHandling::Lenient)
}

#[command]
pub async fn connect_repository(repo: String, password: String) -> std::result::Result<String, String> {
    validate_repository_path(&repo)?;
    validate_password(&password)?;

    run_restic(&repo, &password, &["snapshots", "--latest", "1", "--json"])?;
    Ok("Connected successfully".to_string())
}

#[command]
pub async fn list_snapshots(repo: String, password: String) -> std::result::Result<Vec<Snapshot>, String> {
    validate_repository_path(&repo)?;
    validate_password(&password)?;

    let output = run_restic(&repo, &password, &["snapshots", "--json"])?;
    let snapshots: Vec<Snapshot> = serde_json::from_str(&output)
        .map_err(|e| AppError::SnapshotJsonParse(e.to_string()))?;
    Ok(snapshots)
}

#[command]
pub async fn get_snapshot_details(repo: String, password: String, snapshot_id: String) -> std::result::Result<Vec<FileNode>, String> {
    validate_repository_path(&repo)?;
    validate_password(&password)?;
    validate_snapshot_id(&snapshot_id)?;

    let output = run_restic(&repo, &password, &["ls", "--json", &snapshot_id])?;

    let mut files = Vec::new();
    for line in output.lines() {
        if line.trim().is_empty() { continue; }
        if let Ok(node) = serde_json::from_str::<FileNode>(line) {
            files.push(node);
        }
    }

    Ok(files)
}

#[command]
pub async fn restore_snapshot(repo: String, password: String, snapshot_id: String, target: String) -> std::result::Result<String, String> {
    validate_repository_path(&repo)?;
    validate_password(&password)?;
    validate_snapshot_id(&snapshot_id)?;
    let validated_target = validate_target_path(&target)?;

    run_restic_restore(&repo, &password, &["restore", &snapshot_id, "--target", validated_target.to_str().unwrap()])?;
    Ok("Restore completed".to_string())
}

#[command]
pub async fn restore_selective(
    repo: String,
    password: String,
    snapshot_id: String,
    target: String,
    include_paths: Vec<String>
) -> std::result::Result<String, String> {
    validate_repository_path(&repo)?;
    validate_password(&password)?;
    validate_snapshot_id(&snapshot_id)?;
    let validated_target = validate_target_path(&target)?;

    for include_path in &include_paths {
        validate_include_path(include_path)?;
    }

    if include_paths.is_empty() {
        return Err(AppError::NoIncludePaths.into());
    }

    let target_str = validated_target.to_str().unwrap();
    let mut args = vec!["restore", &snapshot_id, "--target", target_str];

    let include_path_refs: Vec<String> = include_paths.iter()
        .flat_map(|p| vec!["--include".to_string(), p.clone()])
        .collect();

    let include_args: Vec<&str> = include_path_refs.iter().map(|s| s.as_str()).collect();
    args.extend(include_args);

    run_restic_restore(&repo, &password, &args)?;

    Ok(format!("Restored {} item(s) successfully", include_paths.len()))
}

#[command]
pub async fn browse_snapshot(repo: String, password: String, snapshot_id: String, path: Option<String>) -> std::result::Result<Vec<FileNode>, String> {
    validate_repository_path(&repo)?;
    validate_password(&password)?;
    validate_snapshot_id(&snapshot_id)?;

    if let Some(p) = &path {
        validate_include_path(p)?;
    }

    let mut args = vec!["ls", "--json", &snapshot_id];
    if let Some(p) = &path {
        args.push(p);
    }

    let output = run_restic(&repo, &password, &args)?;

    let mut files = Vec::new();
    for line in output.lines() {
        if line.trim().is_empty() { continue; }
        if let Ok(val) = serde_json::from_str::<Value>(line) {
            if let Some(struct_type) = val.get("struct_type") {
                if struct_type == "node" {
                    if let Ok(node) = serde_json::from_value::<FileNode>(val) {
                        files.push(node);
                    }
                }
            }
        }
    }

    Ok(files)
}

#[command]
pub async fn get_snapshot_stats(repo: String, password: String, snapshot_id: String) -> std::result::Result<serde_json::Value, String> {
    validate_repository_path(&repo)?;
    validate_password(&password)?;
    validate_snapshot_id(&snapshot_id)?;

    let output = run_restic(&repo, &password, &["stats", "--json", &snapshot_id])?;
    let stats: serde_json::Value = serde_json::from_str(&output)
        .map_err(|e| AppError::StatsJsonParse(e.to_string()))?;
    Ok(stats)
}

#[command]
pub async fn get_repository_stats(repo: String, password: String) -> std::result::Result<serde_json::Value, String> {
    validate_repository_path(&repo)?;
    validate_password(&password)?;

    let output = run_restic(&repo, &password, &["stats", "--json", "--mode", "raw-data"])?;
    let stats: serde_json::Value = serde_json::from_str(&output)
        .map_err(|e| AppError::RepoStatsJsonParse(e.to_string()))?;
    Ok(stats)
}

#[command]
pub async fn save_repositories(repositories: Vec<SavedRepository>) -> std::result::Result<(), String> {
    for repo in &repositories {
        validate_repo_id(&repo.id)?;
        validate_repository_path(&repo.path)?;
        validate_password(&repo.password)?;

        if repo.name.trim().is_empty() {
            return Err(AppError::EmptyRepositoryName.into());
        }

        if repo.name.len() > 200 {
            return Err(AppError::RepositoryNameTooLong.into());
        }
    }

    let config = AppConfig { repositories };
    save_config(&config).map_err(|e| AppError::Storage(e))?;
    Ok(())
}

#[command]
pub async fn load_repositories() -> std::result::Result<Vec<SavedRepository>, String> {
    let config = load_config().map_err(|e| AppError::Storage(e))?;
    Ok(config.repositories)
}

#[command]
pub async fn get_config_path() -> std::result::Result<String, String> {
    let path = crate::storage::get_config_file_path().map_err(|e| AppError::Storage(e))?;
    Ok(path.to_string_lossy().to_string())
}

#[command]
pub async fn save_snapshot_stats_cache(repo_id: String, cache: StatsCache) -> std::result::Result<(), String> {
    validate_repo_id(&repo_id)?;

    save_stats_cache(&repo_id, &cache).map_err(|e| AppError::Storage(e))?;
    Ok(())
}

#[command]
pub async fn load_snapshot_stats_cache(repo_id: String) -> std::result::Result<StatsCache, String> {
    validate_repo_id(&repo_id)?;

    Ok(load_stats_cache(&repo_id).map_err(|e| AppError::Storage(e))?)
}

#[command]
pub async fn remove_repository(repo_id: String) -> std::result::Result<(), String> {
    validate_repo_id(&repo_id)?;

    let mut config = load_config().map_err(|e| AppError::Storage(e))?;
    config.repositories.retain(|r| r.id != repo_id);
    save_config(&config).map_err(|e| AppError::Storage(e))?;
    delete_stats_cache(&repo_id).map_err(|e| AppError::Storage(e))?;
    Ok(())
}