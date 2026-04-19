function normalizeOrigin(value = '') {
    const trimmedValue = String(value || '').trim();

    if (!trimmedValue) {
        return '';
    }

    const withProtocol = /^https?:\/\//i.test(trimmedValue)
        ? trimmedValue
        : `https://${trimmedValue}`;

    try {
        return new URL(withProtocol).origin;
    } catch (_error) {
        return '';
    }
}

export function getSiteOrigin() {
    return normalizeOrigin(
        process.env.NEXT_PUBLIC_SITE_URL
        || process.env.SITE_URL
        || process.env.VERCEL_PROJECT_PRODUCTION_URL
        || process.env.VERCEL_URL
        || 'https://www.hg-alshour.online'
    );
}

export function toAbsoluteSiteUrl(pathname = '/') {
    const siteOrigin = getSiteOrigin();

    try {
        return new URL(pathname, `${siteOrigin}/`).toString();
    } catch (_error) {
        return `${siteOrigin}${String(pathname || '/')}`;
    }
}