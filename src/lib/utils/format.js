export function parseTimestamp(timestampStr) {
    if (!timestampStr) return 'Unknown Date';
    try {
        const date = new Date(timestampStr);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Invalid Date';
    }
}
