function normalizeText(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function parseAmount(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function createPromoCodeId() {
    return `promo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePromoCodeLookupValue(value) {
    return String(value ?? '').trim().toLowerCase();
}

export function normalizePromoDiscountType(value) {
    return String(value ?? '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'percentage';
}

export function normalizePromoDiscountValue(value, discountType = 'percentage') {
    const normalizedType = normalizePromoDiscountType(discountType);
    const numericValue = parseAmount(value);
    const clampedValue = normalizedType === 'percentage' ? Math.min(numericValue, 100) : numericValue;
    return String(clampedValue);
}

export function createEmptyPromoCodeEntry(overrides = {}) {
    const discountType = normalizePromoDiscountType(overrides.discountType);

    return {
        id: normalizeText(overrides.id, createPromoCodeId()),
        code: normalizeText(overrides.code),
        discountType,
        discountValue: normalizePromoDiscountValue(overrides.discountValue, discountType),
        isActive: overrides.isActive !== false
    };
}

export function normalizePromoCodeEntry(entry = {}, index = 0) {
    const discountType = normalizePromoDiscountType(entry.discountType);
    const code = normalizeText(entry.code);
    const discountValue = normalizePromoDiscountValue(entry.discountValue, discountType);

    return {
        id: normalizeText(entry.id, `${createPromoCodeId()}-${index + 1}`),
        code,
        normalizedCode: normalizePromoCodeLookupValue(code),
        discountType,
        discountValue,
        numericDiscountValue: parseAmount(discountValue),
        isActive: entry.isActive !== false && String(entry.status ?? '').trim().toLowerCase() !== 'inactive'
    };
}

export function normalizePromoCodes(promoCodes = [], legacyPromoSettings = {}) {
    const sourceEntries = Array.isArray(promoCodes) ? promoCodes : [];
    const normalizedEntries = sourceEntries
        .map((entry, index) => normalizePromoCodeEntry(entry, index))
        .filter((entry) => entry.code);

    if (normalizedEntries.length > 0) {
        return normalizedEntries;
    }

    const legacyCode = normalizeText(legacyPromoSettings.promoCode || legacyPromoSettings.code);
    if (!legacyCode) {
        return [];
    }

    return [normalizePromoCodeEntry({
        id: legacyPromoSettings.id,
        code: legacyCode,
        discountType: legacyPromoSettings.promoDiscountType || legacyPromoSettings.discountType,
        discountValue: legacyPromoSettings.promoDiscountValue || legacyPromoSettings.discountValue,
        isActive: legacyPromoSettings.isActive
    })];
}

export function getActivePromoCodes(promoCodes = []) {
    return normalizePromoCodes(promoCodes).filter((entry) => entry.isActive);
}

export function getPrimaryPromoCode(promoCodes = []) {
    const normalizedEntries = normalizePromoCodes(promoCodes);
    return normalizedEntries.find((entry) => entry.isActive) || normalizedEntries[0] || null;
}

export function buildLegacyPromoSettingsFromPromoCodes(promoCodes = []) {
    const primaryPromoCode = getPrimaryPromoCode(promoCodes);

    return {
        promoCode: primaryPromoCode?.code || '',
        promoDiscountType: primaryPromoCode?.discountType || 'percentage',
        promoDiscountValue: primaryPromoCode?.discountValue || '0'
    };
}

export function findPromoCodeByInput(promoCodes = [], input = '', options = {}) {
    const normalizedInput = normalizePromoCodeLookupValue(input);
    const activeOnly = options.activeOnly !== false;

    if (!normalizedInput) {
        return null;
    }

    return normalizePromoCodes(promoCodes).find((entry) => entry.normalizedCode === normalizedInput && (!activeOnly || entry.isActive)) || null;
}

export function findDuplicatePromoCodes(promoCodes = []) {
    const seenCodes = new Set();
    const duplicateCodes = new Set();

    normalizePromoCodes(promoCodes).forEach((entry) => {
        if (!entry.normalizedCode) {
            return;
        }

        if (seenCodes.has(entry.normalizedCode)) {
            duplicateCodes.add(entry.code);
            return;
        }

        seenCodes.add(entry.normalizedCode);
    });

    return Array.from(duplicateCodes);
}

export function calculatePromoDiscountAmount(subtotal, promoCodeEntry) {
    const safeSubtotal = parseAmount(subtotal);
    const normalizedEntry = promoCodeEntry ? normalizePromoCodeEntry(promoCodeEntry) : null;

    if (!normalizedEntry?.normalizedCode || !normalizedEntry.isActive || normalizedEntry.numericDiscountValue <= 0 || safeSubtotal <= 0) {
        return 0;
    }

    if (normalizedEntry.discountType === 'percentage') {
        return Math.min(safeSubtotal, (safeSubtotal * normalizedEntry.numericDiscountValue) / 100);
    }

    return Math.min(safeSubtotal, normalizedEntry.numericDiscountValue);
}