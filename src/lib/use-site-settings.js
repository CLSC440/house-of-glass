'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toAbsoluteSiteUrl } from '@/lib/site-origin';
import {
    buildLegacyPromoSettingsFromPromoCodes,
    getActivePromoCodes,
    normalizePromoCodes
} from '@/lib/promo-codes';
import { DEFAULT_SIDEUP_FALLBACK_DELIVERY_RATES, normalizeShippingRates } from '@/lib/shipping-zones';

export const DEFAULT_SITE_SETTINGS = Object.freeze({
    whatsapp: '201026600350',
    priceIncrease: '0',
    shipping: '0',
    shippingRates: Object.freeze({ ...DEFAULT_SIDEUP_FALLBACK_DELIVERY_RATES }),
    promoCodes: Object.freeze([]),
    promoCode: '',
    promoDiscountType: 'percentage',
    promoDiscountValue: '0',
    phone: '',
    facebook: 'https://www.facebook.com',
    instagram: '',
    tiktok: '',
    website: toAbsoluteSiteUrl('/'),
    whatsappChannel: '',
    maps: 'https://maps.google.com',
    infoPageTitle: 'وصل لنا بسهولة',
    infoPageDescription: 'كل طرق التواصل والوصول السريعة لـ House Of Glass في مكان واحد.',
    infoPageNote: 'اختار الطريقة الأنسب ليك للتواصل أو زيارة الموقع والمتجر.'
});

function normalizeText(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

export function sanitizePhoneNumber(value) {
    return String(value ?? '').replace(/[^\d]/g, '');
}

export function getPrimaryPhoneNumber(value) {
    const firstPhoneValue = String(value ?? '')
        .split(/[\n,;/|]+/)
        .map((entry) => entry.trim())
        .find(Boolean);

    return firstPhoneValue || '';
}

export function getPhoneNumbers(value) {
    return String(value ?? '')
        .split(/[\n,;/|]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => ({
            raw: entry,
            digits: sanitizePhoneNumber(entry)
        }))
        .filter((entry) => entry.digits)
        .filter((entry, index, list) => list.findIndex((candidate) => candidate.digits === entry.digits) === index);
}

export function normalizeSiteSettings(settings = {}) {
    const promoCodes = normalizePromoCodes(settings.promoCodes, {
        promoCode: settings.promoCode || DEFAULT_SITE_SETTINGS.promoCode,
        promoDiscountType: settings.promoDiscountType || DEFAULT_SITE_SETTINGS.promoDiscountType,
        promoDiscountValue: settings.promoDiscountValue || DEFAULT_SITE_SETTINGS.promoDiscountValue
    });
    const legacyPromoSettings = buildLegacyPromoSettingsFromPromoCodes(promoCodes);

    return {
        whatsapp: sanitizePhoneNumber(settings.whatsapp || DEFAULT_SITE_SETTINGS.whatsapp) || DEFAULT_SITE_SETTINGS.whatsapp,
        priceIncrease: normalizeText(settings.priceIncrease, DEFAULT_SITE_SETTINGS.priceIncrease),
        shipping: normalizeText(settings.shipping, DEFAULT_SITE_SETTINGS.shipping),
        shippingRates: normalizeShippingRates(settings.shippingRates || DEFAULT_SITE_SETTINGS.shippingRates),
        promoCodes,
        promoCode: legacyPromoSettings.promoCode,
        promoDiscountType: legacyPromoSettings.promoDiscountType,
        promoDiscountValue: legacyPromoSettings.promoDiscountValue,
        phone: normalizeText(settings.phone, DEFAULT_SITE_SETTINGS.phone),
        facebook: normalizeText(settings.facebook, DEFAULT_SITE_SETTINGS.facebook),
        instagram: normalizeText(settings.instagram, DEFAULT_SITE_SETTINGS.instagram),
        tiktok: normalizeText(settings.tiktok, DEFAULT_SITE_SETTINGS.tiktok),
        website: normalizeText(settings.website, DEFAULT_SITE_SETTINGS.website),
        whatsappChannel: normalizeText(settings.whatsappChannel, DEFAULT_SITE_SETTINGS.whatsappChannel),
        maps: normalizeText(settings.maps, DEFAULT_SITE_SETTINGS.maps),
        infoPageTitle: normalizeText(settings.infoPageTitle, DEFAULT_SITE_SETTINGS.infoPageTitle),
        infoPageDescription: normalizeText(settings.infoPageDescription, DEFAULT_SITE_SETTINGS.infoPageDescription),
        infoPageNote: normalizeText(settings.infoPageNote, DEFAULT_SITE_SETTINGS.infoPageNote)
    };
}

export function buildWhatsAppUrl(phoneNumber, message = '') {
    const cleanPhoneNumber = sanitizePhoneNumber(phoneNumber || DEFAULT_SITE_SETTINGS.whatsapp) || DEFAULT_SITE_SETTINGS.whatsapp;
    const baseUrl = `https://wa.me/${cleanPhoneNumber}`;

    if (!message) {
        return baseUrl;
    }

    return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

export function useSiteSettings() {
    const [siteSettings, setSiteSettings] = useState(DEFAULT_SITE_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            doc(db, 'settings', 'contact'),
            (snapshot) => {
                setSiteSettings(normalizeSiteSettings(snapshot.exists() ? snapshot.data() : {}));
                setIsLoading(false);
            },
            () => {
                setIsLoading(false);
            }
        );

        return unsubscribe;
    }, []);

    const derivedSettings = useMemo(() => {
        const primaryPhone = getPrimaryPhoneNumber(siteSettings.phone);
        const phoneNumbers = getPhoneNumbers(siteSettings.phone);
        const promoCodes = normalizePromoCodes(siteSettings.promoCodes, {
            promoCode: siteSettings.promoCode,
            promoDiscountType: siteSettings.promoDiscountType,
            promoDiscountValue: siteSettings.promoDiscountValue
        });
        const activePromoCodes = getActivePromoCodes(promoCodes);
        const primaryPromoCode = activePromoCodes[0] || promoCodes[0] || null;

        return {
            whatsappNumber: sanitizePhoneNumber(siteSettings.whatsapp),
            whatsappUrl: buildWhatsAppUrl(siteSettings.whatsapp),
            phone: siteSettings.phone,
            phoneNumbers,
            primaryPhone,
            phoneUrl: primaryPhone ? `tel:${primaryPhone}` : '',
            facebookUrl: siteSettings.facebook || DEFAULT_SITE_SETTINGS.facebook,
            instagramUrl: siteSettings.instagram,
            tiktokUrl: siteSettings.tiktok,
            websiteUrl: siteSettings.website || DEFAULT_SITE_SETTINGS.website,
            whatsappChannelUrl: siteSettings.whatsappChannel,
            mapsUrl: siteSettings.maps || DEFAULT_SITE_SETTINGS.maps,
            infoPageTitle: siteSettings.infoPageTitle || DEFAULT_SITE_SETTINGS.infoPageTitle,
            infoPageDescription: siteSettings.infoPageDescription || DEFAULT_SITE_SETTINGS.infoPageDescription,
            infoPageNote: siteSettings.infoPageNote || DEFAULT_SITE_SETTINGS.infoPageNote,
            priceIncrease: siteSettings.priceIncrease,
            shippingPrice: siteSettings.shipping,
            shippingRates: normalizeShippingRates(siteSettings.shippingRates),
            promoCodes,
            activePromoCodes,
            promoCode: primaryPromoCode?.code || '',
            promoDiscountType: primaryPromoCode?.discountType || DEFAULT_SITE_SETTINGS.promoDiscountType,
            promoDiscountValue: primaryPromoCode?.discountValue || DEFAULT_SITE_SETTINGS.promoDiscountValue
        };
    }, [siteSettings]);

    return {
        siteSettings,
        derivedSettings,
        isLoading
    };
}