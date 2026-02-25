const admin = require('firebase-admin');

// Initialize Firebase Admin only once
if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (e) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT", e);
        }
    }
}

const db = admin.firestore();

// In-memory cache with TTL (Time To Live)
let priceCache = null;
let priceCacheTTL = 0;
const CACHE_DURATION_MS = 300000; // 5 minutes cache

/**
 * Pricing Proxy - Fetch prices from HG System securely
 * 
 * ✅ Performance: Caching enabled (5 min TTL)
 * ✅ Security: CORS restricted, Input validated, Domain verified
 * ✅ Reliability: Error handling, Timeout protection
 */
module.exports = async (req, res) => {
    // ========== SECURITY: CORS Configuration ==========
    const allowedOrigins = [
        'https://house-of-glass-phi.vercel.app',
        'http://localhost:3000',
        'http://localhost:8000',
        'http://localhost:5000',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8000',
        'http://127.0.0.1:5000'
    ];

    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '3600'); // Cache preflight for 1 hour
    
    // ========== Security Headers ==========
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ========== INPUT VALIDATION ==========
    const { codes } = req.body;

    if (!Array.isArray(codes)) {
        return res.status(400).json({ error: 'codes must be an array' });
    }

    if (codes.length === 0) {
        return res.status(400).json({ error: 'codes array cannot be empty' });
    }

    if (codes.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 codes per request' });
    }

    // Validate each code is a string
    if (!codes.every(c => typeof c === 'string' && c.trim().length > 0)) {
        return res.status(400).json({ error: 'All codes must be non-empty strings' });
    }

    try {
        // ========== CACHING: Check cache first ==========
        const now = Date.now();
        if (priceCache && (now - priceCacheTTL < CACHE_DURATION_MS)) {
            console.log(`📦 Using cached prices (${CACHE_DURATION_MS/1000}s TTL)`);
            return res.status(200).json(filterPrices(priceCache, codes));
        }

        // ========== FETCH: Get fresh data from HG System ==========
        console.log(`🔄 Fetching fresh prices from HG System...`);
        
        const fetchPromise = fetch('https://glass-system-backend.onrender.com/public/products', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Gallery-Pricing-Proxy/1.0'
            },
            // Add timeout protection
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        const response = await fetchPromise;

        if (!response.ok) {
            console.error(`HG System returned status: ${response.status}`);
            
            // If HG is down, try to use stale cache
            if (priceCache) {
                console.warn(`⚠️ HG System error, falling back to stale cache`);
                return res.status(200).json(filterPrices(priceCache, codes));
            }
            
            throw new Error(`HG API Error: ${response.status}`);
        }

        const allProducts = await response.json();

        if (!Array.isArray(allProducts)) {
            throw new Error('Invalid response format from HG System');
        }

        // ========== PROCESS: Build price map ==========
        const priceMap = {};
        
        allProducts.forEach(product => {
            const code = String(product.barcode || product.code || product.product_code || '').trim().toUpperCase();
            
            if (code) {
                priceMap[code] = {
                    price: parseFloat(product.retail_price || product.sectorSalesPrice || product.price || 0),
                    stock: parseInt(product.stock || 0),
                    wholesale: parseFloat(product.wholesale_price || product.wholesalePrice || 0),
                    discount: parseFloat(product.discount_amount || product.discount || 0)
                };
            }
        });

        // ========== CACHE: Store for next requests ==========
        priceCache = priceMap;
        priceCacheTTL = now;
        console.log(`✅ Cached ${Object.keys(priceMap).length} products`);

        // ========== RESPONSE: Filter and return ==========
        const filtered = filterPrices(priceMap, codes);
        
        return res.status(200).json({
            cached: false,
            data: filtered,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Pricing Proxy Error:", error);

        // If we have stale cache, return it with warning
        if (priceCache) {
            console.warn(`⚠️ Error occurred, returning stale cache`);
            return res.status(200).json({
                cached: true,
                stale: true,
                data: filterPrices(priceCache, codes),
                warning: 'Using cached data - HG System unavailable',
                timestamp: new Date().toISOString()
            });
        }

        // No cache available - return error
        return res.status(503).json({
            error: 'Pricing service temporarily unavailable',
            message: error.message
        });
    }
};

/**
 * Filter prices for requested codes only (Privacy + Performance)
 */
function filterPrices(priceMap, codes) {
    const filtered = {};
    
    codes.forEach(code => {
        const normalized = String(code).trim().toUpperCase();
        filtered[normalized] = priceMap[normalized] || null;
    });
    
    return filtered;
}
