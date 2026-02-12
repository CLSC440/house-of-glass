const admin = require('firebase-admin');

// Initialize Firebase Admin only once
if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Production: Use environment variable containing the full JSON object
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (e) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT", e);
        }
    } else {
        // Fallback or Local Development (Warning: Set env vars locally to test)
        console.warn("No FIREBASE_SERVICE_ACCOUNT found. API will likely fail.");
    }
}

const db = admin.firestore();

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

        const product = snapshot.docs[0].data();
        
        // Return structured data for the Media Provider contract
        return res.status(200).json({
            code: code,
            name: product.name,
            images: product.images || [],
            variants: product.variants || []
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};
