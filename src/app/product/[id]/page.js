import ProductShareRedirect from './ProductShareRedirect';
import { getSharedProductById } from '@/lib/server/product-share';

export async function generateMetadata({ params }) {
    const { id } = await params;
    const sharedProduct = await getSharedProductById(id);

    if (!sharedProduct) {
        return {
            title: 'House Of Glass | Product',
            description: 'Open the House Of Glass product gallery and explore the catalog.'
        };
    }

    return {
        title: `${sharedProduct.title} | House Of Glass`,
        description: sharedProduct.description,
        alternates: {
            canonical: sharedProduct.targetPath
        },
        openGraph: {
            title: sharedProduct.title,
            description: sharedProduct.description,
            url: sharedProduct.sharePath,
            siteName: 'House Of Glass',
            type: 'website'
        },
        twitter: {
            card: 'summary_large_image',
            title: sharedProduct.title,
            description: sharedProduct.description,
            images: [`${sharedProduct.sharePath}/opengraph-image`]
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