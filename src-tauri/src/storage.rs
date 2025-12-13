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

/**
 * Returns the path to the application's config directory (Documents/restic-gui/).
 * Creates the directory if it doesn't exist.
 */
pub fn get_config_dir() -> Result<PathBuf, String> {
    let documents_dir = dirs::document_dir()
        .ok_or_else(|| "Could not find Documents directory".to_string())?;
    
    let config_dir = documents_dir.join("restic-gui");
    
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    Ok(config_dir)
}

/// Returns the path to the main config file (Documents/restic-gui/config.json)
pub fn get_config_file_path() -> Result<PathBuf, String> {
    let config_dir = get_config_dir()?;
    Ok(config_dir.join("config.json"))
}

/// Saves the application configuration to disk as JSON
pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let config_path = get_config_file_path()?;
    
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    Ok(())
}

/// Loads the application configuration from disk. Returns empty config if file doesn't exist.
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

/// Returns the path to the stats cache file for a specific repository
pub fn get_stats_cache_path(repo_id: &str) -> Result<PathBuf, String> {
    let config_dir = get_config_dir()?;
    Ok(config_dir.join(format!("stats_cache_{}.json", repo_id)))
}

/// Saves snapshot statistics cache for a repository to disk
pub fn save_stats_cache(repo_id: &str, cache: &StatsCache) -> Result<(), String> {
    let cache_path = get_stats_cache_path(repo_id)?;
    
    let json = serde_json::to_string_pretty(cache)
        .map_err(|e| format!("Failed to serialize stats cache: {}", e))?;
    
    fs::write(&cache_path, json)
        .map_err(|e| format!("Failed to write stats cache file: {}", e))?;
    
    Ok(())
}

/// Loads snapshot statistics cache for a repository. Returns empty cache if file doesn't exist.
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

