const { db } = require('./_firebaseAdmin');

function inferProvider(url = '') {
    if (!url) return 'unknown';
    if (url.startsWith('data:')) return 'data-uri';
    if (url.includes('ik.imagekit.io')) return 'imagekit';
    if (url.includes('cloudinary.com')) return 'cloudinary';
    return 'external';
}

function normalizeMediaRecord(record) {
    if (typeof record === 'string') {
        return {
            provider: inferProvider(record),
            primaryUrl: record,
            fallbackUrl: '',
            url: record
        };
    }

    const primaryUrl = record?.primaryUrl || record?.url || record?.fallbackUrl || '';
    return {
        provider: record?.provider || inferProvider(primaryUrl),
        primaryUrl,
        fallbackUrl: record?.fallbackUrl || '',
        url: record?.url || primaryUrl,
        fileId: record?.fileId || '',
        filePath: record?.filePath || ''
    };
}

function normalizeMediaCollection(imageDetails = [], imageUrls = []) {
    const source = Array.isArray(imageDetails) && imageDetails.length > 0
        ? imageDetails
        : Array.isArray(imageUrls) ? imageUrls : [];
    const items = source.map(normalizeMediaRecord);
    return {
        items,
        urls: items.map((item) => item.primaryUrl || item.url || item.fallbackUrl).filter(Boolean)
    };
}

function normalizeVariant(variant = {}) {
    const legacyImages = Array.isArray(variant.images) && variant.images.length > 0
        ? variant.images
        : (variant.image ? [variant.image] : []);
    const normalized = normalizeMediaCollection(variant.imageDetails, legacyImages);

    return {
        ...variant,
        imageDetails: normalized.items,
        images: normalized.urls,
        image: normalized.urls[0] || ''
    };
}

function normalizeProduct(product = {}) {
    const normalized = normalizeMediaCollection(product.imageDetails, product.images || []);
    const variants = Array.isArray(product.variants) ? product.variants.map(normalizeVariant) : [];

    return {
        ...product,
        imageDetails: normalized.items,
        images: normalized.urls,
        variants
    };
}

module.exports = async (req, res) => {
    // Enable CORS for external systems (HG System)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow any domain (Change to specific IP later if needed)
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'Product Code is required' });
    }

    try {
        const snapshot = await db.collection('products')
            .where('code', '==', code)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = normalizeProduct(snapshot.docs[0].data());
        
        // Return structured data for the Media Provider contract
        return res.status(200).json({
            code: code,
            name: product.name,
            images: product.images || [],
            imageDetails: product.imageDetails || [],
            variants: product.variants || []
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};
