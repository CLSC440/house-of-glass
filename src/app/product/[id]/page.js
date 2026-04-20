import ProductShareRedirect from './ProductShareRedirect';
import { getSharedProductById } from '@/lib/server/product-share';

function resolveSingleSearchParam(value) {
    if (Array.isArray(value)) {
        return String(value[0] || '').trim();
    }

    return String(value || '').trim();
}

function buildSharePreviewPath(basePath = '', shareCacheKey = '') {
    const normalizedBasePath = String(basePath || '').trim() || '/';
    const normalizedShareCacheKey = resolveSingleSearchParam(shareCacheKey);

    if (!normalizedShareCacheKey) {
        return normalizedBasePath;
    }

    const params = new URLSearchParams();
    params.set('wa_share', normalizedShareCacheKey);
    return `${normalizedBasePath}?${params.toString()}`;
}

export async function generateMetadata({ params, searchParams }) {
    const { id } = await params;
    const resolvedSearchParams = await searchParams;
    const sharedProduct = await getSharedProductById(id);

    if (!sharedProduct) {
        return {
            title: 'House Of Glass | Product',
            description: 'Open the House Of Glass product gallery and explore the catalog.'
        };
    }

    const previewSharePath = buildSharePreviewPath(sharedProduct.sharePath, resolvedSearchParams?.wa_share);

    return {
        title: `${sharedProduct.title} | House Of Glass`,
        description: sharedProduct.description,
        alternates: {
            canonical: sharedProduct.sharePath
        },
        openGraph: {
            title: sharedProduct.title,
            description: sharedProduct.description,
            url: previewSharePath,
            siteName: 'House Of Glass',
            type: 'website'
        },
        twitter: {
            card: 'summary_large_image',
            title: sharedProduct.title,
            description: sharedProduct.description
        }
    };
}

export default async function ProductSharePage({ params }) {
    const { id } = await params;
    const sharedProduct = await getSharedProductById(id);

    return (
        <ProductShareRedirect
            targetPath={sharedProduct?.targetPath || '/'}
            title={sharedProduct?.title || ''}
        />
    );
}