use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedRepository {
    pub id: String,
    pub name: String,
    pub path: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub repositories: Vec<SavedRepository>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnapshotStats {
    pub total_size: u64,
    pub total_file_count: u64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct StatsCache {
    pub stats: HashMap<String, SnapshotStats>,
}

fn get_old_config_dir() -> Option<PathBuf> {
    dirs::document_dir().map(|dir| dir.join("restic-restore-data"))
}

fn copy_file_if_exists(source: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    if source.exists() {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        fs::copy(source, dest)
            .map_err(|e| format!("Failed to copy file: {}", e))?;
    }
    Ok(())
}

/// Migrates data from old Documents location to new Library location.
/// Only runs if new location doesn't exist and old location has data.
fn migrate_config_if_needed(new_config_dir: &PathBuf) -> Result<(), String> {
    if new_config_dir.exists() {
        return Ok(());
    }
    
    let old_dir = match get_old_config_dir() {
        Some(dir) if dir.exists() => dir,
        _ => return Ok(()),
    };
    
    fs::create_dir_all(new_config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    
    let old_config = old_dir.join("config.json");
    let new_config = new_config_dir.join("config.json");
    copy_file_if_exists(&old_config, &new_config)?;
    
    if let Ok(entries) = fs::read_dir(&old_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(filename) = path.file_name() {
                if let Some(name) = filename.to_str() {
                    if name.starts_with("stats_cache_") && name.ends_with(".json") {
                        let dest = new_config_dir.join(filename);
                        copy_file_if_exists(&path, &dest)?;
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// Returns ~/Library/Application Support/app.restic-restore/
pub fn get_config_dir() -> Result<PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| "Could not find Application Support directory".to_string())?;
    
    let config_dir = data_dir.join("app.restic-restore");
    
    migrate_config_if_needed(&config_dir)?;
    
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    Ok(config_dir)
}

pub fn get_config_file_path() -> Result<PathBuf, String> {
    let config_dir = get_config_dir()?;
    Ok(config_dir.join("config.json"))
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let config_path = get_config_file_path()?;
    
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    Ok(())
}

/// Returns empty config if file not found.
pub fn load_config() -> Result<AppConfig, String> {
    let config_path = get_config_file_path()?;
    
    if !config_path.exists() {
        return Ok(AppConfig::default());
    }
    
    let json = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;
    
    let config: AppConfig = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse config file: {}", e))?;
    
    Ok(config)
}

pub fn get_stats_cache_path(repo_id: &str) -> Result<PathBuf, String> {
    let config_dir = get_config_dir()?;
    Ok(config_dir.join(format!("stats_cache_{}.json", repo_id)))
}

pub fn save_stats_cache(repo_id: &str, cache: &StatsCache) -> Result<(), String> {
    let cache_path = get_stats_cache_path(repo_id)?;
    
    let json = serde_json::to_string_pretty(cache)
        .map_err(|e| format!("Failed to serialize stats cache: {}", e))?;
    
    fs::write(&cache_path, json)
        .map_err(|e| format!("Failed to write stats cache file: {}", e))?;
    
    Ok(())
}

/// Returns empty cache if file not found.
pub fn load_stats_cache(repo_id: &str) -> Result<StatsCache, String> {
    let cache_path = get_stats_cache_path(repo_id)?;
    
    if !cache_path.exists() {
        return Ok(StatsCache::default());
    }
    
    let json = fs::read_to_string(&cache_path)
        .map_err(|e| format!("Failed to read stats cache file: {}", e))?;
    
    let cache: StatsCache = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse stats cache file: {}", e))?;
    
    Ok(cache)
}

pub fn delete_stats_cache(repo_id: &str) -> Result<(), String> {
    let cache_path = get_stats_cache_path(repo_id)?;
    
    if cache_path.exists() {
        fs::remove_file(&cache_path)
            .map_err(|e| format!("Failed to delete stats cache file: {}", e))?;
    }
    
    Ok(())
}

