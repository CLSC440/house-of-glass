import { getOrderAmount, getOrderCustomerName, getOrderCustomerPhone, getOrderExternalRef } from '@/lib/utils/admin-orders';

const DEFAULT_SIDEUP_BASE_URL = 'https://portal.eg.sideup.co/api/merchants';
const DEFAULT_SIDEUP_TENANT = 'eg';
const DEFAULT_PAYLOAD_STRATEGY = 'postman-first';
const LOOKUP_CACHE_TTL_MS = 10 * 60 * 1000;
const AUTH_TOKEN_SKEW_MS = 60 * 1000;

const publicLookupCache = new Map();
let cachedAuthToken = null;

const GOVERNORATE_ALIAS_GROUPS = Object.freeze([
    ['القاهرة', 'cairo', 'greater cairo', 'cairo giza'],
    ['الجيزة', 'giza', 'greater cairo', 'cairo giza'],
    ['القليوبية', 'qalyubia', 'qalyoubia', 'qalubia'],
    ['الإسكندرية', 'alexandria', 'alex'],
    ['البحيرة', 'beheira', 'behira', 'el beheira'],
    ['كفر الشيخ', 'kafr el sheikh', 'kafr elsheikh'],
    ['الدقهلية', 'dakahlia', 'dakahliya', 'dakahlya'],
    ['دمياط', 'damietta'],
    ['الغربية', 'gharbia', 'gharbiya'],
    ['الشرقية', 'sharkia', 'sharqia'],
    ['المنوفية', 'menoufia', 'monufia', 'monofia'],
    ['الإسماعيلية', 'ismailia', 'ismailiya'],
    ['السويس', 'suez'],
    ['بورسعيد', 'port said'],
    ['الفيوم', 'fayoum', 'faiyum'],
    ['بني سويف', 'beni suef', 'bani suef'],
    ['المنيا', 'minya'],
    ['أسيوط', 'assiut', 'asyut'],
    ['سوهاج', 'sohag'],
    ['قنا', 'qena', 'qina'],
    ['الأقصر', 'luxor'],
    ['أسوان', 'aswan'],
    ['البحر الأحمر', 'red sea'],
    ['الوادي الجديد', 'new valley'],
    ['مطروح', 'matrouh', 'marsa matrouh'],
    ['شمال سيناء', 'north sinai'],
    ['جنوب سيناء', 'south sinai']
]);

const GOVERNORATE_ALIAS_LOOKUP = GOVERNORATE_ALIAS_GROUPS.reduce((accumulator, group) => {
    const normalizedGroup = Array.from(new Set(group.map((value) => normalizeLookupValue(value)).filter(Boolean)));
    normalizedGroup.forEach((key) => {
        accumulator.set(key, normalizedGroup);
    });
    return accumulator;
}, new Map());

function createError(status, message, code, details) {
    const error = new Error(message);
    error.status = status;
    error.code = code || 'sideup_error';
    if (details && typeof details === 'object') {
        error.details = details;
    }
    return error;
}

function removeUndefinedFields(payload = {}) {
    return Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined)
    );
}

function normalizeLookupValue(value) {
    return String(value ?? '')
        .replace(/^eg_(cities|areas)\./i, '')
        .replace(/&/g, ' ')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u200e\u200f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildNormalizedCandidates(values = []) {
    return Array.from(new Set(
        values
            .flatMap((value) => Array.isArray(value) ? value : [value])
            .map((value) => normalizeLookupValue(value))
            .filter(Boolean)
    ));
}

function tokenizeLookupValue(value) {
    return normalizeLookupValue(value).split(' ').filter(Boolean);
}

function countTokenOverlap(left = '', right = '') {
    const leftTokens = new Set(tokenizeLookupValue(left));
    const rightTokens = new Set(tokenizeLookupValue(right));
    let overlap = 0;

    leftTokens.forEach((token) => {
        if (rightTokens.has(token)) {
            overlap += 1;
        }
    });

    return overlap;
}

function scoreCandidateMatch(candidateValues = [], queryValues = []) {
    let bestScore = 0;

    queryValues.forEach((queryValue) => {
        candidateValues.forEach((candidateValue) => {
            if (!queryValue || !candidateValue) {
                return;
            }

            if (candidateValue === queryValue) {
                bestScore = Math.max(bestScore, 100);
                return;
            }

            if (candidateValue.includes(queryValue) || queryValue.includes(candidateValue)) {
                bestScore = Math.max(bestScore, 72);
            }

            const overlap = countTokenOverlap(candidateValue, queryValue);
            if (overlap > 0) {
                bestScore = Math.max(bestScore, 40 + overlap);
            }
        });
    });

    return bestScore;
}

function getGovernorateMatchCandidates(governorate) {
    const normalizedGovernorate = normalizeLookupValue(governorate);
    const aliases = GOVERNORATE_ALIAS_LOOKUP.get(normalizedGovernorate) || [];
    return Array.from(new Set([normalizedGovernorate, ...aliases].filter(Boolean)));
}

function getOrderGovernorate(order = {}) {
    return String(
        order.governorate
        || order.customerInfo?.governorate
        || order.customer?.governorate
        || ''
    ).trim();
}

function getOrderDistrict(order = {}) {
    return String(
        order.shippingDistrict
        || order.customerInfo?.shippingDistrict
        || order.customer?.shippingDistrict
        || order.shippingRecipient?.district
        || ''
    ).trim();
}

function getOrderShippingAddress(order = {}) {
    return String(
        order.shippingAddress
        || order.customerInfo?.shippingAddress
        || order.customer?.shippingAddress
        || order.shippingRecipient?.address
        || ''
    ).trim();
}

function getOrderEmail(order = {}) {
    return String(
        order.customer?.email
        || order.customerInfo?.email
        || ''
    ).trim();
}

function getOrderLandmark(order = {}) {
    return String(
        order.shippingRecipient?.landmark
        || order.customerInfo?.landmark
        || order.customer?.landmark
        || ''
    ).trim();
}

function normalizePhoneNumber(value) {
    return String(value ?? '').replace(/[^\d+]/g, '').trim();
}

function formatOrderAmount(order = {}) {
    const amount = Number(getOrderAmount(order));
    if (!Number.isFinite(amount)) {
        return 0;
    }

    return Math.max(0, Math.round(amount * 100) / 100);
}

function buildOrderItemDescription(order = {}) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) {
        return `Order ${getOrderExternalRef(order) || order.id || ''}`.trim() || 'Website order';
    }

    const parts = items.slice(0, 4).map((item) => {
        const quantity = Number(item?.quantity || 1);
        const name = String(item?.title || item?.name || item?.variantLabel || 'Item').trim();
        return `${Number.isFinite(quantity) && quantity > 1 ? `${quantity}x ` : ''}${name}`.trim();
    }).filter(Boolean);

    if (items.length > 4) {
        parts.push(`+${items.length - 4} more`);
    }

    return parts.join(', ');
}

function getSideUpBaseUrl() {
    return String(process.env.SIDEUP_BASE_URL || DEFAULT_SIDEUP_BASE_URL).trim().replace(/\/+$/, '');
}

function getSideUpConfig() {
    return {
        baseUrl: getSideUpBaseUrl(),
        tenant: String(process.env.SIDEUP_TENANT || DEFAULT_SIDEUP_TENANT).trim() || DEFAULT_SIDEUP_TENANT,
        apiToken: String(process.env.SIDEUP_API_TOKEN || '').trim(),
        email: String(process.env.SIDEUP_EMAIL || '').trim(),
        password: String(process.env.SIDEUP_PASSWORD || '').trim(),
        courierName: String(process.env.SIDEUP_COURIER_NAME || '').trim(),
        courierId: Number(process.env.SIDEUP_COURIER_ID),
        pickupLocationId: Number(process.env.SIDEUP_PICKUP_LOCATION_ID),
        payloadStrategy: String(process.env.SIDEUP_ORDER_PAYLOAD_STRATEGY || DEFAULT_PAYLOAD_STRATEGY).trim().toLowerCase() || DEFAULT_PAYLOAD_STRATEGY
    };
}

export function hasSideUpCreateCredentials() {
    const config = getSideUpConfig();
    return Boolean(config.apiToken || (config.email && config.password));
}

async function readCachedLookup(cacheKey, loader, ttlMs = LOOKUP_CACHE_TTL_MS) {
    const cachedEntry = publicLookupCache.get(cacheKey);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
        return cachedEntry.value;
    }

    const value = await loader();
    publicLookupCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + ttlMs
    });
    return value;
}

function extractErrorMessage(payload, fallbackMessage) {
    if (!payload || typeof payload !== 'object') {
        return fallbackMessage;
    }

    if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message.trim();
    }

    if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error.trim();
    }

    if (payload.errors && typeof payload.errors === 'object') {
        const firstMessage = Object.values(payload.errors)
            .flatMap((value) => Array.isArray(value) ? value : [value])
            .find((value) => typeof value === 'string' && value.trim());

        if (firstMessage) {
            return firstMessage.trim();
        }
    }

    return fallbackMessage;
}

async function sideupFetch(path, { method = 'GET', body, auth = 'none', headers = {} } = {}) {
    const config = getSideUpConfig();
    const requestHeaders = {
        Accept: 'application/json',
        'x-tenant': config.tenant,
        ...headers
    };

    if (body !== undefined) {
        requestHeaders['Content-Type'] = 'application/json';
    }

    if (auth === 'required') {
        const accessToken = await getSideUpAccessToken(config);
        requestHeaders.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${config.baseUrl}${path}`, {
        method,
        headers: requestHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store'
    });

    const contentType = response.headers.get('content-type') || '';
    const rawBody = await response.text();
    const payload = contentType.includes('application/json')
        ? JSON.parse(rawBody || '{}')
        : rawBody;

    if (!response.ok) {
        throw createError(
            response.status,
            extractErrorMessage(typeof payload === 'object' ? payload : {}, `SideUp request failed with status ${response.status}`),
            'sideup_upstream_error',
            typeof payload === 'object' ? payload : { rawBody }
        );
    }

    return payload;
}

async function getSideUpAccessToken(config = getSideUpConfig()) {
    if (config.apiToken) {
        return config.apiToken;
    }

    if (cachedAuthToken && cachedAuthToken.expiresAt > Date.now()) {
        return cachedAuthToken.token;
    }

    if (!config.email || !config.password) {
        throw createError(500, 'SideUp credentials are not configured on the server', 'sideup_config_missing');
    }

    const payload = await sideupFetch('/login', {
        method: 'POST',
        auth: 'none',
        body: {
            email: config.email,
            password: config.password
        }
    });

    const token = String(payload?.data?.access_token || '').trim();
    const expiresInSeconds = Number(payload?.data?.expires_in || 3600);

    if (!token) {
        throw createError(500, 'SideUp login succeeded without returning an access token', 'sideup_token_missing');
    }

    cachedAuthToken = {
        token,
        expiresAt: Date.now() + Math.max(0, (Number.isFinite(expiresInSeconds) ? expiresInSeconds : 3600) * 1000 - AUTH_TOKEN_SKEW_MS)
    };

    return token;
}

export async function listSideUpCities() {
    return readCachedLookup('sideup:cities', async () => {
        const payload = await sideupFetch('/city');
        return Array.isArray(payload?.data) ? payload.data : [];
    });
}

export async function listSideUpZones() {
    return readCachedLookup('sideup:zones', async () => {
        const payload = await sideupFetch('/zone');
        return Array.isArray(payload?.data) ? payload.data : [];
    });
}

export async function listSideUpAreasByZone(zoneId) {
    const normalizedZoneId = Number(zoneId);
    if (!Number.isFinite(normalizedZoneId) || normalizedZoneId <= 0) {
        throw createError(400, 'A valid SideUp zone id is required', 'sideup_zone_id_required');
    }

    return readCachedLookup(`sideup:areas:${normalizedZoneId}`, async () => {
        const payload = await sideupFetch(`/area/${normalizedZoneId}`);
        return Array.isArray(payload?.data) ? payload.data : [];
    });
}

function buildCityCandidateValues(city = {}) {
    return buildNormalizedCandidates([
        city.name,
        city.name_ar
    ]);
}

function buildAreaCandidateValues(area = {}) {
    return buildNormalizedCandidates([
        area.name,
        area.name_ar
    ]);
}

export async function resolveSideUpCity(governorate) {
    const cities = await listSideUpCities();
    const queryValues = getGovernorateMatchCandidates(governorate);
    if (queryValues.length === 0) {
        throw createError(400, 'The order is missing a governorate for SideUp lookup', 'sideup_governorate_required');
    }

    const rankedMatches = cities
        .map((city) => ({
            city,
            score: scoreCandidateMatch(buildCityCandidateValues(city), queryValues)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || Number(left.city?.id || 0) - Number(right.city?.id || 0));

    if (rankedMatches.length === 0) {
        throw createError(409, `SideUp does not have a city match for governorate "${governorate}"`, 'sideup_city_match_required');
    }

    return rankedMatches[0].city;
}

export async function listSideUpAreasForCity(city) {
    if (!city?.id) {
        throw createError(400, 'A SideUp city is required before loading areas', 'sideup_city_required');
    }

    const zones = await listSideUpZones();
    const zoneAreas = await Promise.all(
        zones.map(async (zone) => {
            const areas = await listSideUpAreasByZone(zone.id);
            return areas.map((area) => ({
                ...area,
                sideupZoneId: Number(area?.pivot?.zone_id || zone.id),
                sideupZoneName: String(zone.name || area?.zone?.name || '').trim()
            }));
        })
    );

    const allAreas = zoneAreas.flat();
    const filteredAreas = allAreas.filter((area) => {
        const areaCityId = area?.city_id == null ? null : Number(area.city_id);
        if (areaCityId === Number(city.id)) {
            return true;
        }

        return Number(city.id) === 30 && areaCityId == null;
    });

    const uniqueAreas = new Map();
    filteredAreas.forEach((area) => {
        const areaId = Number(area?.id);
        if (Number.isFinite(areaId) && !uniqueAreas.has(areaId)) {
            uniqueAreas.set(areaId, area);
        }
    });

    return Array.from(uniqueAreas.values());
}

function buildAreaQueryValues({ areaHint = '', districtName = '', address = '' } = {}) {
    const addressSegments = String(address || '')
        .split(/[|,،]/)
        .map((value) => value.trim())
        .filter(Boolean);

    return buildNormalizedCandidates([
        areaHint,
        districtName,
        ...addressSegments
    ]);
}

export async function resolveSideUpArea({ city, areaHint = '', districtName = '', address = '' } = {}) {
    const areas = await listSideUpAreasForCity(city);
    if (areas.length === 0) {
        throw createError(409, `SideUp does not expose any areas for ${city?.name || 'this city'}`, 'sideup_area_lookup_failed');
    }

    if (areas.length === 1) {
        return areas[0];
    }

    const queryValues = buildAreaQueryValues({ areaHint, districtName, address });
    const rankedMatches = areas
        .map((area) => ({
            area,
            score: scoreCandidateMatch(buildAreaCandidateValues(area), queryValues)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || Number(left.area?.id || 0) - Number(right.area?.id || 0));

    if (rankedMatches.length === 0 || rankedMatches[0].score < 72) {
        throw createError(
            409,
            `SideUp needs the area name for ${String(city?.name || '').replace(/^eg_cities\./i, '')}. Enter the district or area using SideUp naming and retry.`,
            'sideup_area_match_required',
            {
                cityId: Number(city?.id || 0) || undefined,
                cityName: String(city?.name || '').replace(/^eg_cities\./i, ''),
                availableAreas: areas.map((area) => ({ id: area.id, name: area.name })),
                availableAreaNames: areas.map((area) => area.name).filter(Boolean)
            }
        );
    }

    return rankedMatches[0].area;
}

function buildPreviewLocation({ city, area }) {
    return {
        city: {
            id: Number(city?.id || 0) || undefined,
            name: String(city?.name || '').replace(/^eg_cities\./i, '') || undefined
        },
        area: {
            id: Number(area?.id || 0) || undefined,
            name: String(area?.name || '').trim() || undefined
        },
        zone: {
            id: Number(area?.sideupZoneId || area?.pivot?.zone_id || 0) || undefined,
            name: String(area?.sideupZoneName || '').trim() || undefined
        }
    };
}

function buildPostmanOrderPayload(order = {}, preview = {}, config = getSideUpConfig()) {
    const recipientName = getOrderCustomerName(order);
    const recipientPhone = normalizePhoneNumber(getOrderCustomerPhone(order));
    const shippingAddress = getOrderShippingAddress(order);
    const amount = formatOrderAmount(order);

    return removeUndefinedFields({
        name: recipientName || undefined,
        phone: recipientPhone || undefined,
        address: shippingAddress || undefined,
        area_id: preview?.location?.area?.id,
        shipment_code: getOrderExternalRef(order) || order.id || undefined,
        item_description: buildOrderItemDescription(order),
        total_cash_collection: amount,
        courier: config.courierName || undefined,
        zero_cash_collection: amount <= 0,
        landmark: getOrderLandmark(order) || undefined,
        notes: order.customerNotes || order.notes || undefined,
        userId: order.userId || undefined,
        email: getOrderEmail(order) || undefined,
        isNewDashboard: true,
        online_payment: 'cod',
        reverse_order: 0
    });
}

function buildSwaggerOrderPayload(order = {}, preview = {}, config = getSideUpConfig()) {
    const recipientName = getOrderCustomerName(order);
    const recipientPhone = normalizePhoneNumber(getOrderCustomerPhone(order));
    const shippingAddress = getOrderShippingAddress(order);
    const amount = formatOrderAmount(order);
    const courierId = Number.isFinite(config.courierId) ? config.courierId : undefined;
    const pickupLocationId = Number.isFinite(config.pickupLocationId) ? config.pickupLocationId : undefined;

    return removeUndefinedFields({
        receiver_name: recipientName || undefined,
        receiver_phone: recipientPhone || undefined,
        receiver_address: shippingAddress || undefined,
        drop: removeUndefinedFields({
            zone: preview?.location?.zone?.id,
            city: preview?.location?.city?.id,
            area: preview?.location?.area?.id
        }),
        item_cost: amount,
        description: buildOrderItemDescription(order),
        notes: order.customerNotes || order.notes || undefined,
        courier_id: courierId,
        pickup_location: pickupLocationId
    });
}

function getPayloadStrategyOrder(payloadStrategy) {
    const normalizedStrategy = String(payloadStrategy || DEFAULT_PAYLOAD_STRATEGY).trim().toLowerCase();

    if (normalizedStrategy === 'swagger') {
        return ['swagger'];
    }

    if (normalizedStrategy === 'swagger-first') {
        return ['swagger', 'postman'];
    }

    if (normalizedStrategy === 'postman') {
        return ['postman'];
    }

    return ['postman', 'swagger'];
}

function normalizeCreateResult(apiPayload = {}, preview = {}, usedPayloadFormat = '') {
    const data = apiPayload && typeof apiPayload.data === 'object' ? apiPayload.data : {};

    return removeUndefinedFields({
        message: apiPayload?.message || 'SideUp order created successfully',
        orderId: Number(data?.id || 0) || undefined,
        shipmentCode: String(data?.shipment_code || preview?.payloads?.postman?.shipment_code || '').trim() || undefined,
        status: String(data?.status || '').trim() || undefined,
        courierId: Number(data?.courier_id || 0) || undefined,
        cityId: preview?.location?.city?.id,
        cityName: preview?.location?.city?.name,
        areaId: preview?.location?.area?.id,
        areaName: preview?.location?.area?.name,
        zoneId: preview?.location?.zone?.id,
        zoneName: preview?.location?.zone?.name,
        payloadFormat: usedPayloadFormat || undefined
    });
}

export async function buildSideUpOrderPreview(order = {}, { areaHint = '' } = {}) {
    const governorate = getOrderGovernorate(order);
    const districtName = getOrderDistrict(order);
    const shippingAddress = getOrderShippingAddress(order);

    if (!governorate) {
        throw createError(400, 'This order is missing a governorate for SideUp', 'sideup_governorate_required');
    }

    if (!shippingAddress) {
        throw createError(400, 'This order is missing a shipping address for SideUp', 'sideup_address_required');
    }

    const city = await resolveSideUpCity(governorate);
    const area = await resolveSideUpArea({
        city,
        areaHint,
        districtName,
        address: shippingAddress
    });

    const preview = {
        governorate,
        districtName,
        areaHint: areaHint || undefined,
        location: buildPreviewLocation({ city, area })
    };

    return {
        ...preview,
        payloads: {
            postman: buildPostmanOrderPayload(order, preview),
            swagger: buildSwaggerOrderPayload(order, preview)
        }
    };
}

export async function createSideUpOrderForOrder(order = {}, { areaHint = '' } = {}) {
    if (!hasSideUpCreateCredentials()) {
        throw createError(500, 'SideUp credentials are not configured on the server', 'sideup_config_missing');
    }

    const config = getSideUpConfig();
    const preview = await buildSideUpOrderPreview(order, { areaHint });
    const payloadsByFormat = {
        postman: preview.payloads.postman,
        swagger: preview.payloads.swagger
    };

    const attemptedFormats = [];
    let lastError = null;

    for (const payloadFormat of getPayloadStrategyOrder(config.payloadStrategy)) {
        attemptedFormats.push(payloadFormat);

        try {
            const apiPayload = await sideupFetch('/order/store', {
                method: 'POST',
                auth: 'required',
                body: payloadsByFormat[payloadFormat]
            });

            return {
                preview,
                result: normalizeCreateResult(apiPayload, preview, payloadFormat),
                usedPayloadFormat: payloadFormat
            };
        } catch (error) {
            lastError = error;
            if (!Number.isFinite(Number(error?.status)) || Number(error.status) < 400 || Number(error.status) >= 500) {
                throw error;
            }
        }
    }

    if (lastError) {
        lastError.details = removeUndefinedFields({
            ...(lastError.details || {}),
            attemptedFormats: attemptedFormats.length > 0 ? attemptedFormats : undefined
        });
        throw lastError;
    }

    throw createError(500, 'SideUp order creation failed before any payload was attempted', 'sideup_create_failed');
}