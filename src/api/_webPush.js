const crypto = require('crypto');
const webpush = require('web-push');

let configured = false;

function getWebPushConfig() {
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';
    const contact = process.env.WEB_PUSH_CONTACT_EMAIL || 'mailto:admin@houseofglass.app';

    return {
        publicKey: String(publicKey || '').trim(),
        privateKey: String(privateKey || '').trim(),
        contact: String(contact || '').trim()
    };
}

function isWebPushConfigured() {
    const config = getWebPushConfig();
    return Boolean(config.publicKey && config.privateKey);
}

function ensureWebPushConfigured() {
    if (configured || !isWebPushConfigured()) {
        return;
    }

    const config = getWebPushConfig();
    webpush.setVapidDetails(config.contact, config.publicKey, config.privateKey);
    configured = true;
}

function buildPushSubscriptionId(userId, endpoint) {
    const uid = String(userId || '').trim();
    const normalizedEndpoint = String(endpoint || '').trim();
    const hash = crypto.createHash('sha256').update(normalizedEndpoint).digest('hex');
    return `${uid}_${hash}`;
}

async function sendWebPushNotification(subscription, payload) {
    ensureWebPushConfigured();
    return webpush.sendNotification(subscription, JSON.stringify(payload));
}

module.exports = {
    buildPushSubscriptionId,
    getWebPushConfig,
    isWebPushConfigured,
    sendWebPushNotification
};