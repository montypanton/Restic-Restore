use crate::error::{AppError, Result};
use crate::models::Snapshot;
use crate::storage::get_config_dir;
use rusqlite::{Connection, params};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tracing::{debug, info, error, instrument};
use serde::{Serialize, Deserialize};

// Single global connection to avoid SQLite locking issues
static DB_CONNECTION: Lazy<Mutex<Option<Connection>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnapshotWithStats {
    pub snapshot: Snapshot,
    pub total_size: Option<u64>,
    pub total_file_count: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoMeta {
    pub repo_id: String,
    pub last_delta_check: i64,
    pub snapshot_count: i64,
}

#[instrument]
pub fn init_database() -> Result<()> {
    info!("Initializing SQLite database");

    let config_dir = get_config_dir().map_err(|e| {
        error!("Failed to get config directory: {}", e);
        AppError::Storage(format!("Failed to get config directory: {}", e))
    })?;
    let db_path = config_dir.join("snapshots.db");

    info!("Database path: {:?}", db_path);

    if !config_dir.exists() {
        info!("Config directory doesn't exist, will be created by rusqlite");
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| AppError::Storage(format!("Failed to open database: {}", e)))?;

    // Enable WAL mode and other pragmas (use execute_batch for PRAGMA statements)
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;"
    ).map_err(|e| AppError::Storage(format!("Failed to configure database: {}", e)))?;

    info!("Database configured with WAL mode and foreign keys enabled");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS snapshots (
            pk INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            short_id TEXT NOT NULL,
            time INTEGER NOT NULL,
            hostname TEXT,
            username TEXT,
            paths TEXT,
            tags TEXT,
            parent TEXT,
            tree TEXT,
            program_version TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            UNIQUE(repo_id, id)
        )",
        [],
    ).map_err(|e| AppError::Storage(format!("Failed to create snapshots table: {}", e)))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_repo_time ON snapshots(repo_id, time DESC)",
        [],
    ).map_err(|e| AppError::Storage(format!("Failed to create index: {}", e)))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_repo ON snapshots(repo_id)",
        [],
    ).map_err(|e| AppError::Storage(format!("Failed to create index: {}", e)))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS stats (
            snapshot_pk INTEGER PRIMARY KEY,
            total_size INTEGER,
            total_file_count INTEGER,
            cached_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (snapshot_pk) REFERENCES snapshots(pk) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| AppError::Storage(format!("Failed to create stats table: {}", e)))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_stats_snapshot ON stats(snapshot_pk)",
        [],
    ).map_err(|e| AppError::Storage(format!("Failed to create stats index: {}", e)))?;

    // Create meta table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS meta (
            repo_id TEXT PRIMARY KEY,
            last_delta_check INTEGER DEFAULT 0,
            snapshot_count INTEGER DEFAULT 0
        )",
        [],
    ).map_err(|e| AppError::Storage(format!("Failed to create meta table: {}", e)))?;

    let mut db_conn = DB_CONNECTION.lock()
        .map_err(|e| AppError::Storage(format!("Failed to lock database connection: {}", e)))?;
    *db_conn = Some(conn);

    info!("Database initialized successfully");
    Ok(())
}

fn get_connection() -> Result<std::sync::MutexGuard<'static, Option<Connection>>> {
    DB_CONNECTION.lock()
        .map_err(|e| AppError::Storage(format!("Failed to lock database connection: {}", e)))
}

#[instrument]
pub fn load_snapshots_from_db(repo_id: &str) -> Result<Vec<SnapshotWithStats>> {
    info!("Loading snapshots from database for repo: {}", repo_id);

    let conn_guard = get_connection()?;
    let conn = conn_guard.as_ref()
        .ok_or_else(|| AppError::Storage("Database not initialized".to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT s.id, s.repo_id, s.short_id, s.time, s.hostname, s.username,
                s.paths, s.tags, s.parent, s.tree,
                st.total_size, st.total_file_count, s.pk
         FROM snapshots s
         LEFT JOIN stats st ON s.pk = st.snapshot_pk
         WHERE s.repo_id = ?1
         ORDER BY s.time DESC"
    ).map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

    let snapshot_iter = stmt.query_map([repo_id], |row| {
        let paths_str: String = row.get(6)?;
        let paths: Vec<String> = serde_json::from_str(&paths_str).unwrap_or_default();

        let tags_str: Option<String> = row.get(7)?;
        let tags: Option<Vec<String>> = tags_str.and_then(|s| serde_json::from_str(&s).ok());

        let time_unix: i64 = row.get(3)?;
        let time_str = format_unix_timestamp(time_unix);

        Ok(SnapshotWithStats {
            snapshot: Snapshot {
                id: row.get(0)?,
                short_id: row.get(2)?,
                time: time_str,
                hostname: row.get(4)?,
                username: row.get(5)?,
                paths,
                tags,
                parent: row.get(8)?,
                tree: row.get(9)?,
            },
            total_size: row.get(10)?,
            total_file_count: row.get(11)?,
        })
    }).map_err(|e| AppError::Storage(format!("Failed to query snapshots: {}", e)))?;

    let snapshots: std::result::Result<Vec<_>, _> = snapshot_iter.collect();
    let snapshots = snapshots.map_err(|e| AppError::Storage(format!("Failed to fetch snapshots: {}", e)))?;

    let with_stats = snapshots.iter().filter(|s| s.total_size.is_some()).count();
    info!("Loaded {} snapshots from database ({} with stats, {} without stats)",
          snapshots.len(), with_stats, snapshots.len() - with_stats);
    Ok(snapshots)
}

#[instrument]
pub fn get_cached_snapshot_ids(repo_id: &str) -> Result<Vec<String>> {
    debug!("Getting cached snapshot IDs for repo: {}", repo_id);

    let conn_guard = get_connection()?;
    let conn = conn_guard.as_ref()
        .ok_or_else(|| AppError::Storage("Database not initialized".to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT s.id FROM snapshots s
         INNER JOIN stats st ON s.pk = st.snapshot_pk
         WHERE s.repo_id = ?1"
    ).map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

    let ids_iter = stmt.query_map([repo_id], |row| row.get(0))
        .map_err(|e| AppError::Storage(format!("Failed to query snapshot IDs: {}", e)))?;

    let ids: std::result::Result<Vec<String>, _> = ids_iter.collect();
    let ids = ids.map_err(|e| AppError::Storage(format!("Failed to fetch snapshot IDs: {}", e)))?;

    debug!("Found {} cached snapshot IDs", ids.len());
    Ok(ids)
}

#[instrument(skip(snapshots), fields(count = snapshots.len()))]
pub fn save_snapshots_batch(repo_id: &str, snapshots: &[SnapshotWithStats]) -> Result<()> {
    info!("Saving batch of {} snapshots with stats to database for repo {}", snapshots.len(), repo_id);

    let conn_guard = get_connection()?;
    let conn = conn_guard.as_ref()
        .ok_or_else(|| AppError::Storage("Database not initialized".to_string()))?;

    let tx = conn.unchecked_transaction()
        .map_err(|e| AppError::Storage(format!("Failed to begin transaction: {}", e)))?;

    for snap_with_stats in snapshots {
        let snapshot = &snap_with_stats.snapshot;

        let time_unix = parse_iso_to_unix(&snapshot.time);

        let paths_json = serde_json::to_string(&snapshot.paths)
            .map_err(|e| AppError::Storage(format!("Failed to serialize paths: {}", e)))?;

        let tags_json = snapshot.tags.as_ref()
            .map(|t| serde_json::to_string(t))
            .transpose()
            .map_err(|e| AppError::Storage(format!("Failed to serialize tags: {}", e)))?;

        tx.execute(
            "INSERT OR REPLACE INTO snapshots
             (id, repo_id, short_id, time, hostname, username, paths, tags, parent, tree)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                snapshot.id,
                repo_id,
                snapshot.short_id,
                time_unix,
                snapshot.hostname,
                snapshot.username,
                paths_json,
                tags_json,
                snapshot.parent,
                snapshot.tree,
            ],
        ).map_err(|e| AppError::Storage(format!("Failed to insert snapshot: {}", e)))?;

        let snapshot_pk: i64 = tx.query_row(
            "SELECT pk FROM snapshots WHERE repo_id = ?1 AND id = ?2",
            params![repo_id, snapshot.id],
            |row| row.get(0)
        ).map_err(|e| AppError::Storage(format!("Failed to get snapshot pk: {}", e)))?;

        if snap_with_stats.total_size.is_some() || snap_with_stats.total_file_count.is_some() {
            tx.execute(
                "INSERT OR REPLACE INTO stats (snapshot_pk, total_size, total_file_count)
                 VALUES (?1, ?2, ?3)",
                params![
                    snapshot_pk,
                    snap_with_stats.total_size,
                    snap_with_stats.total_file_count,
                ],
            ).map_err(|e| AppError::Storage(format!("Failed to insert stats: {}", e)))?;
        }
    }

    tx.commit()
        .map_err(|e| AppError::Storage(format!("Failed to commit transaction: {}", e)))?;

    info!("Batch save completed: {} snapshots with stats saved to database", snapshots.len());
    Ok(())
}

/// Save snapshots metadata only (without stats)
#[instrument(skip(snapshots), fields(count = snapshots.len()))]
pub fn save_snapshots_metadata_only(repo_id: &str, snapshots: &[Snapshot]) -> Result<()> {
    info!("Saving metadata for {} snapshots to database for repo {}", snapshots.len(), repo_id);

    let conn_guard = get_connection()?;
    let conn = conn_guard.as_ref()
        .ok_or_else(|| AppError::Storage("Database not initialized".to_string()))?;

    let tx = conn.unchecked_transaction()
        .map_err(|e| AppError::Storage(format!("Failed to begin transaction: {}", e)))?;

    for snapshot in snapshots {
        let time_unix = parse_iso_to_unix(&snapshot.time);

        let paths_json = serde_json::to_string(&snapshot.paths)
            .map_err(|e| AppError::Storage(format!("Failed to serialize paths: {}", e)))?;

        let tags_json = snapshot.tags.as_ref()
            .map(|t| serde_json::to_string(t))
            .transpose()
            .map_err(|e| AppError::Storage(format!("Failed to serialize tags: {}", e)))?;

        // Use INSERT OR REPLACE to ensure snapshots are updated if they already exist
        tx.execute(
            "INSERT OR REPLACE INTO snapshots
             (id, repo_id, short_id, time, hostname, username, paths, tags, parent, tree)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                snapshot.id,
                repo_id,
                snapshot.short_id,
                time_unix,
                snapshot.hostname,
                snapshot.username,
                paths_json,
                tags_json,
                snapshot.parent,
                snapshot.tree,
            ],
        ).map_err(|e| AppError::Storage(format!("Failed to insert snapshot metadata: {}", e)))?;
    }

    // Verify BEFORE commit (within transaction) to ensure we see the changes
    let count_in_tx: i64 = tx.query_row(
        "SELECT COUNT(*) FROM snapshots WHERE repo_id = ?1",
        params![repo_id],
        |row| row.get(0)
    ).map_err(|e| AppError::Storage(format!("Failed to verify snapshot count in transaction: {}", e)))?;

    tx.commit()
        .map_err(|e| AppError::Storage(format!("Failed to commit transaction: {}", e)))?;

    info!("Metadata save completed: {} snapshots saved to database", snapshots.len());
    info!("Verification: Database now contains {} total snapshots for repo {}", count_in_tx, repo_id);
    Ok(())
}

#[instrument]
pub fn update_last_delta_check(repo_id: &str) -> Result<()> {
    debug!("Updating last delta check for repo: {}", repo_id);

    let conn_guard = get_connection()?;
    let conn = conn_guard.as_ref()
        .ok_or_else(|| AppError::Storage("Database not initialized".to_string()))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| AppError::Storage(format!("Failed to get current time: {}", e)))?
        .as_secs() as i64;

    conn.execute(
        "INSERT OR REPLACE INTO meta (repo_id, last_delta_check, snapshot_count)
         VALUES (?1, ?2, COALESCE((SELECT snapshot_count FROM meta WHERE repo_id = ?1), 0))",
        params![repo_id, now],
    ).map_err(|e| AppError::Storage(format!("Failed to update last delta check: {}", e)))?;

    debug!("Last delta check updated successfully");
    Ok(())
}

#[instrument]
pub fn get_repo_meta(repo_id: &str) -> Result<RepoMeta> {
    debug!("Getting metadata for repo: {}", repo_id);

    let conn_guard = get_connection()?;
    let conn = conn_guard.as_ref()
        .ok_or_else(|| AppError::Storage("Database not initialized".to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT repo_id, last_delta_check, snapshot_count FROM meta WHERE repo_id = ?1"
    ).map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

    let meta = stmt.query_row([repo_id], |row| {
        Ok(RepoMeta {
            repo_id: row.get(0)?,
            last_delta_check: row.get(1)?,
            snapshot_count: row.get(2)?,
        })
    });

    match meta {
        Ok(m) => {
            debug!("Found metadata for repo");
            Ok(m)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            debug!("No metadata found, returning default");
            Ok(RepoMeta {
                repo_id: repo_id.to_string(),
                last_delta_check: 0,
                snapshot_count: 0,
            })
        }
        Err(e) => Err(AppError::Storage(format!("Failed to get repo metadata: {}", e)))
    }
}

#[instrument]
pub fn clear_repo_cache(repo_id: &str) -> Result<()> {
    info!("Clearing cache for repo: {}", repo_id);

    let conn_guard = get_connection()?;
    let conn = conn_guard.as_ref()
        .ok_or_else(|| AppError::Storage("Database not initialized".to_string()))?;

    let tx = conn.unchecked_transaction()
        .map_err(|e| AppError::Storage(format!("Failed to begin transaction: {}", e)))?;

    // Delete snapshots (stats will be cascade deleted)
    tx.execute("DELETE FROM snapshots WHERE repo_id = ?1", params![repo_id])
        .map_err(|e| AppError::Storage(format!("Failed to delete snapshots: {}", e)))?;

    tx.execute("DELETE FROM meta WHERE repo_id = ?1", params![repo_id])
        .map_err(|e| AppError::Storage(format!("Failed to delete metadata: {}", e)))?;

    tx.commit()
        .map_err(|e| AppError::Storage(format!("Failed to commit transaction: {}", e)))?;

    info!("Cache cleared successfully");
    Ok(())
}

fn parse_iso_to_unix(iso_time: &str) -> i64 {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(iso_time) {
        return dt.timestamp();
    }

    // Fallback: try parsing with chrono NaiveDateTime
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(iso_time, "%Y-%m-%dT%H:%M:%S%.f") {
        return dt.and_utc().timestamp();
    }

    // If all else fails, return 0
    error!("Failed to parse timestamp: {}", iso_time);
    0
}

fn format_unix_timestamp(unix_time: i64) -> String {
    use chrono::{DateTime, Utc};
    let dt = DateTime::from_timestamp(unix_time, 0)
        .unwrap_or_else(|| Utc::now());
    dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}
