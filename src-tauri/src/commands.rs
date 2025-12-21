use crate::models::{Snapshot, FileNode};
use crate::storage::{AppConfig, SavedRepository, StatsCache, save_config, load_config, save_stats_cache, load_stats_cache, delete_stats_cache};
use std::process::Command;
use std::path::Path;
use tauri::command;
use serde_json::Value;
use dirs;

/// Finds the restic binary in common installation locations.
fn find_restic_binary() -> String {
    #[cfg(target_os = "macos")]
    let platform_locations: Vec<String> = vec![
        "/opt/homebrew/bin/restic".to_string(),
        "/usr/local/bin/restic".to_string(),
        "/usr/bin/restic".to_string(),
    ];

    #[cfg(target_os = "windows")]
    let platform_locations = {
        let mut locations = vec![
            "C:\\Program Files\\Restic\\restic.exe".to_string(),
            "C:\\Program Files (x86)\\Restic\\restic.exe".to_string(),
        ];

        if let Some(home_dir) = dirs::home_dir() {
            let scoop_path = home_dir.join("scoop\\shims\\restic.exe");
            if let Some(path_str) = scoop_path.to_str() {
                locations.push(path_str.to_string());
            }
        }

        locations
    };

    for location in &platform_locations {
        if Path::new(location).exists() {
            return location.to_string();
        }
    }

    // Fallback to PATH lookup
    "restic".to_string()
}

fn run_restic(repo: &str, password: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(find_restic_binary())
        .arg("-r")
        .arg(repo)
        .args(args)
        .env("RESTIC_PASSWORD", password)
        .output()
        .map_err(|e| format!("Failed to execute restic: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Restic error: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Executes restic restore with lenient error handling for non-fatal warnings.
fn run_restic_restore(repo: &str, password: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(find_restic_binary())
        .arg("-r")
        .arg(repo)
        .args(args)
        .env("RESTIC_PASSWORD", password)
        .output()
        .map_err(|e| format!("Failed to execute restic: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let is_fatal = stderr.contains("repository does not exist")
            || stderr.contains("wrong password")
            || stderr.contains("unable to open repository")
            || stderr.contains("snapshot") && stderr.contains("not found");
        
        if is_fatal {
            return Err(format!("Restore failed: {}", stderr));
        }
        
        return Ok(format!("Restored with warnings:\n{}", stderr));
    }

    Ok(stdout)
}

/// Verifies repository connection by attempting to list snapshots
#[command]
pub async fn connect_repository(repo: String, password: String) -> Result<String, String> {
    run_restic(&repo, &password, &["snapshots", "--latest", "1", "--json"])?;
    Ok("Connected successfully".to_string())
}

/// Lists all snapshots in the repository
#[command]
pub async fn list_snapshots(repo: String, password: String) -> Result<Vec<Snapshot>, String> {
    let output = run_restic(&repo, &password, &["snapshots", "--json"])?;
    let snapshots: Vec<Snapshot> = serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse snapshots JSON: {}", e))?;
    Ok(snapshots)
}

/// Returns file tree for a snapshot. Parses line-delimited JSON from restic ls.
#[command]
pub async fn get_snapshot_details(repo: String, password: String, snapshot_id: String) -> Result<Vec<FileNode>, String> {
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

/// Restores an entire snapshot to the target directory
#[command]
pub async fn restore_snapshot(repo: String, password: String, snapshot_id: String, target: String) -> Result<String, String> {
    run_restic_restore(&repo, &password, &["restore", &snapshot_id, "--target", &target])?;
    Ok("Restore completed".to_string())
}

/// Restores selected files/directories from a snapshot to the target directory
#[command]
pub async fn restore_selective(
    repo: String, 
    password: String, 
    snapshot_id: String, 
    target: String,
    include_paths: Vec<String>
) -> Result<String, String> {
    let mut args = vec!["restore", &snapshot_id, "--target", &target];
    
    let include_path_refs: Vec<String> = include_paths.iter()
        .flat_map(|p| vec!["--include".to_string(), p.clone()])
        .collect();
    
    let include_args: Vec<&str> = include_path_refs.iter().map(|s| s.as_str()).collect();
    args.extend(include_args);
    
    run_restic_restore(&repo, &password, &args)?;
    
    Ok(format!("Restored {} item(s) successfully", include_paths.len()))
}

/// Browses a snapshot at the specified path (or root if no path provided)
#[command]
pub async fn browse_snapshot(repo: String, password: String, snapshot_id: String, path: Option<String>) -> Result<Vec<FileNode>, String> {
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

/// Loads the complete file tree for a snapshot in a single request
#[command]
pub async fn browse_snapshot_full(repo: String, password: String, snapshot_id: String) -> Result<Vec<FileNode>, String> {
    let args = vec!["ls", "--json", &snapshot_id];
    
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

/// Returns statistics (size, file count) for a snapshot
#[command]
pub async fn get_snapshot_stats(repo: String, password: String, snapshot_id: String) -> Result<serde_json::Value, String> {
    let output = run_restic(&repo, &password, &["stats", "--json", &snapshot_id])?;
    let stats: serde_json::Value = serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse stats JSON: {}", e))?;
    Ok(stats)
}

/// Returns the total size of the repository on disk (all snapshots combined)
#[command]
pub async fn get_repository_stats(repo: String, password: String) -> Result<serde_json::Value, String> {
    let output = run_restic(&repo, &password, &["stats", "--json", "--mode", "raw-data"])?;
    let stats: serde_json::Value = serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse repository stats JSON: {}", e))?;
    Ok(stats)
}

/// Saves repository configurations to disk
#[command]
pub async fn save_repositories(repositories: Vec<SavedRepository>) -> Result<(), String> {
    let config = AppConfig { repositories };
    save_config(&config)?;
    Ok(())
}

/// Loads repository configurations from disk
#[command]
pub async fn load_repositories() -> Result<Vec<SavedRepository>, String> {
    let config = load_config()?;
    Ok(config.repositories)
}

/// Returns the path to the application config file
#[command]
pub async fn get_config_path() -> Result<String, String> {
    let path = crate::storage::get_config_file_path()?;
    Ok(path.to_string_lossy().to_string())
}

/// Saves snapshot statistics cache for a repository
#[command]
pub async fn save_snapshot_stats_cache(repo_id: String, cache: StatsCache) -> Result<(), String> {
    save_stats_cache(&repo_id, &cache)?;
    Ok(())
}

/// Loads snapshot statistics cache for a repository
#[command]
pub async fn load_snapshot_stats_cache(repo_id: String) -> Result<StatsCache, String> {
    load_stats_cache(&repo_id)
}

/// Removes a repository from the config and deletes its stats cache
#[command]
pub async fn remove_repository(repo_id: String) -> Result<(), String> {
    let mut config = load_config()?;
    config.repositories.retain(|r| r.id != repo_id);
    save_config(&config)?;
    delete_stats_cache(&repo_id)?;
    Ok(())
}