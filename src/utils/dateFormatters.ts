/**
 * @example
 * formatShortDate("2024-01-15T10:30:00Z") // "Jan 15, 2024"
 */
export function formatShortDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return dateString;
  }
}

/**
 * @example
 * formatTime("2024-01-15T10:30:00Z") // "10:30 AM"
 */
export function formatTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

/**
 * Shows "just now", "5 minutes ago", "2 hours ago", "3 days ago", or full date.
 *
 * @example
 * formatRelativeTime(twoMinutesAgo) // "2 minutes ago"
 * formatRelativeTime(yesterday) // "1 day ago"
 * formatRelativeTime(lastWeek) // "Jan 8, 2024"
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;

    return formatShortDate(dateString);
  } catch {
    return 'Unknown';
  }
}
