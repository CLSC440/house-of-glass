export function resolveTimestampDate(timestampValue) {
    if (!timestampValue) {
        return null;
    }

    if (timestampValue instanceof Date) {
        return Number.isNaN(timestampValue.getTime()) ? null : timestampValue;
    }

    if (typeof timestampValue?.toDate === 'function') {
        const convertedDate = timestampValue.toDate();
        return convertedDate instanceof Date && !Number.isNaN(convertedDate.getTime()) ? convertedDate : null;
    }

    if (typeof timestampValue === 'number') {
        const convertedDate = new Date(timestampValue);
        return Number.isNaN(convertedDate.getTime()) ? null : convertedDate;
    }

    if (typeof timestampValue === 'string') {
        const convertedDate = new Date(timestampValue);
        return Number.isNaN(convertedDate.getTime()) ? null : convertedDate;
    }

    if (typeof timestampValue === 'object' && Number.isFinite(timestampValue.seconds)) {
        const convertedDate = new Date(Number(timestampValue.seconds) * 1000);
        return Number.isNaN(convertedDate.getTime()) ? null : convertedDate;
    }

    return null;
}

export function parseTimestamp(timestampValue) {
    const resolvedDate = resolveTimestampDate(timestampValue);
    if (!resolvedDate) {
        return 'Unknown Date';
    }

    return resolvedDate.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
