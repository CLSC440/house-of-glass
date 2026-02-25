const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8000;

// ========== Middleware ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ========== In-Memory Cache for Pricing ==========
let priceCache = null;
let priceCacheTTL = 0;
const CACHE_DURATION_MS = 300000; // 5 minutes

// ========== API ENDPOINTS ==========

// Pricing Proxy
app.post('/api/pricing-proxy', async (req, res) => {
    console.log('📦 POST /api/pricing-proxy received');
    
    const { codes } = req.body;

    if (!Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ error: 'codes array required' });
    }

    try {
        const now = Date.now();
        
        // Check cache first
        if (priceCache && (now - priceCacheTTL < CACHE_DURATION_MS)) {
            console.log('✅ Returning cached prices');
            const filtered = {};
            codes.forEach(code => {
                const normalized = String(code).trim().toUpperCase();
                filtered[normalized] = priceCache[normalized] || null;
            });
            return res.status(200).json({
                cached: true,
                data: filtered,
                timestamp: new Date().toISOString()
            });
        }

        // Fetch from HG System
        console.log('🔄 Fetching from HG System...');
        const response = await fetch('https://glass-system-backend.onrender.com/public/products', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            console.error('HG System error:', response.status);
            if (priceCache) {
                console.warn('⚠️ Using stale cache');
                return res.status(200).json({
                    cached: true,
                    stale: true,
                    data: priceCache,
                    warning: 'Using cached data - HG System unavailable'
                });
            }
            throw new Error('HG API error: ' + response.status);
        }

        const allProducts = await response.json();
        const priceMap = {};

        if (Array.isArray(allProducts)) {
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
        }

        // Cache the result
        priceCache = priceMap;
        priceCacheTTL = now;
        console.log(`✅ Cached ${Object.keys(priceMap).length} products`);

        // Filter for requested codes
        const filtered = {};
        codes.forEach(code => {
            const normalized = String(code).trim().toUpperCase();
            filtered[normalized] = priceMap[normalized] || null;
        });

        return res.status(200).json({
            cached: false,
            data: filtered,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Proxy Error:', error);
        
        if (priceCache) {
            console.warn('⚠️ Error - falling back to stale cache');
            return res.status(200).json({
                cached: true,
                stale: true,
                data: priceCache,
                warning: 'Using stale cache due to error',
                error: error.message
            });
        }

        return res.status(503).json({
            error: 'Pricing service unavailable',
            message: error.message
        });
    }
});

// Media Endpoint
app.get('/api/media', async (req, res) => {
    console.log('🖼️  GET /api/media received');
    
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'Product Code is required' });
    }

    try {
        // For now, return mock data
        // In production, this would query Firebase
        return res.status(200).json({
            code: code,
            name: `Product ${code}`,
            images: [],
            variants: []
        });
    } catch (error) {
        console.error('Media Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== SPA Fallback ==========
app.use((req, res) => {
    console.log(`📄 Serving index.html for ${req.path}`);
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== Error Handler ==========
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ========== Start Server ==========
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║   🚀 Gallery Website Dev Server      ║
║   Listening on http://localhost:8000 ║
║   APIs: POST /api/pricing-proxy      ║
║         GET  /api/media              ║
║   Press Ctrl+C to stop               ║
╚══════════════════════════════════════╝
    `);
});

process.on('SIGINT', () => {
    console.log('\n✋ Server stopped');
    process.exit(0);
});
