function normalizeText(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function parseAmount(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
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

export const SHIPPING_ZONE_RATE_FIELDS = Object.freeze([
    {
        key: 'cairo',
        label: 'Cairo | القاهرة الكبرى',
        description: 'القاهرة، الجيزة، القليوبية'
    },
    {
        key: 'alex',
        label: 'Alex | الإسكندرية',
        description: 'الإسكندرية'
    },
    {
        key: 'deltaCanal',
        label: 'Delta & Canal | الدلتا والقناة',
        description: 'البحيرة، الدقهلية، دمياط، الغربية، الشرقية، المنوفية، كفر الشيخ، الإسماعيلية، السويس، بورسعيد'
    },
    {
        key: 'upperRedSea',
        label: 'Upper Egypt & Red Sea | الصعيد والبحر الأحمر',
        description: 'الفيوم، بني سويف، المنيا، أسيوط، سوهاج، قنا، الأقصر، أسوان، البحر الأحمر، الوادي الجديد، مطروح، شمال سيناء، جنوب سيناء'
    }
]);

export const SHIPPING_ZONE_LABELS = Object.freeze(
    SHIPPING_ZONE_RATE_FIELDS.reduce((accumulator, field) => ({
        ...accumulator,
        [field.key]: field.label
    }), {})
);

export const DEFAULT_SIDEUP_FALLBACK_DELIVERY_RATES = Object.freeze({
    cairo: '97',
    alex: '102',
    deltaCanal: '110',
    upperRedSea: '124'
});

export const GOVERNORATE_OPTIONS = Object.freeze([
    { value: 'القاهرة', label: 'القاهرة', zoneKey: 'cairo' },
    { value: 'الجيزة', label: 'الجيزة', zoneKey: 'cairo' },
    { value: 'القليوبية', label: 'القليوبية', zoneKey: 'cairo' },
    { value: 'الإسكندرية', label: 'الإسكندرية', zoneKey: 'alex' },
    { value: 'البحيرة', label: 'البحيرة', zoneKey: 'deltaCanal' },
    { value: 'كفر الشيخ', label: 'كفر الشيخ', zoneKey: 'deltaCanal' },
    { value: 'الدقهلية', label: 'الدقهلية', zoneKey: 'deltaCanal' },
    { value: 'دمياط', label: 'دمياط', zoneKey: 'deltaCanal' },
    { value: 'الغربية', label: 'الغربية', zoneKey: 'deltaCanal' },
    { value: 'الشرقية', label: 'الشرقية', zoneKey: 'deltaCanal' },
    { value: 'المنوفية', label: 'المنوفية', zoneKey: 'deltaCanal' },
    { value: 'الإسماعيلية', label: 'الإسماعيلية', zoneKey: 'deltaCanal' },
    { value: 'السويس', label: 'السويس', zoneKey: 'deltaCanal' },
    { value: 'بورسعيد', label: 'بورسعيد', zoneKey: 'deltaCanal' },
    { value: 'الفيوم', label: 'الفيوم', zoneKey: 'upperRedSea' },
    { value: 'بني سويف', label: 'بني سويف', zoneKey: 'upperRedSea' },
    { value: 'المنيا', label: 'المنيا', zoneKey: 'upperRedSea' },
    { value: 'أسيوط', label: 'أسيوط', zoneKey: 'upperRedSea' },
    { value: 'سوهاج', label: 'سوهاج', zoneKey: 'upperRedSea' },
    { value: 'قنا', label: 'قنا', zoneKey: 'upperRedSea' },
    { value: 'الأقصر', label: 'الأقصر', zoneKey: 'upperRedSea' },
    { value: 'أسوان', label: 'أسوان', zoneKey: 'upperRedSea' },
    { value: 'البحر الأحمر', label: 'البحر الأحمر', zoneKey: 'upperRedSea' },
    { value: 'الوادي الجديد', label: 'الوادي الجديد', zoneKey: 'upperRedSea' },
    { value: 'مطروح', label: 'مطروح', zoneKey: 'upperRedSea' },
    { value: 'شمال سيناء', label: 'شمال سيناء', zoneKey: 'upperRedSea' },
    { value: 'جنوب سيناء', label: 'جنوب سيناء', zoneKey: 'upperRedSea' }
]);

const GOVERNORATE_ZONE_LOOKUP = new Map(
    GOVERNORATE_OPTIONS.map((entry) => [normalizeGovernorateLookupValue(entry.value), entry.zoneKey])
);

export function normalizeShippingRates(shippingRates = {}) {
    return {
        cairo: normalizeText(shippingRates.cairo, DEFAULT_SIDEUP_FALLBACK_DELIVERY_RATES.cairo),
        alex: normalizeText(shippingRates.alex, DEFAULT_SIDEUP_FALLBACK_DELIVERY_RATES.alex),
        deltaCanal: normalizeText(shippingRates.deltaCanal, DEFAULT_SIDEUP_FALLBACK_DELIVERY_RATES.deltaCanal),
        upperRedSea: normalizeText(shippingRates.upperRedSea, DEFAULT_SIDEUP_FALLBACK_DELIVERY_RATES.upperRedSea)
    };
}

export function getShippingZoneForGovernorate(governorate) {
    const normalizedGovernorate = normalizeGovernorateLookupValue(governorate);
    return normalizedGovernorate ? (GOVERNORATE_ZONE_LOOKUP.get(normalizedGovernorate) || '') : '';
}

export function getShippingPricingDetails({ governorate = '', shippingRates = DEFAULT_SIDEUP_FALLBACK_DELIVERY_RATES, fallbackAmount = 0 } = {}) {
    const normalizedGovernorate = normalizeText(governorate);
    const zoneKey = getShippingZoneForGovernorate(normalizedGovernorate);
    const normalizedRates = normalizeShippingRates(shippingRates);
    const amount = zoneKey
        ? parseAmount(normalizedRates[zoneKey])
        : parseAmount(fallbackAmount);

    return {
        governorate: normalizedGovernorate,
        zoneKey,
        zoneLabel: zoneKey ? (SHIPPING_ZONE_LABELS[zoneKey] || '') : '',
        amount
    };
}