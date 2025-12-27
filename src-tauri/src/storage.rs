use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restic_binary_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub setup_completed: Option<bool>,
}

pub fn get_config_dir() -> Result<PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| "Could not find Application Support directory".to_string())?;
    
    let config_dir = data_dir.join("app.restic-restore");

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

