mod error;
mod models;
mod commands;
mod storage;
mod database;

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

    // Initialize SQLite database
    match database::init_database() {
        Ok(_) => {
            tracing::info!("✅ Database initialized successfully");
        }
        Err(e) => {
            tracing::error!("❌ CRITICAL: Failed to initialize database: {}", e);
            tracing::error!("Database features will not work. Please check:");
            tracing::error!("  1. Write permissions to app data directory");
            tracing::error!("  2. Available disk space");
            tracing::error!("  3. Antivirus software blocking file creation");
            eprintln!("\n🚨 DATABASE INITIALIZATION FAILED: {}\n", e);
        }
    }

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
            remove_repository,
            get_restic_binary_path,
            set_restic_binary_path,
            get_detected_restic_path,
            check_restic_setup_status,
            mark_setup_completed,
            // SQLite database commands
            init_database_command,
            load_snapshots_from_db,
            get_cached_snapshot_ids,
            save_snapshots_batch,
            save_snapshots_metadata_only,
            update_last_delta_check,
            get_repo_meta,
            clear_repo_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
