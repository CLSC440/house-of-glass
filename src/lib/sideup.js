import { getOrderAmount, getOrderCustomerName, getOrderCustomerPhone, getOrderExternalRef } from '@/lib/utils/admin-orders';
import { getTranslatedSideUpAreaName, getTranslatedSideUpCityName, getTranslatedSideUpZoneName } from '@/lib/sideup-translations';

const DEFAULT_SIDEUP_BASE_URL = 'https://portal.eg.sideup.co/api/merchants';
const DEFAULT_SIDEUP_PRICING_BASE_URL = 'https://pricing-service.sideup.co/api';
const DEFAULT_SIDEUP_IDENTITY_BASE_URL = 'https://identity-service.sideup.co';
const DEFAULT_SIDEUP_TENANT = 'eg';
const DEFAULT_SIDEUP_SERVICE_CLIENT_ID = '1';
const DEFAULT_SIDEUP_SERVICE_CLIENT_SECRET = 'grZghAFrwCexTkMmuF7NtHDYluaza4atyk0pjbm7';
const DEFAULT_PAYLOAD_STRATEGY = 'postman-first';
const DEFAULT_SIDEUP_PRICING_WEIGHT_KG = 1;
const DEFAULT_SIDEUP_PRICING_PAYMENT_METHOD = 'PREPAID';
const LOOKUP_CACHE_TTL_MS = 10 * 60 * 1000;
const AUTH_TOKEN_SKEW_MS = 60 * 1000;

const publicLookupCache = new Map();
let cachedAuthToken = null;
let cachedServiceToken = null;

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

function getFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function getPositiveNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeSideUpLabel(value) {
    return String(value ?? '').replace(/^eg_(cities|areas)\./i, '').trim();
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
    const trimmed = String(value ?? '').trim();
    const digits = trimmed.replace(/\D/g, '');

    if (/^20\d{10}$/.test(digits)) {
        return `0${digits.slice(2)}`;
    }

    if (/^1[0125]\d{8}$/.test(digits)) {
        return `0${digits}`;
    }

    if (/^01[0125]\d{8}$/.test(digits)) {
        return digits;
    }

    return trimmed.replace(/[^\d+]/g, '').trim();
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

function getSideUpPricingBaseUrl() {
    return String(process.env.SIDEUP_PRICING_BASE_URL || DEFAULT_SIDEUP_PRICING_BASE_URL).trim().replace(/\/+$/, '');
}

function getSideUpIdentityBaseUrl() {
    return String(process.env.SIDEUP_IDENTITY_BASE_URL || DEFAULT_SIDEUP_IDENTITY_BASE_URL).trim().replace(/\/+$/, '');
}

function getSideUpConfig() {
    return {
        baseUrl: getSideUpBaseUrl(),
        pricingBaseUrl: getSideUpPricingBaseUrl(),
        identityBaseUrl: getSideUpIdentityBaseUrl(),
        tenant: String(process.env.SIDEUP_TENANT || DEFAULT_SIDEUP_TENANT).trim() || DEFAULT_SIDEUP_TENANT,
        apiToken: String(process.env.SIDEUP_API_TOKEN || '').trim(),
        email: String(process.env.SIDEUP_EMAIL || '').trim(),
        password: String(process.env.SIDEUP_PASSWORD || '').trim(),
        serviceClientId: String(process.env.SIDEUP_SERVICE_CLIENT_ID || DEFAULT_SIDEUP_SERVICE_CLIENT_ID).trim() || DEFAULT_SIDEUP_SERVICE_CLIENT_ID,
        serviceClientSecret: String(process.env.SIDEUP_SERVICE_CLIENT_SECRET || DEFAULT_SIDEUP_SERVICE_CLIENT_SECRET).trim() || DEFAULT_SIDEUP_SERVICE_CLIENT_SECRET,
        courierName: String(process.env.SIDEUP_COURIER_NAME || '').trim(),
        courierId: Number(process.env.SIDEUP_COURIER_ID),
        pickupLocationId: Number(process.env.SIDEUP_PICKUP_LOCATION_ID),
        pricingWeightKg: Number(process.env.SIDEUP_PRICING_WEIGHT_KG || DEFAULT_SIDEUP_PRICING_WEIGHT_KG),
        pricingPaymentMethod: String(process.env.SIDEUP_PRICING_PAYMENT_METHOD || DEFAULT_SIDEUP_PRICING_PAYMENT_METHOD).trim().toUpperCase() || DEFAULT_SIDEUP_PRICING_PAYMENT_METHOD,
        pricingCodAmount: Number(process.env.SIDEUP_PRICING_COD_AMOUNT || 0),
        payloadStrategy: String(process.env.SIDEUP_ORDER_PAYLOAD_STRATEGY || DEFAULT_PAYLOAD_STRATEGY).trim().toLowerCase() || DEFAULT_PAYLOAD_STRATEGY
    };
}

export function hasSideUpCreateCredentials() {
    const config = getSideUpConfig();
    return Boolean(config.apiToken || (config.email && config.password));
}

export function hasSideUpPricingCredentials() {
    const config = getSideUpConfig();
    return Boolean(config.email && config.password && config.serviceClientId && config.serviceClientSecret);
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

    const nestedPayloadCandidates = [
        payload.data,
        payload.error,
        payload.errors,
        payload.status
    ].filter((value) => value && typeof value === 'object');

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

    for (const candidate of nestedPayloadCandidates) {
        if (typeof candidate.message === 'string' && candidate.message.trim()) {
            return candidate.message.trim();
        }

        if (typeof candidate.error === 'string' && candidate.error.trim()) {
            return candidate.error.trim();
        }

        const nestedFirstMessage = Object.values(candidate)
            .flatMap((value) => Array.isArray(value) ? value : [value])
            .find((value) => typeof value === 'string' && value.trim());

        if (nestedFirstMessage) {
            return nestedFirstMessage.trim();
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

async function getSideUpServiceToken(config = getSideUpConfig()) {
    if (cachedServiceToken && cachedServiceToken.expiresAt > Date.now()) {
        return cachedServiceToken.token;
    }

    if (!config.email || !config.password || !config.serviceClientId || !config.serviceClientSecret) {
        throw createError(500, 'SideUp pricing credentials are not configured on the server', 'sideup_pricing_config_missing');
    }

    const response = await fetch(`${config.identityBaseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-tenant': config.tenant
        },
        body: JSON.stringify({
            grant_type: 'password',
            scope: '*',
            client_id: config.serviceClientId,
            client_secret: config.serviceClientSecret,
            username: config.email,
            password: config.password,
            role: 'merchant'
        }),
        cache: 'no-store'
    });

    const rawBody = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? JSON.parse(rawBody || '{}')
        : { message: rawBody };

    if (!response.ok) {
        throw createError(
            response.status,
            extractErrorMessage(payload, `SideUp pricing auth failed with status ${response.status}`),
            'sideup_pricing_auth_failed',
            payload
        );
    }

    const token = String(payload?.access_token || '').trim();
    const expiresInSeconds = Number(payload?.expires_in || 3600);

    if (!token) {
        throw createError(500, 'SideUp pricing auth succeeded without returning a service token', 'sideup_service_token_missing');
    }

    cachedServiceToken = {
        token,
        expiresAt: Date.now() + Math.max(0, (Number.isFinite(expiresInSeconds) ? expiresInSeconds : 3600) * 1000 - AUTH_TOKEN_SKEW_MS)
    };

    return token;
}

async function sideupPricingFetch(path, { headers = {} } = {}) {
    const config = getSideUpConfig();
    const serviceToken = await getSideUpServiceToken(config);
    const response = await fetch(`${config.pricingBaseUrl}${path}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-tenant': config.tenant,
            Authorization: `Bearer ${serviceToken}`,
            ...headers
        },
        cache: 'no-store'
    });

    const rawBody = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? JSON.parse(rawBody || '{}')
        : { message: rawBody };

    if (!response.ok) {
        throw createError(
            response.status,
            extractErrorMessage(payload, `SideUp pricing request failed with status ${response.status}`),
            'sideup_pricing_request_failed',
            payload
        );
    }

    return payload;
}

function getOrderStoredSideUpLocation(order = {}) {
    return removeUndefinedFields({
        cityId: getPositiveNumber(order.shippingCityId || order.customerInfo?.shippingCityId || order.customer?.shippingCityId),
        cityName: normalizeSideUpLabel(order.shippingCityName || order.customerInfo?.shippingCityName || order.customer?.shippingCityName),
        areaId: getPositiveNumber(order.shippingDistrictId || order.customerInfo?.shippingDistrictId || order.customer?.shippingDistrictId),
        areaName: normalizeSideUpLabel(order.shippingDistrict || order.customerInfo?.shippingDistrict || order.customer?.shippingDistrict || order.shippingRecipient?.district),
        zoneId: getPositiveNumber(order.shippingZoneId || order.customerInfo?.shippingZoneId || order.customer?.shippingZoneId || order.sideupSync?.zoneId),
        zoneName: normalizeSideUpLabel(order.shippingZoneName || order.customerInfo?.shippingZoneName || order.customer?.shippingZoneName || order.shippingZone || order.customerInfo?.shippingZone || order.customer?.shippingZone || order.sideupSync?.zoneName)
    });
}

async function findSideUpCityById(cityId) {
    const normalizedCityId = getPositiveNumber(cityId);
    if (!normalizedCityId) {
        return null;
    }

    const cities = await listSideUpCities();
    return cities.find((city) => Number(city?.id) === normalizedCityId) || null;
}

async function findSideUpAreaById({ areaId, zoneId } = {}) {
    const normalizedAreaId = getPositiveNumber(areaId);
    if (!normalizedAreaId) {
        return null;
    }

    const zones = await listSideUpZones();
    const prioritizedZones = getPositiveNumber(zoneId)
        ? zones.filter((zone) => Number(zone?.id) === Number(zoneId))
        : zones;
    const fallbackZones = getPositiveNumber(zoneId)
        ? zones.filter((zone) => Number(zone?.id) !== Number(zoneId))
        : [];

    for (const zone of [...prioritizedZones, ...fallbackZones]) {
        const areas = await listSideUpAreasByZone(zone.id);
        const matchedArea = areas.find((area) => Number(area?.id) === normalizedAreaId);
        if (matchedArea) {
            return {
                ...matchedArea,
                sideupZoneId: Number(matchedArea?.pivot?.zone_id || zone.id),
                sideupZoneName: String(zone?.name || '').trim()
            };
        }
    }

    return null;
}

async function resolveStoredSideUpLocation(order = {}) {
    const storedLocation = getOrderStoredSideUpLocation(order);
    if (!storedLocation.areaId) {
        return null;
    }

    const area = await findSideUpAreaById({
        areaId: storedLocation.areaId,
        zoneId: storedLocation.zoneId
    });

    if (!area) {
        return null;
    }

    let city = null;
    if (storedLocation.cityId) {
        city = await findSideUpCityById(storedLocation.cityId);
    }

    if (!city && getPositiveNumber(area?.city_id)) {
        city = await findSideUpCityById(area.city_id);
    }

    return {
        city: city || removeUndefinedFields({
            id: storedLocation.cityId,
            name: storedLocation.cityName || undefined
        }),
        area: {
            ...area,
            sideupZoneId: getPositiveNumber(area?.sideupZoneId || storedLocation.zoneId),
            sideupZoneName: String(area?.sideupZoneName || storedLocation.zoneName || '').trim() || undefined
        }
    };
}

function normalizeSideUpAreaOption(area = {}, city = {}) {
    const rawCityName = city?.name || area?.city?.name || area?.city_name || '';
    const rawAreaName = area?.name || area?.name_ar || '';
    const rawZoneName = area?.sideupZoneName || area?.zone?.name || '';
    const cityName = getTranslatedSideUpCityName(rawCityName) || normalizeSideUpLabel(rawCityName);
    const areaName = getTranslatedSideUpAreaName(rawAreaName) || normalizeSideUpLabel(rawAreaName);
    const zoneName = getTranslatedSideUpZoneName(rawZoneName) || normalizeSideUpLabel(rawZoneName);

    return removeUndefinedFields({
        optionId: String(area?.id || '').trim() || undefined,
        areaId: getPositiveNumber(area?.id),
        areaName: areaName || undefined,
        cityId: getPositiveNumber(city?.id || area?.city_id),
        cityName: cityName || undefined,
        zoneId: getPositiveNumber(area?.sideupZoneId || area?.pivot?.zone_id),
        zoneName: zoneName || undefined,
        label: areaName || undefined
    });
}

function normalizeSideUpPickupAddress(rawAddress = {}) {
    return removeUndefinedFields({
        pickupLocationId: getPositiveNumber(rawAddress?.id || rawAddress?.pickup_location_id || rawAddress?.pickup_id || rawAddress?.address_id),
        pickupAddress: String(rawAddress?.pickup_address || '').trim() || undefined,
        phone: String(rawAddress?.phone || '').trim() || undefined,
        pickupAreaId: getPositiveNumber(rawAddress?.pickup_area_id),
        pickupCityId: getPositiveNumber(rawAddress?.pickup_city_id),
        pickupZoneId: getPositiveNumber(rawAddress?.pickup_zone_id)
    });
}

function normalizeSideUpPricingQuote(entry = {}) {
    return removeUndefinedFields({
        courierId: getPositiveNumber(entry?.id),
        courierName: String(entry?.name || '').trim() || undefined,
        deliveryTime: String(entry?.delivery_time || '').replace(/^"|"$/g, '').trim() || undefined,
        deliveryFees: getFiniteNumber(entry?.delivery_fees),
        totalDue: getFiniteNumber(entry?.total_due),
        vat: getFiniteNumber(entry?.summary?.vat),
        codFees: getFiniteNumber(entry?.summary?.cod_fees),
        paymentFees: getFiniteNumber(entry?.summary?.payment_fees),
        weightLimit: getFiniteNumber(entry?.weight_limit),
        blocked: entry?.blocked === true,
        toZoneId: getPositiveNumber(entry?.to_zone_id)
    });
}

function compareSideUpPricingQuotes(left = {}, right = {}) {
    const leftAmount = Number.isFinite(left?.totalDue) ? left.totalDue : (Number.isFinite(left?.deliveryFees) ? left.deliveryFees : Number.POSITIVE_INFINITY);
    const rightAmount = Number.isFinite(right?.totalDue) ? right.totalDue : (Number.isFinite(right?.deliveryFees) ? right.deliveryFees : Number.POSITIVE_INFINITY);
    return leftAmount - rightAmount || String(left?.courierName || '').localeCompare(String(right?.courierName || ''));
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

export async function listSideUpLocationOptionsForGovernorate(governorate) {
    const city = await resolveSideUpCity(governorate);
    const areas = await listSideUpAreasForCity(city);
    const cityName = getTranslatedSideUpCityName(city?.name || city?.name_ar || '') || normalizeSideUpLabel(city?.name || city?.name_ar || '');

    return {
        city: {
            id: getPositiveNumber(city?.id),
            name: cityName || undefined
        },
        areas: areas
            .map((area) => normalizeSideUpAreaOption(area, city))
            .filter((area) => area.areaId && area.zoneId && area.areaName)
            .sort((left, right) => String(left.areaName || '').localeCompare(String(right.areaName || '')))
    };
}

export async function listSideUpPickupAddresses() {
    return readCachedLookup('sideup:pickup-addresses', async () => {
        const payload = await sideupFetch('/myaddressess', { auth: 'required' });
        const rawAddresses = Array.isArray(payload?.data)
            ? payload.data
            : (payload?.data && typeof payload.data === 'object' ? Object.values(payload.data) : []);

        return rawAddresses
            .map((address) => normalizeSideUpPickupAddress(address))
            .filter((address) => address.pickupZoneId && address.pickupAreaId);
    });
}

export async function getSideUpDefaultPickupAddress() {
    const addresses = await listSideUpPickupAddresses();
    const pickupAddress = addresses[0] || null;

    if (!pickupAddress?.pickupZoneId) {
        throw createError(500, 'SideUp pickup address is not configured for live pricing', 'sideup_pickup_address_missing');
    }

    return pickupAddress;
}

export async function getSideUpCheapestShippingRate({ destinationZoneId, destinationAreaId, weightKg, paymentMethod, codAmount } = {}) {
    const config = getSideUpConfig();
    const pickupAddress = await getSideUpDefaultPickupAddress();
    const resolvedDestinationZoneId = getPositiveNumber(destinationZoneId);
    const resolvedDestinationAreaId = getPositiveNumber(destinationAreaId);

    if (!resolvedDestinationZoneId) {
        throw createError(400, 'A valid SideUp destination zone id is required for pricing', 'sideup_pricing_zone_required');
    }

    const effectiveWeight = Number.isFinite(Number(weightKg)) && Number(weightKg) > 0
        ? Number(weightKg)
        : (Number.isFinite(config.pricingWeightKg) && config.pricingWeightKg > 0 ? config.pricingWeightKg : DEFAULT_SIDEUP_PRICING_WEIGHT_KG);
    const effectivePaymentMethod = String(paymentMethod || config.pricingPaymentMethod || DEFAULT_SIDEUP_PRICING_PAYMENT_METHOD).trim().toUpperCase() || DEFAULT_SIDEUP_PRICING_PAYMENT_METHOD;
    const effectiveCodAmount = effectivePaymentMethod === 'PREPAID'
        ? 0
        : Math.max(0, Number.isFinite(Number(codAmount)) ? Number(codAmount) : (Number.isFinite(config.pricingCodAmount) ? config.pricingCodAmount : 0));

    const searchParams = new URLSearchParams({
        from_zone: String(pickupAddress.pickupZoneId),
        to_zone: String(resolvedDestinationZoneId),
        drop_area_id: String(resolvedDestinationAreaId || 0),
        weight: String(effectiveWeight),
        cod: String(effectiveCodAmount),
        payment_method: effectivePaymentMethod,
        include_blocked_couriers: '1'
    });

    const payload = await sideupPricingFetch(`/domestic-prices?${searchParams.toString()}`);
    const quotes = Array.isArray(payload?.data)
        ? payload.data.map((entry) => normalizeSideUpPricingQuote(entry)).filter((entry) => entry.courierId && (Number.isFinite(entry.totalDue) || Number.isFinite(entry.deliveryFees)))
        : [];

    if (quotes.length === 0) {
        throw createError(409, 'SideUp did not return any courier prices for this destination', 'sideup_pricing_unavailable');
    }

    const rankedQuotes = [...quotes].sort(compareSideUpPricingQuotes);
    const cheapestQuote = rankedQuotes[0];
    const amount = Number.isFinite(cheapestQuote?.totalDue)
        ? cheapestQuote.totalDue
        : (Number.isFinite(cheapestQuote?.deliveryFees) ? cheapestQuote.deliveryFees : 0);

    return {
        amount,
        courierName: cheapestQuote?.courierName || '',
        pickupZoneId: pickupAddress.pickupZoneId,
        pickupAreaId: pickupAddress.pickupAreaId,
        destinationZoneId: resolvedDestinationZoneId,
        destinationAreaId: resolvedDestinationAreaId,
        weightKg: effectiveWeight,
        paymentMethod: effectivePaymentMethod,
        codAmount: effectiveCodAmount,
        cheapestQuote,
        quotes: rankedQuotes
    };
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
    const rawCityName = city?.name || city?.name_ar || '';
    const rawAreaName = area?.name || area?.name_ar || '';
    const rawZoneName = area?.sideupZoneName || area?.zone?.name || '';

    return {
        city: {
            id: Number(city?.id || 0) || undefined,
            name: getTranslatedSideUpCityName(rawCityName) || normalizeSideUpLabel(rawCityName) || undefined
        },
        area: {
            id: Number(area?.id || 0) || undefined,
            name: getTranslatedSideUpAreaName(rawAreaName) || normalizeSideUpLabel(rawAreaName) || undefined
        },
        zone: {
            id: Number(area?.sideupZoneId || area?.pivot?.zone_id || 0) || undefined,
            name: getTranslatedSideUpZoneName(rawZoneName) || normalizeSideUpLabel(rawZoneName) || undefined
        }
    };
}

async function buildSideUpCreatePayloadContext(order = {}, preview = {}) {
    const destinationZoneId = getPositiveNumber(preview?.location?.zone?.id);
    const destinationAreaId = getPositiveNumber(preview?.location?.area?.id);
    const amount = formatOrderAmount(order);

    const [pickupAddressResult, pricingResult] = await Promise.allSettled([
        getSideUpDefaultPickupAddress(),
        hasSideUpPricingCredentials() && destinationZoneId
            ? getSideUpCheapestShippingRate({
                destinationZoneId,
                destinationAreaId,
                paymentMethod: 'COD',
                codAmount: amount
            })
            : Promise.resolve(null)
    ]);

    const pickupAddress = pickupAddressResult.status === 'fulfilled' ? pickupAddressResult.value : null;
    const pricing = pricingResult.status === 'fulfilled' ? pricingResult.value : null;

    return removeUndefinedFields({
        pickupLocationId: getPositiveNumber(pickupAddress?.pickupLocationId),
        courierName: String(pricing?.courierName || '').trim() || undefined,
        courierId: getPositiveNumber(pricing?.cheapestQuote?.courierId)
    });
}

function buildPostmanOrderPayload(order = {}, preview = {}, createContext = {}, config = getSideUpConfig()) {
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
        courier: String(createContext?.courierName || config.courierName || '').trim() || undefined,
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

function buildSwaggerOrderPayload(order = {}, preview = {}, createContext = {}, config = getSideUpConfig()) {
    const recipientName = getOrderCustomerName(order);
    const recipientPhone = normalizePhoneNumber(getOrderCustomerPhone(order));
    const shippingAddress = getOrderShippingAddress(order);
    const amount = formatOrderAmount(order);
    const courierId = getPositiveNumber(createContext?.courierId) || (Number.isFinite(config.courierId) ? config.courierId : undefined);
    const pickupLocationId = getPositiveNumber(createContext?.pickupLocationId) || (Number.isFinite(config.pickupLocationId) ? config.pickupLocationId : undefined);

    return removeUndefinedFields({
        name: recipientName || undefined,
        phone: recipientPhone || undefined,
        address: shippingAddress || undefined,
        area_id: preview?.location?.area?.id,
        shipment_code: getOrderExternalRef(order) || order.id || undefined,
        item_description: buildOrderItemDescription(order),
        total_cash_collection: amount,
        courier: String(createContext?.courierName || config.courierName || '').trim() || undefined,
        zero_cash_collection: amount <= 0,
        landmark: getOrderLandmark(order) || undefined,
        userId: order.userId || undefined,
        email: getOrderEmail(order) || undefined,
        isNewDashboard: true,
        online_payment: 'cod',
        reverse_order: 0,
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

function collectSideUpObjects(value, results = []) {
    if (!value || typeof value !== 'object') {
        return results;
    }

    if (Array.isArray(value)) {
        value.forEach((entry) => collectSideUpObjects(entry, results));
        return results;
    }

    results.push(value);
    Object.values(value).forEach((entry) => collectSideUpObjects(entry, results));
    return results;
}

function buildSideUpShipmentCodeCandidates(order = {}) {
    return Array.from(new Set([
        order.sideupSync?.shipmentCode,
        getOrderExternalRef(order),
        order.websiteOrderRef,
        order.id
    ].map((value) => String(value || '').trim()).filter(Boolean)));
}

function matchesSideUpShipmentCode(record = {}, shipmentCodeCandidates = []) {
    const normalizedCandidates = shipmentCodeCandidates.map((value) => value.toLowerCase());
    const recordShipmentCodeCandidates = [
        record.shipment_code,
        record.shipmentCode,
        record.code,
        record.reference,
        record.order_reference,
        record.orderReference,
        record.merchant_reference,
        record.merchantReference
    ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);

    return recordShipmentCodeCandidates.some((value) => normalizedCandidates.includes(value));
}

function findSideUpOrderRecord(payload, shipmentCodeCandidates = []) {
    const records = collectSideUpObjects(payload, []);
    return records.find((record) => matchesSideUpShipmentCode(record, shipmentCodeCandidates)) || null;
}

function normalizeSideUpStatusResult(record = {}, order = {}, requestPath = '') {
    return removeUndefinedFields({
        orderId: getPositiveNumber(record?.id || record?.order_id || record?.orderId),
        shipmentCode: String(record?.shipment_code || record?.shipmentCode || getOrderExternalRef(order) || order.sideupSync?.shipmentCode || '').trim() || undefined,
        status: String(record?.status || record?.shipment_status || record?.shipmentStatus || record?.order_status || record?.orderStatus || record?.tracking_status || '').trim() || undefined,
        courierId: getPositiveNumber(record?.courier_id || record?.courierId || record?.courier?.id),
        courierName: String(record?.courier_name || record?.courierName || record?.courier?.name || '').trim() || undefined,
        requestPath: requestPath || undefined
    });
}

function buildSideUpStatusRequestCandidates(shipmentCode) {
    const encodedShipmentCode = encodeURIComponent(String(shipmentCode || '').trim());
    const queryVariants = [
        `shipment_code=${encodedShipmentCode}`,
        `search=${encodedShipmentCode}`,
        `keyword=${encodedShipmentCode}`,
        `searchTerm=${encodedShipmentCode}`,
        `filter[shipment_code]=${encodedShipmentCode}`
    ];

    return [
        ...queryVariants.flatMap((query) => ([
            { method: 'GET', path: `/order?${query}` },
            { method: 'GET', path: `/order/index?${query}` },
            { method: 'GET', path: `/orders?${query}` },
            { method: 'GET', path: `/myorders?${query}` }
        ])),
        { method: 'GET', path: `/order/${encodedShipmentCode}` },
        { method: 'GET', path: `/order/show/${encodedShipmentCode}` },
        { method: 'GET', path: `/orders/${encodedShipmentCode}` },
        { method: 'POST', path: '/order/search', body: { shipment_code: shipmentCode } },
        { method: 'POST', path: '/order/search', body: { search: shipmentCode } },
        { method: 'POST', path: '/order/index', body: { shipment_code: shipmentCode } },
        { method: 'POST', path: '/order/index', body: { search: shipmentCode } }
    ];
}

export async function refreshSideUpOrderStatus(order = {}) {
    const shipmentCodeCandidates = buildSideUpShipmentCodeCandidates(order);
    if (shipmentCodeCandidates.length === 0) {
        throw createError(409, 'This order does not have a SideUp shipment code yet', 'sideup_shipment_code_missing');
    }

    let lastError = null;

    for (const shipmentCode of shipmentCodeCandidates) {
        const requestCandidates = buildSideUpStatusRequestCandidates(shipmentCode);

        for (const requestCandidate of requestCandidates) {
            try {
                const apiPayload = await sideupFetch(requestCandidate.path, {
                    method: requestCandidate.method,
                    auth: 'required',
                    body: requestCandidate.body
                });

                const record = findSideUpOrderRecord(apiPayload, shipmentCodeCandidates);
                if (!record) {
                    continue;
                }

                return normalizeSideUpStatusResult(record, order, requestCandidate.path);
            } catch (error) {
                lastError = error;
                const statusCode = Number(error?.status);
                if (Number.isFinite(statusCode) && [400, 404, 405, 422].includes(statusCode)) {
                    continue;
                }

                throw error;
            }
        }
    }

    throw createError(
        404,
        'Unable to find this shipment on SideUp right now',
        'sideup_status_not_found',
        removeUndefinedFields({
            shipmentCodes: shipmentCodeCandidates,
            lastError: lastError?.message || undefined
        })
    );
}

export async function buildSideUpOrderPreview(order = {}, { areaHint = '' } = {}) {
    const governorate = getOrderGovernorate(order);
    const districtName = getOrderDistrict(order);
    const shippingAddress = getOrderShippingAddress(order);
    const storedLocation = await resolveStoredSideUpLocation(order);

    if (!shippingAddress) {
        throw createError(400, 'This order is missing a shipping address for SideUp', 'sideup_address_required');
    }

    let city = storedLocation?.city || null;
    let area = storedLocation?.area || null;

    if (!city || !area) {
        if (!governorate) {
            throw createError(400, 'This order is missing a governorate for SideUp', 'sideup_governorate_required');
        }

        city = await resolveSideUpCity(governorate);
        area = await resolveSideUpArea({
            city,
            areaHint,
            districtName,
            address: shippingAddress
        });
    }

    const preview = removeUndefinedFields({
        governorate,
        districtName,
        areaHint: areaHint || undefined,
        locationSource: storedLocation ? 'stored' : 'lookup',
        location: buildPreviewLocation({ city, area })
    });
    const createContext = await buildSideUpCreatePayloadContext(order, preview);

    return {
        ...preview,
        payloads: {
            postman: buildPostmanOrderPayload(order, preview, createContext),
            swagger: buildSwaggerOrderPayload(order, preview, createContext)
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