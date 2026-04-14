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
    const normalizedValue = String(value ?? '').trim().toLowerCase();

    if (normalizedValue === 'fixed') {
        return 'fixed';
    }

    if (normalizedValue === 'free_shipping') {
        return 'free_shipping';
    }

    return 'percentage';
}

function normalizeGovernorateLookupValue(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, ' ');
}

function normalizePromoGovernorates(governorates = []) {
    const sourceValues = Array.isArray(governorates) ? governorates : [governorates];
    const seenGovernorates = new Set();

    return sourceValues
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
        .filter((entry) => {
            const normalizedEntry = normalizeGovernorateLookupValue(entry);
            if (!normalizedEntry || seenGovernorates.has(normalizedEntry)) {
                return false;
            }

            seenGovernorates.add(normalizedEntry);
            return true;
        });
}

export function normalizePromoDiscountValue(value, discountType = 'percentage') {
    const normalizedType = normalizePromoDiscountType(discountType);

    if (normalizedType === 'free_shipping') {
        return '0';
    }

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
        eligibleGovernorates: normalizePromoGovernorates(overrides.eligibleGovernorates),
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
        eligibleGovernorates: normalizePromoGovernorates(entry.eligibleGovernorates),
        normalizedEligibleGovernorates: normalizePromoGovernorates(entry.eligibleGovernorates).map((value) => normalizeGovernorateLookupValue(value)),
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

export function promoCodeAppliesToGovernorate(promoCodeEntry, governorate = '') {
    const normalizedEntry = promoCodeEntry ? normalizePromoCodeEntry(promoCodeEntry) : null;

    if (!normalizedEntry) {
        return false;
    }

    if (normalizedEntry.normalizedEligibleGovernorates.length === 0) {
        return true;
    }

    const normalizedGovernorate = normalizeGovernorateLookupValue(governorate);
    if (!normalizedGovernorate) {
        return false;
    }

    return normalizedEntry.normalizedEligibleGovernorates.includes(normalizedGovernorate);
}

export function getPromoCodeApplicationDetails({ subtotal = 0, shippingAmount = 0, promoCodeEntry = null, governorate = '', isShippingSelected = false } = {}) {
    const safeSubtotal = parseAmount(subtotal);
    const safeShippingAmount = parseAmount(shippingAmount);
    const normalizedEntry = promoCodeEntry ? normalizePromoCodeEntry(promoCodeEntry) : null;

    if (!normalizedEntry?.normalizedCode) {
        return {
            entry: normalizedEntry,
            isApplicable: false,
            amount: 0,
            reason: 'missing'
        };
    }

    if (!normalizedEntry.isActive) {
        return {
            entry: normalizedEntry,
            isApplicable: false,
            amount: 0,
            reason: 'inactive'
        };
    }

    if (normalizedEntry.discountType === 'free_shipping') {
        if (!isShippingSelected) {
            return {
                entry: normalizedEntry,
                isApplicable: false,
                amount: 0,
                reason: 'shipping_required'
            };
        }

        if (!normalizeText(governorate)) {
            return {
                entry: normalizedEntry,
                isApplicable: false,
                amount: 0,
                reason: 'governorate_required'
            };
        }

        if (!promoCodeAppliesToGovernorate(normalizedEntry, governorate)) {
            return {
                entry: normalizedEntry,
                isApplicable: false,
                amount: 0,
                reason: 'governorate_not_eligible'
            };
        }

        return {
            entry: normalizedEntry,
            isApplicable: true,
            amount: safeShippingAmount,
            reason: 'ok'
        };
    }

    if (normalizedEntry.numericDiscountValue <= 0 || safeSubtotal <= 0) {
        return {
            entry: normalizedEntry,
            isApplicable: false,
            amount: 0,
            reason: 'no_value'
        };
    }

    if (normalizedEntry.discountType === 'percentage') {
        return {
            entry: normalizedEntry,
            isApplicable: true,
            amount: Math.min(safeSubtotal, (safeSubtotal * normalizedEntry.numericDiscountValue) / 100),
            reason: 'ok'
        };
    }

    return {
        entry: normalizedEntry,
        isApplicable: true,
        amount: Math.min(safeSubtotal, normalizedEntry.numericDiscountValue),
        reason: 'ok'
    };
}

export function calculatePromoDiscountAmount(subtotal, promoCodeEntry) {
    return getPromoCodeApplicationDetails({ subtotal, promoCodeEntry }).amount;
}