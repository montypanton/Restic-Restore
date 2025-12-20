# Restic Restore

A desktop application for browsing and restoring files from Restic backup repositories.

## Overview

Restic Restore provides a graphical interface for working with Restic backups. It allows users to connect to existing Restic repositories, browse snapshot contents, and selectively restore files and directories.

## Features

- Browse multiple Restic repositories from a single interface
- View snapshot history with timestamps and statistics
- Navigate repository file trees
- Selective file and directory restoration
- Repository statistics including disk usage and snapshot counts

## Requirements

- Restic backup tool installed and accessible in PATH
- Valid Restic repository with existing backups

## Usage

### Adding a Repository

1. Click "Add Repository" in the sidebar
2. Enter the path to your Restic repository
3. Provide the repository password
4. Click "Connect" to verify and add the repository

### Browsing Snapshots

1. Select a repository from the sidebar
2. View the snapshot timeline sorted by date
3. Click on a snapshot to expand and view details
4. Click "Browse + Restore Snapshot" to explore files

### Restoring Files

1. Navigate through the snapshot file tree
2. Select files or directories using checkboxes
3. Click "Browse..." to choose a restore destination
4. Click "Restore" to begin the restoration process

Files are restored to a timestamped subdirectory within your chosen location to prevent accidental overwrites.

## Configuration

Configuration and cache files are stored in platform-appropriate locations:
- **macOS**: `~/Library/Application Support/app.restic-restore/`
- **Linux**: `~/.local/share/app.restic-restore/`
- **Windows**: `%APPDATA%\app.restic-restore\`

This directory contains:
- `config.json` - Repository configurations
- `stats_cache_*.json` - Cached snapshot statistics

**Note**: If you previously used v0.1.x, data is automatically migrated from `~/Documents/restic-restore-data/` on first launch.

## Security Note

Repository passwords are currently stored in plain text in the configuration file. This is a temporary implementation. Future versions will migrate to OS-provided secure credential storage (macOS Keychain, Windows Credential Manager, Linux Secret Service).

## Development

Built with:
- Frontend: React, TypeScript, Vite
- Backend: Rust, Tauri
- Backup tool: Restic

### Building from Source

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request.

