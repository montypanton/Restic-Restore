export interface Snapshot {
    id: string;
    short_id: string;
    time: string;
    hostname: string;
    paths: string[];
    tags?: string[];
    username: string;
    tree?: string;
    parent?: string;
}

export interface SnapshotWithStats extends Snapshot {
    size?: string;
    fileCount?: number;
    formattedDate?: string;
    formattedTime?: string;
}

export interface Repository {
    id: string;
    name: string;
    path: string;
    password?: string;
    snapshotCount?: number;
    totalSize?: string;
}

export interface SavedRepository {
    id: string;
    name: string;
    path: string;
    password: string;
}

export interface FileNode {
    name: string;
    path: string;
    type: string;
    size?: number;
    mtime?: string;
}

export interface SnapshotStats {
    total_size: number;
    total_file_count: number;
}

export interface StatsCache {
    stats: Record<string, SnapshotStats>;
}

export interface ResticSnapshotStats {
    total_size: number;
    total_file_count: number;
}

export interface ResticRepositoryStats {
    total_size: number;
}