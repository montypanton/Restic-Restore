mod error;
mod models;
mod commands;
mod storage;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing subscriber
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
        )
        .with_target(false)
        .init();

    tracing::info!("Starting Restic-Restore application");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            connect_repository,
            list_snapshots,
            get_snapshot_details,
            restore_snapshot,
            restore_selective,
            browse_snapshot,
            get_snapshot_stats,
            get_repository_stats,
            save_repositories,
            load_repositories,
            get_config_path,
            save_snapshot_stats_cache,
            load_snapshot_stats_cache,
            remove_repository
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
