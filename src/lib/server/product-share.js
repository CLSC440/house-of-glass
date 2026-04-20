import { cache } from 'react';
import { createRequire } from 'module';
import { getSiteOrigin, toAbsoluteSiteUrl } from '@/lib/site-origin';

const require = createRequire(import.meta.url);
const { getDb } = require('../../api/_firebaseAdmin.js');

function normalizeText(value = '') {
    return String(value || '').trim();
}

function normalizeShareCode(value = '') {
    return normalizeText(value)
        .replace(/^['"]+|['"]+$/g, '')
        .toLowerCase();
}

function getFirstValidText(values = []) {
    return values
        .map(normalizeText)
        .find(Boolean) || '';
}

function getProductShareCode(product = {}) {
    const primaryCode = [product.code, product.barcode, product.sku]
        .map(normalizeText)
        .find(Boolean);

    if (primaryCode) {
        return primaryCode;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    return variants
        .flatMap((variant) => [variant?.code, variant?.barcode, variant?.sku])
        .map(normalizeText)
        .find(Boolean) || '';
}

function resolveProductTitle(product = {}) {
    return getFirstValidText([product.title, product.name, product.label, 'House Of Glass Product']);
}

function resolveProductBrand(product = {}) {
    return getFirstValidText([product.brand, product.manufacturer, product.origin]);
}

function resolveProductCategory(product = {}) {
    return getFirstValidText([product.category, product.collection, product.type]);
}

function resolveProductImage(product = {}) {
    const imageCandidates = [
        product.image,
        product.primaryUrl,
        product.url,
        product.images?.[0]?.url,
        product.images?.[0]?.primaryUrl,
        product.images?.[0],
        product.imageDetails?.[0]?.primaryUrl,
        product.imageDetails?.[0]?.url,
        product.media?.[0]?.url,
        product.media?.[0]?.primaryUrl,
        product.media?.[0]
    ];

    const resolvedImage = imageCandidates.find((entry) => typeof entry === 'string' && entry.trim());
    return resolvedImage ? toAbsoluteUrl(resolvedImage) : toAbsoluteSiteUrl('/logo.png');
}

function buildProductDescription(product = {}) {
    const brand = resolveProductBrand(product);
    const category = resolveProductCategory(product);
    const shareCode = getProductShareCode(product);
    const detailFragments = [brand, category].filter(Boolean);
    const detailLabel = detailFragments.length > 0 ? detailFragments.join(' • ') : 'House Of Glass';

    if (shareCode) {
        return `${detailLabel} • Code ${shareCode}. اكتشف المنتج وافتحه مباشرة داخل المتجر.`;
    }

    return `${detailLabel}. اكتشف المنتج وافتحه مباشرة داخل المتجر.`;
}

function buildProductSharePath(productId = '') {
    const normalizedProductId = normalizeText(productId);
    return normalizedProductId ? `/product/${encodeURIComponent(normalizedProductId)}` : '/';
}

function buildProductTargetPath(product = {}) {
    const shareCode = normalizeText(getProductShareCode(product));

    if (!shareCode) {
        return '/';
    }

    const params = new URLSearchParams();
    params.set('code', shareCode);
    return `/?${params.toString()}`;
}

function toAbsoluteUrl(value = '') {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
        return toAbsoluteSiteUrl('/logo.png');
    }

    if (/^https?:\/\//i.test(normalizedValue)) {
        return normalizedValue;
    }

    return toAbsoluteSiteUrl(normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`);
}

function isImageKitUrl(value = '') {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
        return false;
    }

    try {
        return /(^|\.)ik\.imagekit\.io$/i.test(new URL(normalizedValue).hostname);
    } catch (_error) {
        return false;
    }
}

function appendImageKitTransformation(imageUrl = '', transformation = '') {
    const normalizedImageUrl = normalizeText(imageUrl);
    const normalizedTransformation = normalizeText(transformation);

    if (!normalizedImageUrl || !normalizedTransformation || !isImageKitUrl(normalizedImageUrl)) {
        return normalizedImageUrl;
    }

    try {
        const parsedUrl = new URL(normalizedImageUrl);
        const existingTransform = normalizeText(parsedUrl.searchParams.get('tr'));
        parsedUrl.searchParams.set('tr', existingTransform ? `${existingTransform}:${normalizedTransformation}` : normalizedTransformation);
        return parsedUrl.toString();
    } catch (_error) {
        return normalizedImageUrl;
    }
}

function buildProductSocialImage(imageUrl = '') {
    const normalizedImageUrl = normalizeText(imageUrl);

    if (!normalizedImageUrl || !isImageKitUrl(normalizedImageUrl)) {
        return normalizedImageUrl;
    }

    const encodedLogoUrl = Buffer.from(toAbsoluteSiteUrl('/logo.png')).toString('base64');
    const logoOverlayTransform = [
        'l-image',
        `ie-${encodedLogoUrl}`,
        'w-bw_mul_0.15',
        'lx-bw_mul_0.035',
        'ly-bh_mul_0.035',
        'l-end'
    ].join(',');

    return appendImageKitTransformation(normalizedImageUrl, logoOverlayTransform);
}

export const getSharedProductById = cache(async (productId) => {
    const normalizedProductId = normalizeText(productId);

    if (!normalizedProductId) {
        return null;
    }

    try {
        const productSnapshot = await getDb().collection('products').doc(normalizedProductId).get();

        if (!productSnapshot.exists) {
            return null;
        }

        const product = {
            id: productSnapshot.id,
            ...productSnapshot.data()
        };

        return {
            ...product,
            normalizedShareCode: normalizeShareCode(getProductShareCode(product)),
            shareCode: getProductShareCode(product),
            sharePath: buildProductSharePath(productSnapshot.id),
            shareUrl: toAbsoluteSiteUrl(buildProductSharePath(productSnapshot.id)),
            targetPath: buildProductTargetPath(product),
            targetUrl: toAbsoluteSiteUrl(buildProductTargetPath(product)),
            title: resolveProductTitle(product),
            brand: resolveProductBrand(product),
            category: resolveProductCategory(product),
            description: buildProductDescription(product),
            imageUrl: resolveProductImage(product),
            socialImageUrl: buildProductSocialImage(resolveProductImage(product)),
            siteOrigin: getSiteOrigin()
        };
    } catch (error) {
        console.error('Failed to load shared product metadata:', error);
        return null;
    }
});