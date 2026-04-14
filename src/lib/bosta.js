import { getOrderAmount, getOrderCustomerName, getOrderCustomerPhone, getOrderExternalRef } from '@/lib/utils/admin-orders';

const DEFAULT_BOSTA_BASE_URL = 'https://app.bosta.co/api/v2';
const DEFAULT_BOSTA_DELIVERY_TYPE = 10;
const SHIPPING_ADDRESS_LABEL_MAP = new Map([
    ['المحافظه', 'governorate'],
    ['الحي المنطقه', 'districtName'],
    ['الحي', 'districtName'],
    ['المنطقه', 'districtName'],
    ['اسم الشارع', 'streetName'],
    ['رقم العقار البيت', 'houseNumber'],
    ['رقم البيت', 'houseNumber'],
    ['الدور', 'floorNumber'],
    ['رقم الشقه', 'apartmentNumber'],
    ['علامه مميزه تعليمات التوصيل', 'deliveryInstructions'],
    ['تعليمات التوصيل', 'deliveryInstructions'],
    ['علامه مميزه', 'deliveryInstructions']
]);

function createBostaError(status, message, code, details) {
    const error = new Error(message);
    error.status = status;
    error.code = code || '';
    error.details = details;
    return error;
}

function normalizeText(value, fallback = '') {
    const normalized = String(value || '').trim();
    return normalized || fallback;
}

function normalizeBoolean(value, fallback = false) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return fallback;
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function normalizeLookupValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064b-\u065f\u0670]/g, '')
        .replace(/[^a-z0-9\u0600-\u06ff\s]/gi, ' ')
        .replace(/\s+/g, ' ');
}

function getConfig() {
    const apiKey = normalizeText(process.env.BOSTA_API_KEY);
    if (!apiKey) {
        throw createBostaError(500, 'BOSTA_API_KEY is not configured', 'bosta_config_missing');
    }

    return {
        apiKey,
        baseUrl: normalizeText(process.env.BOSTA_BASE_URL, DEFAULT_BOSTA_BASE_URL).replace(/\/+$/, ''),
        businessLocationId: normalizeText(process.env.BOSTA_BUSINESS_LOCATION_ID),
        deliveryType: Number.parseInt(process.env.BOSTA_DELIVERY_TYPE || '', 10) || DEFAULT_BOSTA_DELIVERY_TYPE,
        packageSize: normalizeText(process.env.BOSTA_PACKAGE_SIZE, 'SMALL'),
        packageType: normalizeText(process.env.BOSTA_PACKAGE_TYPE, 'Parcel'),
        allowOpenPackage: normalizeBoolean(process.env.BOSTA_ALLOW_OPEN_PACKAGE, false),
        webhookSecret: normalizeText(process.env.BOSTA_WEBHOOK_SECRET),
        webhookSecretHeader: normalizeText(process.env.BOSTA_WEBHOOK_SECRET_HEADER, 'x-hog-bosta-webhook-secret'),
        webhookBaseUrl: normalizeText(process.env.BOSTA_WEBHOOK_BASE_URL)
    };
}

function cleanObject(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')
    );
}

function parseJsonSafely(text) {
    try {
        return JSON.parse(text);
    } catch (_error) {
        return null;
    }
}

async function readResponsePayload(response) {
    const text = await response.text();
    const parsed = parseJsonSafely(text);
    return {
        text,
        parsed
    };
}

function getErrorMessageFromPayload(payload, fallback) {
    if (!payload) return fallback;

    if (typeof payload === 'string') {
        return normalizeText(payload, fallback);
    }

    return normalizeText(
        payload.message
        || payload.error
        || payload.data?.message
        || payload.data?.error,
        fallback
    );
}

async function bostaFetch(path, { method = 'GET', body } = {}) {
    const config = getConfig();
    const url = `${config.baseUrl}${path}`;
    const authHeaderCandidates = config.apiKey.toLowerCase().startsWith('bearer ')
        ? [config.apiKey]
        : [config.apiKey, `Bearer ${config.apiKey}`];

    let lastError = null;

    for (const authorizationValue of authHeaderCandidates) {
        const response = await fetch(url, {
            method,
            headers: cleanObject({
                Authorization: authorizationValue,
                'Content-Type': body ? 'application/json' : undefined
            }),
            body: body ? JSON.stringify(body) : undefined,
            cache: 'no-store'
        });

        const payload = await readResponsePayload(response);
        if (response.ok) {
            return payload.parsed ?? payload.text;
        }

        const message = getErrorMessageFromPayload(payload.parsed || payload.text, `Bosta request failed with status ${response.status}`);
        lastError = createBostaError(response.status, message, 'bosta_request_failed', payload.parsed || payload.text);

        if (response.status !== 401) {
            throw lastError;
        }
    }

    throw lastError || createBostaError(500, 'Failed to call Bosta API', 'bosta_request_failed');
}

function getShippingAddressString(order = {}) {
    return normalizeText(order.shippingAddress || order.customerInfo?.shippingAddress || order.customer?.shippingAddress);
}

function getShippingGovernorate(order = {}) {
    return normalizeText(order.governorate || order.customerInfo?.governorate || order.customer?.governorate);
}

function parseShippingAddress(rawAddress, fallbackGovernorate = '') {
    const parsedFields = {
        governorate: normalizeText(fallbackGovernorate),
        districtName: '',
        streetName: '',
        houseNumber: '',
        floorNumber: '',
        apartmentNumber: '',
        deliveryInstructions: '',
        rawAddress: normalizeText(rawAddress)
    };

    normalizeText(rawAddress)
        .split('|')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .forEach((segment) => {
            const separatorIndex = segment.indexOf(':');
            if (separatorIndex === -1) {
                return;
            }

            const label = normalizeLookupValue(segment.slice(0, separatorIndex));
            const value = normalizeText(segment.slice(separatorIndex + 1));
            const fieldKey = SHIPPING_ADDRESS_LABEL_MAP.get(label);
            if (fieldKey && value) {
                parsedFields[fieldKey] = value;
            }
        });

    if (!parsedFields.governorate) {
        parsedFields.governorate = normalizeText(fallbackGovernorate);
    }

    return parsedFields;
}

async function listBusinessPickupLocations() {
    const payload = await bostaFetch('/pickup-locations');
    const list = Array.isArray(payload?.data?.list)
        ? payload.data.list
        : (Array.isArray(payload?.list) ? payload.list : []);

    return list;
}

async function resolveBusinessLocationId() {
    const config = getConfig();
    if (config.businessLocationId) {
        return config.businessLocationId;
    }

    const locations = await listBusinessPickupLocations();
    const defaultLocation = locations.find((location) => location?.isDefault) || locations[0];
    const locationId = normalizeText(defaultLocation?._id);

    if (!locationId) {
        throw createBostaError(500, 'Bosta business location could not be resolved. Set BOSTA_BUSINESS_LOCATION_ID or configure a default pickup location in Bosta.', 'bosta_business_location_missing');
    }

    return locationId;
}

async function listCities() {
    const payload = await bostaFetch('/cities');
    return Array.isArray(payload?.data?.list)
        ? payload.data.list
        : (Array.isArray(payload?.list) ? payload.list : []);
}

async function listCityDistricts(cityId) {
    const payload = await bostaFetch(`/cities/${encodeURIComponent(cityId)}/districts`);
    return Array.isArray(payload?.data)
        ? payload.data
        : (Array.isArray(payload?.list) ? payload.list : []);
}

function buildDistrictOptionId(district = {}) {
    const districtId = normalizeText(district?.districtId);
    if (districtId) {
        return districtId;
    }

    const zoneId = normalizeText(district?.zoneId, 'zone');
    const districtSlug = normalizeLookupValue(district?.districtOtherName || district?.districtName || district?.zoneOtherName || district?.zoneName || 'district').replace(/\s+/g, '-');
    return `${zoneId}-${districtSlug}`;
}

function buildDistrictOptionLabel(district = {}) {
    const districtName = normalizeText(district?.districtOtherName || district?.districtName);
    const zoneName = normalizeText(district?.zoneOtherName || district?.zoneName);
    return [districtName, zoneName && zoneName !== districtName ? zoneName : '']
        .filter(Boolean)
        .join(' - ')
        || 'Unnamed district';
}

export async function listBostaDistrictOptionsForGovernorate(governorate = '') {
    const normalizedGovernorate = normalizeText(governorate);
    if (!normalizedGovernorate) {
        throw createBostaError(400, 'Governorate is required', 'bosta_governorate_required');
    }

    const cities = await listCities();
    const city = resolveCityMatch(cities, normalizedGovernorate);
    if (!city?._id) {
        throw createBostaError(404, `Could not map governorate "${normalizedGovernorate}" to a Bosta city`, 'bosta_city_match_failed');
    }

    const districts = await listCityDistricts(city._id);
    const normalizedDistricts = districts
        .map((district) => ({
            optionId: buildDistrictOptionId(district),
            districtId: normalizeText(district?.districtId),
            districtName: normalizeText(district?.districtOtherName || district?.districtName),
            zoneId: normalizeText(district?.zoneId),
            zoneName: normalizeText(district?.zoneOtherName || district?.zoneName),
            cityId: normalizeText(city._id),
            cityName: normalizeText(city?.nameAr || city?.name),
            label: buildDistrictOptionLabel(district)
        }))
        .filter((entry) => entry.districtName || entry.zoneName)
        .sort((left, right) => left.label.localeCompare(right.label, 'ar'));

    return {
        city: {
            id: normalizeText(city._id),
            name: normalizeText(city.nameAr || city.name)
        },
        districts: normalizedDistricts
    };
}

function resolveCityMatch(cities = [], governorate) {
    const normalizedGovernorate = normalizeLookupValue(governorate);
    if (!normalizedGovernorate) return null;

    const exactMatch = cities.find((city) => {
        const candidates = [city?.nameAr, city?.name, city?.alias, city?.code].map(normalizeLookupValue).filter(Boolean);
        return candidates.includes(normalizedGovernorate);
    });

    if (exactMatch) return exactMatch;

    return cities.find((city) => {
        const candidates = [city?.nameAr, city?.name, city?.alias].map(normalizeLookupValue).filter(Boolean);
        return candidates.some((candidate) => candidate.includes(normalizedGovernorate) || normalizedGovernorate.includes(candidate));
    }) || null;
}

function getDistrictSearchTexts({ addressFields, districtHint }) {
    return [
        districtHint,
        addressFields?.districtName,
        addressFields?.deliveryInstructions,
        addressFields?.streetName,
        addressFields?.rawAddress
    ]
        .map(normalizeLookupValue)
        .filter(Boolean);
}

function getStoredShippingLocation(order = {}) {
    return {
        cityId: normalizeText(order.shippingCityId || order.customerInfo?.shippingCityId || order.customer?.shippingCityId),
        cityName: normalizeText(order.shippingCityName || order.customerInfo?.shippingCityName || order.customer?.shippingCityName),
        districtId: normalizeText(order.shippingDistrictId || order.customerInfo?.shippingDistrictId || order.customer?.shippingDistrictId),
        districtName: normalizeText(order.shippingDistrict || order.customerInfo?.shippingDistrict || order.customer?.shippingDistrict),
        zoneId: normalizeText(order.shippingBostaZoneId || order.customerInfo?.shippingBostaZoneId || order.customer?.shippingBostaZoneId)
    };
}

function resolveDistrictFromStoredSelection(districts = [], storedLocation = {}) {
    const storedDistrictId = normalizeText(storedLocation.districtId);
    const storedZoneId = normalizeText(storedLocation.zoneId);
    const storedDistrictName = normalizeLookupValue(storedLocation.districtName);

    if (storedDistrictId) {
        const exactDistrict = districts.find((district) => normalizeText(district?.districtId) === storedDistrictId);
        if (exactDistrict) {
            return exactDistrict;
        }
    }

    if (storedZoneId) {
        const zoneMatch = districts.find((district) => {
            if (normalizeText(district?.zoneId) !== storedZoneId) {
                return false;
            }

            if (!storedDistrictName) {
                return true;
            }

            const districtCandidates = [district?.districtName, district?.districtOtherName, district?.zoneName, district?.zoneOtherName]
                .map(normalizeLookupValue)
                .filter(Boolean);
            return districtCandidates.includes(storedDistrictName);
        });

        if (zoneMatch) {
            return zoneMatch;
        }
    }

    if (!storedDistrictName) {
        return null;
    }

    return districts.find((district) => {
        const districtCandidates = [district?.districtName, district?.districtOtherName, district?.zoneName, district?.zoneOtherName]
            .map(normalizeLookupValue)
            .filter(Boolean);
        return districtCandidates.includes(storedDistrictName);
    }) || null;
}

function scoreDistrictMatch(district, searchTexts) {
    const candidates = [
        district?.districtName,
        district?.districtOtherName,
        district?.zoneName,
        district?.zoneOtherName
    ].map(normalizeLookupValue).filter(Boolean);

    let bestScore = 0;

    searchTexts.forEach((searchText) => {
        candidates.forEach((candidate) => {
            if (!candidate) return;

            if (searchText === candidate) {
                bestScore = Math.max(bestScore, 100 + candidate.length);
                return;
            }

            if (searchText.includes(candidate)) {
                bestScore = Math.max(bestScore, 70 + candidate.length);
                return;
            }

            if (candidate.includes(searchText) && searchText.length >= 4) {
                bestScore = Math.max(bestScore, 40 + searchText.length);
            }
        });
    });

    return bestScore;
}

function resolveDistrictMatch(districts = [], { addressFields, districtHint }) {
    const searchTexts = getDistrictSearchTexts({ addressFields, districtHint });
    if (searchTexts.length === 0) {
        return null;
    }

    const matches = districts
        .map((district) => ({
            district,
            score: scoreDistrictMatch(district, searchTexts)
        }))
        .filter((entry) => entry.score >= 45)
        .sort((left, right) => right.score - left.score);

    return matches[0]?.district || null;
}

function splitCustomerName(fullName) {
    const normalizedName = normalizeText(fullName, 'Customer');
    const parts = normalizedName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'Customer';
    const lastName = parts.slice(1).join(' ') || firstName;

    return { firstName, lastName, fullName: normalizedName };
}

function normalizePhoneNumber(value) {
    return normalizeText(value).replace(/[^\d+]/g, '');
}

function buildWebhookUrl(requestOrigin) {
    const config = getConfig();
    const baseUrl = config.webhookBaseUrl || normalizeText(requestOrigin);
    if (!baseUrl || /localhost|127\.0\.0\.1/i.test(baseUrl)) {
        return '';
    }

    return `${baseUrl.replace(/\/+$/, '')}/api/integrations/bosta/webhook`;
}

function buildWebhookHeaders() {
    const config = getConfig();
    if (!config.webhookSecret) {
        return undefined;
    }

    return {
        [config.webhookSecretHeader]: config.webhookSecret
    };
}

function getOrderSubtotalAmount(order = {}) {
    const subtotal = Number(order.subtotalAmount ?? order.subtotal ?? 0);
    return Number.isFinite(subtotal) && subtotal > 0 ? subtotal : getOrderAmount(order);
}

function getReceiverEmail(order = {}) {
    return normalizeText(order.customer?.email || order.customerInfo?.email || order.customerEmail || '');
}

function buildDropOffAddress({ addressFields, city, district }) {
    const firstLine = [addressFields.streetName, addressFields.houseNumber ? `Building ${addressFields.houseNumber}` : '']
        .filter(Boolean)
        .join(', ')
        || addressFields.rawAddress
        || city?.nameAr
        || city?.name
        || 'Address not provided';

    const secondLine = [addressFields.districtName, addressFields.deliveryInstructions].filter(Boolean).join(' | ');

    return cleanObject({
        city: normalizeText(addressFields.governorate || city?.nameAr || city?.name),
        cityId: normalizeText(city?._id),
        zoneId: normalizeText(district?.zoneId),
        districtId: normalizeText(district?.districtId),
        districtName: normalizeText(district?.districtName || district?.districtOtherName),
        firstLine,
        secondLine,
        floor: normalizeText(addressFields.floorNumber),
        apartment: normalizeText(addressFields.apartmentNumber),
        buildingNumber: normalizeText(addressFields.houseNumber)
    });
}

function extractDeliveryPayload(responsePayload) {
    const data = responsePayload?.data && typeof responsePayload.data === 'object'
        ? responsePayload.data
        : responsePayload;

    return {
        deliveryId: normalizeText(data?._id || responsePayload?._id),
        trackingNumber: normalizeText(data?.trackingNumber || responsePayload?.trackingNumber),
        businessReference: normalizeText(data?.businessReference || responsePayload?.businessReference),
        message: normalizeText(data?.message || responsePayload?.message),
        stateCode: normalizeText(data?.state?.code || responsePayload?.state?.code),
        stateLabel: normalizeText(data?.state?.value || responsePayload?.state?.value)
    };
}

export function extractBostaWebhookPayload(rawPayload = {}) {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const delivery = payload?.delivery && typeof payload.delivery === 'object' ? payload.delivery : {};
    const stateObject = payload?.state && typeof payload.state === 'object'
        ? payload.state
        : (data?.state && typeof data.state === 'object' ? data.state : (delivery?.state && typeof delivery.state === 'object' ? delivery.state : {}));

    return {
        trackingNumber: normalizeText(payload.trackingNumber || data.trackingNumber || delivery.trackingNumber || payload.awb || data.awb),
        businessReference: normalizeText(payload.businessReference || data.businessReference || delivery.businessReference || payload.uniqueBusinessReference || data.uniqueBusinessReference),
        deliveryId: normalizeText(payload._id || data._id || delivery._id),
        stateCode: normalizeText(stateObject.code || payload.stateCode || data.stateCode),
        stateLabel: normalizeText(stateObject.value || stateObject.label || payload.stateLabel || payload.state || data.stateLabel || data.status),
        message: normalizeText(payload.message || data.message || delivery.message)
    };
}

export function verifyBostaWebhookHeaders(headersLike) {
    const config = getConfig();
    if (!config.webhookSecret) {
        return true;
    }

    const actualValue = typeof headersLike?.get === 'function'
        ? headersLike.get(config.webhookSecretHeader)
        : headersLike?.[config.webhookSecretHeader];

    return normalizeText(actualValue) === config.webhookSecret;
}

export async function createBostaDeliveryForOrder(order, { districtHint = '', requestOrigin = '' } = {}) {
    if (!order?.id) {
        throw createBostaError(400, 'Order is required', 'bosta_order_missing');
    }

    const fullName = getOrderCustomerName(order);
    const phone = normalizePhoneNumber(getOrderCustomerPhone(order));
    const rawAddress = getShippingAddressString(order);
    const governorate = getShippingGovernorate(order);
    const addressFields = parseShippingAddress(rawAddress, governorate);
    const storedLocation = getStoredShippingLocation(order);

    if (!addressFields.districtName) {
        addressFields.districtName = storedLocation.districtName;
    }

    if (!phone) {
        throw createBostaError(400, 'Customer phone is required before sending the shipment to Bosta', 'bosta_phone_required');
    }

    if (!addressFields.governorate) {
        throw createBostaError(400, 'Shipping governorate is required before sending the shipment to Bosta', 'bosta_governorate_required');
    }

    if (!addressFields.streetName) {
        throw createBostaError(400, 'Shipping street name is required before sending the shipment to Bosta', 'bosta_street_required');
    }

    const cities = await listCities();
    const city = (storedLocation.cityId
        ? (cities.find((entry) => normalizeText(entry?._id) === storedLocation.cityId) || null)
        : null)
        || resolveCityMatch(cities, addressFields.governorate);
    if (!city?._id) {
        throw createBostaError(400, `Could not map governorate "${addressFields.governorate}" to a Bosta city`, 'bosta_city_match_failed');
    }

    const districts = await listCityDistricts(city._id);
    const district = resolveDistrictFromStoredSelection(districts, storedLocation)
        || resolveDistrictMatch(districts, { addressFields, districtHint: normalizeText(districtHint) });
    if (!district?.districtId && !district?.zoneId) {
        throw createBostaError(
            400,
            'Bosta needs a recognizable district or area in the shipping address. Add the area in the address or provide a district hint before retrying.',
            'district_match_required'
        );
    }

    const businessLocationId = await resolveBusinessLocationId();
    const config = getConfig();
    const receiverName = splitCustomerName(fullName);
    const businessReference = getOrderExternalRef(order) || order.id;
    const codAmount = Number(getOrderAmount(order)) || 0;
    const goodsAmount = Number(getOrderSubtotalAmount(order)) || codAmount;
    const webhookUrl = buildWebhookUrl(requestOrigin);
    const webhookCustomHeaders = buildWebhookHeaders();
    const dropOffAddress = buildDropOffAddress({ addressFields, city, district });

    const requestBody = cleanObject({
        type: config.deliveryType,
        specs: cleanObject({
            size: config.packageSize,
            packageType: config.packageType
        }),
        goodsInfo: cleanObject({
            amount: goodsAmount
        }),
        cod: codAmount,
        notes: [
            `Website order ${businessReference}`,
            addressFields.districtName ? `District: ${addressFields.districtName}` : '',
            addressFields.deliveryInstructions ? `Delivery instructions: ${addressFields.deliveryInstructions}` : '',
            districtHint ? `District hint: ${districtHint}` : ''
        ].filter(Boolean).join(' | '),
        dropOffAddress,
        businessReference,
        uniqueBusinessReference: businessReference,
        receiver: cleanObject({
            firstName: receiverName.firstName,
            lastName: receiverName.lastName,
            fullName: receiverName.fullName,
            phone,
            email: getReceiverEmail(order)
        }),
        webhookUrl: webhookUrl || undefined,
        webhookCustomHeaders,
        businessLocationId,
        allowToOpenPackage: config.allowOpenPackage
    });

    const responsePayload = await bostaFetch('/deliveries?apiVersion=1', {
        method: 'POST',
        body: requestBody
    });

    const normalizedResponse = extractDeliveryPayload(responsePayload);
    if (!normalizedResponse.trackingNumber) {
        throw createBostaError(502, 'Bosta did not return a tracking number for the created shipment', 'bosta_tracking_missing', responsePayload);
    }

    return {
        requestBody,
        responsePayload,
        ...normalizedResponse,
        cityId: normalizeText(city._id),
        cityName: normalizeText(city.nameAr || city.name),
        districtId: normalizeText(district?.districtId),
        districtName: normalizeText(district?.districtName || district?.districtOtherName),
        zoneId: normalizeText(district?.zoneId)
    };
}

export { createBostaError };
