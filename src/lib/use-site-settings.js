'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_BOSTA_DELIVERY_RATES, normalizeShippingRates } from '@/lib/shipping-zones';

export const DEFAULT_SITE_SETTINGS = Object.freeze({
    whatsapp: '201026600350',
    priceIncrease: '0',
    shipping: '0',
    shippingRates: Object.freeze({ ...DEFAULT_BOSTA_DELIVERY_RATES }),
    promoCode: '',
    promoDiscountType: 'percentage',
    promoDiscountValue: '0',
    phone: '',
    facebook: 'https://www.facebook.com',
    whatsappChannel: '',
    maps: 'https://maps.google.com'
});

function normalizeText(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

export function sanitizePhoneNumber(value) {
    return String(value ?? '').replace(/[^\d]/g, '');
}

function normalizePromoDiscountType(value) {
    return String(value ?? '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'percentage';
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
    return {
        whatsapp: sanitizePhoneNumber(settings.whatsapp || DEFAULT_SITE_SETTINGS.whatsapp) || DEFAULT_SITE_SETTINGS.whatsapp,
        priceIncrease: normalizeText(settings.priceIncrease, DEFAULT_SITE_SETTINGS.priceIncrease),
        shipping: normalizeText(settings.shipping, DEFAULT_SITE_SETTINGS.shipping),
        shippingRates: normalizeShippingRates(settings.shippingRates || DEFAULT_SITE_SETTINGS.shippingRates),
        promoCode: normalizeText(settings.promoCode, DEFAULT_SITE_SETTINGS.promoCode),
        promoDiscountType: normalizePromoDiscountType(settings.promoDiscountType || DEFAULT_SITE_SETTINGS.promoDiscountType),
        promoDiscountValue: normalizeText(settings.promoDiscountValue, DEFAULT_SITE_SETTINGS.promoDiscountValue),
        phone: normalizeText(settings.phone, DEFAULT_SITE_SETTINGS.phone),
        facebook: normalizeText(settings.facebook, DEFAULT_SITE_SETTINGS.facebook),
        whatsappChannel: normalizeText(settings.whatsappChannel, DEFAULT_SITE_SETTINGS.whatsappChannel),
        maps: normalizeText(settings.maps, DEFAULT_SITE_SETTINGS.maps)
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

        return {
            whatsappNumber: sanitizePhoneNumber(siteSettings.whatsapp),
            whatsappUrl: buildWhatsAppUrl(siteSettings.whatsapp),
            phone: siteSettings.phone,
            phoneNumbers,
            primaryPhone,
            phoneUrl: primaryPhone ? `tel:${primaryPhone}` : '',
            facebookUrl: siteSettings.facebook || DEFAULT_SITE_SETTINGS.facebook,
            whatsappChannelUrl: siteSettings.whatsappChannel,
            mapsUrl: siteSettings.maps || DEFAULT_SITE_SETTINGS.maps,
            priceIncrease: siteSettings.priceIncrease,
            shippingPrice: siteSettings.shipping,
            shippingRates: normalizeShippingRates(siteSettings.shippingRates),
            promoCode: siteSettings.promoCode,
            promoDiscountType: normalizePromoDiscountType(siteSettings.promoDiscountType),
            promoDiscountValue: siteSettings.promoDiscountValue
        };
    }, [siteSettings]);

    return {
        siteSettings,
        derivedSettings,
        isLoading
    };
}