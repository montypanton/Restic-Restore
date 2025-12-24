export const REPO_PATH_PATTERNS = {
  /** Windows paths like C:\backup or D:/data */
  WINDOWS_ABSOLUTE: /^[a-zA-Z]:[\\\/]/,

  /** Unix paths like /home/user or ~/backup */
  UNIX_ABSOLUTE: /^[\/~]/,

  /** Remote protocols like sftp: or s3: */
  RESTIC_REMOTE: /^(sftp|rest|s3|b2|azure|gs|rclone):/,
} as const;
