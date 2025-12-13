mod models;
mod commands;
mod storage;

use commands::*;

/// Main entry point for the Tauri application.
/// Initializes plugins and registers command handlers.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            connect_repository,
            list_snapshots,
            get_snapshot_details,
            restore_snapshot,
            restore_selective,
            browse_snapshot,
            browse_snapshot_full,
            get_snapshot_stats,
            save_repositories,
            load_repositories,
            get_config_path,
            save_snapshot_stats_cache,
            load_snapshot_stats_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
