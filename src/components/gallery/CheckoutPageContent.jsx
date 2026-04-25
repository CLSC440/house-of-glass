'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useGallery } from '@/contexts/GalleryContext';
import { findPromoCodeByInput, getPromoCodeApplicationDetails, normalizePromoCodeLookupValue } from '@/lib/promo-codes';
import { useSiteSettings } from '@/lib/use-site-settings';
import { saveCurrentUserShippingAddress, upsertCurrentUserProfile } from '@/lib/account-api';
import { GOVERNORATE_OPTIONS, getShippingPricingDetails } from '@/lib/shipping-zones';
import BrandLoadingScreen from '@/components/layout/BrandLoadingScreen';

function normalizeCheckoutType(value) {
    return String(value || '').trim().toLowerCase() === 'wholesale' ? 'wholesale' : 'retail';
}

function formatCurrency(value) {
    return `${(Number(value) || 0).toLocaleString()} ج.م`;
}

function parseAmount(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function normalizeDeliveryMethod(value) {
    return String(value || '').trim().toLowerCase() === 'shipping' ? 'shipping' : 'pickup';
}

function normalizeSideUpCourierId(value) {
    const normalizedValue = String(value ?? '').trim();
    return normalizedValue && normalizedValue !== '0' ? normalizedValue : '';
}

function isMylerzCourier(value) {
    return String(value || '').trim().toLowerCase().includes('mylerz');
}

function normalizeSideUpCourierBrandKey(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();

    if (!normalizedValue) {
        return 'generic';
    }

    if (normalizedValue.includes('mylerz')) {
        return 'mylerz';
    }

    if (normalizedValue.includes('aramex')) {
        return 'aramex';
    }

    if (normalizedValue.includes('fedex')) {
        return 'fedex';
    }

    if (normalizedValue.includes('smsa')) {
        return 'smsa';
    }

    if (normalizedValue.includes('j&t') || normalizedValue.includes('j and t') || normalizedValue.includes('jnt')) {
        return 'jt';
    }

    if (normalizedValue === 'yfs' || normalizedValue.includes('yalla')) {
        return 'yfs';
    }

    return 'generic';
}

function CourierLogoBadge({ courierName }) {
    const brandKey = normalizeSideUpCourierBrandKey(courierName);
    const baseClasses = 'inline-flex h-12 min-w-[7.25rem] items-center justify-center rounded-2xl border px-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)]';

    if (brandKey === 'fedex') {
        return (
            <span className={`${baseClasses} border-[#4d148c]/20 bg-white`} aria-hidden="true">
                <span className="text-[1.35rem] font-black tracking-[-0.08em]">
                    <span className="text-[#4d148c]">Fed</span>
                    <span className="text-[#ff6600]">Ex</span>
                </span>
            </span>
        );
    }

    if (brandKey === 'aramex') {
        return (
            <span className={`${baseClasses} border-[#e94e1b]/20 bg-white`} aria-hidden="true">
                <span className="flex items-center gap-2 text-[#e94e1b]">
                    <span className="h-[2px] w-4 rounded-full bg-[#e94e1b]"></span>
                    <span className="text-[1.15rem] font-black italic tracking-[-0.05em] lowercase">aramex</span>
                    <span className="h-[2px] w-4 rounded-full bg-[#e94e1b]"></span>
                </span>
            </span>
        );
    }

    if (brandKey === 'smsa') {
        return (
            <span className={`${baseClasses} border-[#d7282f]/20 bg-white`} aria-hidden="true">
                <span className="rounded-xl bg-[#d7282f] px-3 py-1 text-[1rem] font-black uppercase tracking-[0.18em] text-white">
                    SMSA
                </span>
            </span>
        );
    }

    if (brandKey === 'jt') {
        return (
            <span className={`${baseClasses} border-[#d71920]/20 bg-white`} aria-hidden="true">
                <span className="flex items-center gap-2 text-[#d71920]">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d71920] text-[0.8rem] font-black text-white">J</span>
                    <span className="text-[1.05rem] font-black tracking-[-0.04em]">J&amp;T</span>
                </span>
            </span>
        );
    }

    if (brandKey === 'mylerz') {
        return (
            <span className={`${baseClasses} border-[#ff4f93]/20 bg-white`} aria-hidden="true">
                <span className="flex items-center gap-2 text-[#ff4f93]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff4f93]"></span>
                    <span className="text-[1.1rem] font-black tracking-[-0.05em]">Mylerz</span>
                </span>
            </span>
        );
    }

    if (brandKey === 'yfs') {
        return (
            <span className={`${baseClasses} border-[#111827]/10 bg-white`} aria-hidden="true">
                <span className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#35b24a] text-[0.8rem] font-black text-white">Y</span>
                    <span className="text-[1.05rem] font-black tracking-[0.14em] text-[#111827]">YFS</span>
                </span>
            </span>
        );
    }

    return (
        <span className={`${baseClasses} border-brandGold/20 bg-white`} aria-hidden="true">
            <span className="flex items-center gap-2 text-brandBlue">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brandBlue text-[0.8rem] font-black text-white">
                    <i className="fa-solid fa-truck-fast text-[0.75rem]"></i>
                </span>
                <span className="text-[0.95rem] font-black">Courier</span>
            </span>
        </span>
    );
}

function getSideUpQuoteAmount(quote = null) {
    const totalDue = Number(quote?.totalDue);
    if (Number.isFinite(totalDue) && totalDue >= 0) {
        return totalDue;
    }

    const deliveryFees = Number(quote?.deliveryFees);
    return Number.isFinite(deliveryFees) && deliveryFees >= 0 ? deliveryFees : 0;
}

function normalizeSideUpLivePricingQuote(rawQuote = {}) {
    const courierId = normalizeSideUpCourierId(rawQuote?.courierId || rawQuote?.id);
    if (!courierId) {
        return null;
    }

    return {
        courierId,
        courierName: String(rawQuote?.courierName || rawQuote?.name || '').trim(),
        deliveryTime: String(rawQuote?.deliveryTime || rawQuote?.delivery_time || '').trim(),
        totalDue: getSideUpQuoteAmount({ totalDue: rawQuote?.totalDue }),
        deliveryFees: getSideUpQuoteAmount({ deliveryFees: rawQuote?.deliveryFees }),
        vatAmount: parseAmount(rawQuote?.vatAmount ?? rawQuote?.vat),
        codFees: parseAmount(rawQuote?.codFees),
        paymentFees: parseAmount(rawQuote?.paymentFees),
        blocked: rawQuote?.blocked === true
    };
}

function formatPromoDiscountLabel(promoSettings) {
    if (promoSettings.discountType === 'free_shipping') {
        return 'شحن مجاني';
    }

    if (promoSettings.discountType === 'percentage') {
        return `${promoSettings.numericDiscountValue ?? promoSettings.discountValue}%`;
    }

    return formatCurrency(promoSettings.numericDiscountValue ?? promoSettings.discountValue);
}

function getPromoApplicationErrorMessage(reason) {
    if (reason === 'shipping_required') {
        return 'كود الشحن المجاني يعمل فقط عند اختيار الشحن إلى العنوان.';
    }

    if (reason === 'governorate_required') {
        return 'اختر المحافظة أولاً لتفعيل كود الشحن المجاني.';
    }

    if (reason === 'governorate_not_eligible') {
        return 'كود الشحن المجاني لا ينطبق على المحافظة المختارة.';
    }

    return 'هذا الـ Promo Code لا يمكن تطبيقه حالياً.';
}

function buildCustomerSnapshot(currentUser, profileData, fallbackRole) {
    if (!currentUser) {
        return null;
    }

    const name = profileData?.name
        || [profileData?.firstName, profileData?.lastName].filter(Boolean).join(' ')
        || currentUser.displayName
        || currentUser.email?.split('@')[0]
        || 'Guest User';

    return {
        name,
        email: profileData?.email || currentUser.email || 'غير متوفر',
        phone: profileData?.phone || 'غير متوفر',
        role: profileData?.role || fallbackRole || 'customer'
    };
}

function getCustomerPhoneValue(customerInfo) {
    const phone = String(customerInfo?.phone || '').trim();
    return phone && phone !== 'غير متوفر' ? phone : '';
}

function normalizeDistrictLookupValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064b-\u065f\u0670]/g, '')
        .replace(/[^a-z0-9\u0600-\u06ff\s-]/gi, ' ')
        .replace(/\s+/g, ' ');
}

const SHIPPING_ADDRESS_FIELDS = [
    {
        key: 'recipientName',
        label: 'اسم المستلم (اختياري)',
        placeholder: 'اتركه فارغًا لاستخدام اسم الحساب',
        includeInAddressSummary: false,
        wrapperClassName: 'sm:col-span-2'
    },
    {
        key: 'recipientPhone',
        label: 'رقم موبايل بديل (اختياري)',
        placeholder: '01012345678',
        includeInAddressSummary: false,
        inputMode: 'tel',
        dir: 'ltr',
        wrapperClassName: 'sm:col-span-2'
    },
    {
        key: 'governorate',
        label: 'المحافظة',
        placeholder: 'اختر المحافظة',
        type: 'select',
        options: GOVERNORATE_OPTIONS,
        wrapperClassName: 'sm:col-span-2'
    },
    {
        key: 'district',
        label: 'الحي / المنطقة',
        placeholder: 'اختر الحي / المنطقة',
        type: 'district-select',
        wrapperClassName: 'sm:col-span-2'
    },
    {
        key: 'streetName',
        label: 'اسم الشارع',
        placeholder: 'مثال: شارع عباس العقاد'
    },
    {
        key: 'houseNumber',
        label: 'رقم العقار / البيت',
        placeholder: 'مثال: 24',
        inputMode: 'numeric'
    },
    {
        key: 'floorNumber',
        label: 'الدور',
        placeholder: 'مثال: 3',
        inputMode: 'numeric'
    },
    {
        key: 'apartmentNumber',
        label: 'رقم الشقة',
        placeholder: 'مثال: 12',
        inputMode: 'numeric'
    },
    {
        key: 'deliveryInstructions',
        label: 'علامة مميزة / تعليمات التوصيل',
        placeholder: 'مثال: مدينة نصر - الحي السابع - بجوار سيتي ستارز',
        wrapperClassName: 'sm:col-span-2'
    }
];

function createEmptyShippingAddressFields() {
    return {
        recipientName: '',
        recipientPhone: '',
        governorate: '',
        district: '',
        districtId: '',
        cityId: '',
        cityName: '',
        zoneId: '',
        zoneName: '',
        streetName: '',
        houseNumber: '',
        floorNumber: '',
        apartmentNumber: '',
        deliveryInstructions: ''
    };
}

function normalizeSavedShippingAddress(rawAddress = {}) {
    return {
        id: String(rawAddress?.id || '').trim(),
        recipientName: String(rawAddress?.recipientName || '').trim(),
        recipientPhone: String(rawAddress?.recipientPhone || '').trim(),
        governorate: String(rawAddress?.governorate || '').trim(),
        district: String(rawAddress?.district || '').trim(),
        districtId: String(rawAddress?.districtId || '').trim(),
        cityId: String(rawAddress?.cityId || '').trim(),
        cityName: String(rawAddress?.cityName || '').trim(),
        zoneId: String(rawAddress?.zoneId || '').trim(),
        zoneName: String(rawAddress?.zoneName || '').trim(),
        streetName: String(rawAddress?.streetName || '').trim(),
        houseNumber: String(rawAddress?.houseNumber || '').trim(),
        floorNumber: String(rawAddress?.floorNumber || '').trim(),
        apartmentNumber: String(rawAddress?.apartmentNumber || '').trim(),
        deliveryInstructions: String(rawAddress?.deliveryInstructions || '').trim(),
        createdAt: String(rawAddress?.createdAt || '').trim(),
        updatedAt: String(rawAddress?.updatedAt || '').trim()
    };
}

function normalizeSavedShippingAddresses(rawAddresses = []) {
    if (!Array.isArray(rawAddresses)) {
        return [];
    }

    return rawAddresses
        .map(normalizeSavedShippingAddress)
        .filter((address) => address.id && address.governorate && address.district && address.streetName && address.houseNumber);
}

function createShippingAddressFieldsFromSavedAddress(address = {}) {
    const normalizedAddress = normalizeSavedShippingAddress(address);
    return {
        recipientName: normalizedAddress.recipientName,
        recipientPhone: normalizedAddress.recipientPhone,
        governorate: normalizedAddress.governorate,
        district: normalizedAddress.district,
        districtId: normalizedAddress.districtId,
        cityId: normalizedAddress.cityId,
        cityName: normalizedAddress.cityName,
        zoneId: normalizedAddress.zoneId,
        zoneName: normalizedAddress.zoneName,
        streetName: normalizedAddress.streetName,
        houseNumber: normalizedAddress.houseNumber,
        floorNumber: normalizedAddress.floorNumber,
        apartmentNumber: normalizedAddress.apartmentNumber,
        deliveryInstructions: normalizedAddress.deliveryInstructions
    };
}

function hasDetailedShippingAddress(fields) {
    return Boolean(
        String(fields?.governorate || '').trim()
        && String(fields?.districtId || '').trim()
        && String(fields?.streetName || '').trim()
        && String(fields?.houseNumber || '').trim()
    );
}

function getShippingAddressValidation(fields) {
    if (!String(fields?.governorate || '').trim()) {
        return {
            errorMessage: 'اختر المحافظة أولاً قبل تأكيد الطلب.',
            missingFieldKey: 'governorate'
        };
    }

    if (!String(fields?.districtId || '').trim()) {
        return {
            errorMessage: 'اكتب جزء من اسم الحي / المنطقة ثم اختَر النتيجة المناسبة من اقتراحات SideUp قبل تأكيد الطلب.',
            missingFieldKey: 'district'
        };
    }

    if (!String(fields?.streetName || '').trim()) {
        return {
            errorMessage: 'اكتب اسم الشارع قبل تأكيد الطلب.',
            missingFieldKey: 'streetName'
        };
    }

    if (!String(fields?.houseNumber || '').trim()) {
        return {
            errorMessage: 'اكتب رقم العقار / البيت قبل تأكيد الطلب.',
            missingFieldKey: 'houseNumber'
        };
    }

    return {
        errorMessage: '',
        missingFieldKey: ''
    };
}

function buildShippingAddressFromFields(fields) {
    return SHIPPING_ADDRESS_FIELDS
        .filter(({ includeInAddressSummary = true }) => includeInAddressSummary)
        .map(({ key, label }) => {
            const value = String(fields?.[key] || '').trim();
            return value ? `${label}: ${value}` : '';
        })
        .filter(Boolean)
        .join(' | ');
}

function getEffectiveShippingRecipientName(fields, customerInfo) {
    return String(fields?.recipientName || '').trim() || String(customerInfo?.name || '').trim();
}

function getEffectiveShippingRecipientPhone(fields, customerInfo) {
    return String(fields?.recipientPhone || '').trim() || getCustomerPhoneValue(customerInfo);
}

function buildSavedShippingAddressPayload(fields) {
    return {
        recipientName: String(fields?.recipientName || '').trim(),
        recipientPhone: String(fields?.recipientPhone || '').trim(),
        governorate: String(fields?.governorate || '').trim(),
        district: String(fields?.district || '').trim(),
        districtId: String(fields?.districtId || '').trim(),
        cityId: String(fields?.cityId || '').trim(),
        cityName: String(fields?.cityName || '').trim(),
        zoneId: String(fields?.zoneId || '').trim(),
        zoneName: String(fields?.zoneName || '').trim(),
        streetName: String(fields?.streetName || '').trim(),
        houseNumber: String(fields?.houseNumber || '').trim(),
        floorNumber: String(fields?.floorNumber || '').trim(),
        apartmentNumber: String(fields?.apartmentNumber || '').trim(),
        deliveryInstructions: String(fields?.deliveryInstructions || '').trim()
    };
}

function buildSavedShippingAddressSummary(address = {}) {
    const normalizedAddress = normalizeSavedShippingAddress(address);
    return [
        normalizedAddress.governorate,
        normalizedAddress.district,
        normalizedAddress.streetName,
        normalizedAddress.houseNumber ? `عقار ${normalizedAddress.houseNumber}` : '',
        normalizedAddress.deliveryInstructions
    ].filter(Boolean).join(' | ');
}

const CHECKOUT_DRAFT_STORAGE_KEY_PREFIX = 'hog_checkout_draft_';

function getCheckoutDraftStorageKey(checkoutType) {
    return `${CHECKOUT_DRAFT_STORAGE_KEY_PREFIX}${normalizeCheckoutType(checkoutType)}`;
}

function normalizeExpandedDeliverySection(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return normalizedValue === 'shipping' || normalizedValue === 'pickup' ? normalizedValue : null;
}

function normalizeCheckoutDraftShippingAddressFields(rawFields = {}) {
    return buildSavedShippingAddressPayload({
        ...createEmptyShippingAddressFields(),
        ...(rawFields && typeof rawFields === 'object' ? rawFields : {})
    });
}

function hasAnyShippingAddressFieldValue(fields = {}) {
    return Object.values(normalizeCheckoutDraftShippingAddressFields(fields)).some((value) => String(value || '').trim());
}

function normalizeCheckoutDraft(rawDraft = null) {
    if (!rawDraft || typeof rawDraft !== 'object') {
        return null;
    }

    return {
        deliveryMethod: normalizeDeliveryMethod(rawDraft.deliveryMethod),
        expandedDeliverySection: normalizeExpandedDeliverySection(rawDraft.expandedDeliverySection),
        isShippingAddressFormOpen: Boolean(rawDraft.isShippingAddressFormOpen),
        selectedShippingAddressId: String(rawDraft.selectedShippingAddressId || '').trim(),
        selectedShippingCourierId: normalizeSideUpCourierId(rawDraft.selectedShippingCourierId),
        makeShippingAddressDefault: Boolean(rawDraft.makeShippingAddressDefault),
        shippingAddressFields: normalizeCheckoutDraftShippingAddressFields(rawDraft.shippingAddressFields)
    };
}

function hasMeaningfulCheckoutDraft(draft) {
    const normalizedDraft = normalizeCheckoutDraft(draft);

    if (!normalizedDraft) {
        return false;
    }

    return Boolean(
        normalizedDraft.deliveryMethod === 'shipping'
        || normalizedDraft.expandedDeliverySection
        || normalizedDraft.isShippingAddressFormOpen
        || normalizedDraft.selectedShippingAddressId
        || normalizedDraft.selectedShippingCourierId
        || normalizedDraft.makeShippingAddressDefault
        || hasAnyShippingAddressFieldValue(normalizedDraft.shippingAddressFields)
    );
}

function readCheckoutDraft(checkoutType) {
    if (typeof window === 'undefined') {
        return null;
    }

    const storageKey = getCheckoutDraftStorageKey(checkoutType);

    try {
        const rawValue = window.sessionStorage.getItem(storageKey);
        if (!rawValue) {
            return null;
        }

        return normalizeCheckoutDraft(JSON.parse(rawValue));
    } catch (error) {
        console.error('Failed to read checkout draft:', error);
        window.sessionStorage.removeItem(storageKey);
        return null;
    }
}

function writeCheckoutDraft(checkoutType, draft) {
    if (typeof window === 'undefined') {
        return;
    }

    const storageKey = getCheckoutDraftStorageKey(checkoutType);
    const normalizedDraft = normalizeCheckoutDraft(draft);

    if (!hasMeaningfulCheckoutDraft(normalizedDraft)) {
        window.sessionStorage.removeItem(storageKey);
        return;
    }

    window.sessionStorage.setItem(storageKey, JSON.stringify({
        ...normalizedDraft,
        updatedAt: Date.now()
    }));
}

function clearCheckoutDraft(checkoutType) {
    if (typeof window === 'undefined') {
        return;
    }

    window.sessionStorage.removeItem(getCheckoutDraftStorageKey(checkoutType));
}

function OrderSuccessPopup({ isWholesale, orderConfirmation, onTrackOrder, onCloseToHome }) {
    if (!orderConfirmation) {
        return null;
    }

    const isShippingOrder = normalizeDeliveryMethod(orderConfirmation.deliveryMethod) === 'shipping';

    return (
        <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-[#060b17]/72 px-4 py-4 backdrop-blur-sm sm:items-center sm:py-6" dir="rtl">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="checkout-order-success-title"
                className="relative my-auto w-full max-w-[42rem] overflow-hidden rounded-[2rem] border border-brandGold/20 bg-white shadow-[0_28px_80px_rgba(6,11,23,0.38)] dark:bg-darkCard"
            >
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.22),transparent_68%),linear-gradient(180deg,rgba(18,25,38,0.05),transparent)] dark:bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_68%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]"></div>
                <div className="relative px-5 pb-5 pt-5 sm:px-8 sm:pb-8 sm:pt-8">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.24),rgba(18,25,38,0.08))] shadow-[0_18px_45px_rgba(18,25,38,0.16)] sm:h-24 sm:w-24">
                        <div className="relative flex h-[4rem] w-[4rem] items-center justify-center rounded-full bg-white shadow-lg dark:bg-[#0f1728] sm:h-[4.5rem] sm:w-[4.5rem]">
                            <img src="/logo.png" alt="House Of Glass" className="h-8 w-8 object-contain sm:h-9 sm:w-9" />
                            <span className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full border-4 border-white bg-emerald-500 text-xs text-white shadow-md dark:border-darkCard sm:h-8 sm:w-8 sm:text-sm">
                                <i className="fa-solid fa-check"></i>
                            </span>
                        </div>
                    </div>

                    <div className="mt-4 text-center sm:mt-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-brandGold">
                            {isWholesale ? 'Wholesale Order Received' : 'Order Received'}
                        </p>
                        <h3 id="checkout-order-success-title" className="mt-3 text-[1.55rem] font-black leading-[1.12] text-brandBlue dark:text-white sm:text-[2.1rem]">
                            {isWholesale ? 'تم استلام طلب الجملة بنجاح' : 'تم استلام طلبك بنجاح'}
                        </h3>
                        <p className="mt-3 text-[0.95rem] font-bold leading-7 text-slate-500 dark:text-slate-300 sm:text-sm">
                            سجّلنا الطلب عندنا، وتقدر تتابع حالته من صفحة الحساب في أي وقت.
                        </p>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-[1.45rem] border border-brandGold/15 bg-brandGold/[0.05] px-3 py-4 text-right dark:bg-brandGold/[0.08] sm:px-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brandGold">Total Amount</p>
                            <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-300">الإجمالي المطلوب</p>
                            <p className="mt-3 text-[1.25rem] font-black text-emerald-600 dark:text-brandGold sm:text-2xl">{formatCurrency(orderConfirmation.totalPrice)}</p>
                        </div>
                        <div className="rounded-[1.45rem] border border-brandBlue/10 bg-slate-50 px-3 py-4 text-right dark:border-brandGold/15 dark:bg-slate-900/40 sm:px-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brandGold">Order Number</p>
                            <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-300">رقم الطلب</p>
                            <p className="mt-3 text-[1.15rem] font-black text-brandBlue dark:text-white sm:text-lg">{orderConfirmation.orderNumber}</p>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap">
                        <span className="inline-flex items-center rounded-full bg-brandBlue px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white dark:bg-brandGold dark:text-brandBlue">
                            {isShippingOrder ? 'Shipping | شحن' : 'Pickup | استلام'}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-300">
                            Pending Review | قيد المراجعة
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            {orderConfirmation.itemCount} Items
                        </span>
                    </div>

                    <p className="mt-4 text-center text-[0.95rem] font-bold leading-7 text-slate-500 dark:text-slate-300 sm:text-sm">
                        لو حابب تراجع التفاصيل دلوقتي، افتح سجل الطلبات. ولو خلصت، ارجع للمعرض وكمل التصفح.
                    </p>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={onTrackOrder}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-brandGold bg-brandBlue px-3 py-3 text-[0.95rem] font-black text-white transition-transform hover:scale-[1.01] dark:text-white sm:gap-3 sm:px-5 sm:text-sm"
                        >
                            <span>تابع طلبك</span>
                            <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                        </button>
                        <button
                            type="button"
                            onClick={onCloseToHome}
                            className="inline-flex items-center justify-center rounded-2xl border border-brandGold/20 px-3 py-3 text-[0.95rem] font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-brandGold sm:px-5 sm:text-sm"
                        >
                            Close | إغلاق
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CheckoutSubmittingOverlay({ isWholesale }) {
    return (
        <BrandLoadingScreen
            title={isWholesale ? 'Processing wholesale order' : 'Processing your order'}
            message={isWholesale ? 'جاري إرسال طلب الجملة الآن، برجاء الانتظار لحظة حتى يتم تأكيده وعرض تفاصيله.' : 'جاري إرسال طلبك الآن، برجاء الانتظار لحظة حتى يتم تأكيده وعرض تفاصيله.'}
            fixed
            showProgressBar
        />
    );
}

function getSideUpLivePricingFallbackMessage(payload = {}) {
    const code = String(payload?.code || '').trim();

    if (code === 'sideup_pricing_config_missing') {
        return 'التسعير المباشر من SideUp غير مفعّل على هذا السيرفر حالياً، لذلك تم استخدام السعر الاحتياطي.';
    }

    return 'تعذر تحميل السعر المباشر من SideUp حالياً، لذلك تم استخدام السعر الاحتياطي.';
}

function getShippingExtraFeesAmount(rate = null) {
    const codFees = Number(rate?.codFees);
    const paymentFees = Number(rate?.paymentFees);
    return (Number.isFinite(codFees) ? codFees : 0) + (Number.isFinite(paymentFees) ? paymentFees : 0);
}

function getGovernoratePricingZoneOption(options = [], selectedZoneId = '') {
    if (String(selectedZoneId || '').trim()) {
        return null;
    }

    const normalizedOptions = (Array.isArray(options) ? options : [])
        .map((option) => ({
            zoneId: String(option?.zoneId || '').trim(),
            zoneName: String(option?.zoneName || '').trim()
        }))
        .filter((option) => option.zoneId);

    const uniqueZoneIds = Array.from(new Set(normalizedOptions.map((option) => option.zoneId)));
    if (uniqueZoneIds.length !== 1) {
        return null;
    }

    const matchedOption = normalizedOptions.find((option) => option.zoneId === uniqueZoneIds[0]) || normalizedOptions[0];
    return {
        zoneId: matchedOption?.zoneId || '',
        zoneName: matchedOption?.zoneName || ''
    };
}

export default function CheckoutPageContent({ checkoutType }) {
    const router = useRouter();
    const normalizedCheckoutType = normalizeCheckoutType(checkoutType);
    const isWholesale = normalizedCheckoutType === 'wholesale';
    const {
        cartItems,
        cartCount,
        cartSubtotal,
        isLoading: isGalleryLoading,
        isRetailCartPricingReady,
        removeFromCart,
        updateCartQuantity,
        checkoutCart,
        isCheckingOut,
        wholesaleCartItems,
        wholesaleCartCount,
        wholesaleCartSubtotal,
        isWholesaleCartPricingReady,
        removeFromWholesaleCart,
        updateWholesaleCartQuantity,
        checkoutWholesaleCart,
        isCheckingOutWholesale,
        getCartItemStockLimit,
        isWholesaleCustomer,
        userRole,
        showToast
    } = useGallery();
    const { derivedSettings, isLoading: isSettingsLoading } = useSiteSettings();
    const [customerInfo, setCustomerInfo] = useState(null);
    const [isCustomerLoading, setIsCustomerLoading] = useState(true);
    const [promoCodeInput, setPromoCodeInput] = useState('');
    const [appliedPromoCode, setAppliedPromoCode] = useState('');
    const [promoFeedback, setPromoFeedback] = useState(null);
    const [deliveryMethod, setDeliveryMethod] = useState('pickup');
    const [expandedDeliverySection, setExpandedDeliverySection] = useState(null);
    const [isShippingAddressFormOpen, setIsShippingAddressFormOpen] = useState(false);
    const [shippingAddressFields, setShippingAddressFields] = useState(createEmptyShippingAddressFields);
    const [savedShippingAddresses, setSavedShippingAddresses] = useState([]);
    const [selectedShippingAddressId, setSelectedShippingAddressId] = useState('');
    const [defaultShippingAddressId, setDefaultShippingAddressId] = useState('');
    const [makeShippingAddressDefault, setMakeShippingAddressDefault] = useState(false);
    const [districtOptions, setDistrictOptions] = useState([]);
    const [isLoadingDistrictOptions, setIsLoadingDistrictOptions] = useState(false);
    const [districtOptionsError, setDistrictOptionsError] = useState('');
    const [isDistrictSuggestionsOpen, setIsDistrictSuggestionsOpen] = useState(false);
    const [selectedShippingCourierId, setSelectedShippingCourierId] = useState('');
    const [liveShippingRate, setLiveShippingRate] = useState(null);
    const [isLoadingLiveShippingRate, setIsLoadingLiveShippingRate] = useState(false);
    const [liveShippingRateError, setLiveShippingRateError] = useState('');
    const [shippingAddressError, setShippingAddressError] = useState('');
    const [isPhonePromptOpen, setIsPhonePromptOpen] = useState(false);
    const [phonePromptValue, setPhonePromptValue] = useState('');
    const [phonePromptError, setPhonePromptError] = useState('');
    const [isSavingPhone, setIsSavingPhone] = useState(false);
    const [orderConfirmation, setOrderConfirmation] = useState(null);
    const [isCheckoutProcessing, setIsCheckoutProcessing] = useState(false);
    const [isCheckoutDraftHydrated, setIsCheckoutDraftHydrated] = useState(false);
    const [shouldScrollToShippingAddress, setShouldScrollToShippingAddress] = useState(false);
    const shippingAddressSectionRef = useRef(null);
    const shippingAddressFieldRefs = useRef({});
    const districtAutocompleteRef = useRef(null);

    const items = isWholesale ? wholesaleCartItems : cartItems;
    const itemCount = isWholesale ? wholesaleCartCount : cartCount;
    const subtotal = isWholesale ? wholesaleCartSubtotal : cartSubtotal;
    const isCartPricingReady = isWholesale ? isWholesaleCartPricingReady : isRetailCartPricingReady;
    const updateQuantity = isWholesale ? updateWholesaleCartQuantity : updateCartQuantity;
    const removeItem = isWholesale ? removeFromWholesaleCart : removeFromCart;
    const submitCheckout = isWholesale ? checkoutWholesaleCart : checkoutCart;
    const isSubmitting = isWholesale ? isCheckingOutWholesale : isCheckingOut;
    const normalizedDeliveryMethod = normalizeDeliveryMethod(deliveryMethod);
    const isShippingSelected = normalizedDeliveryMethod === 'shipping';
    const isPickupExpanded = expandedDeliverySection === 'pickup';
    const isShippingExpanded = expandedDeliverySection === 'shipping';
    const configuredShippingAmount = parseAmount(derivedSettings?.shippingPrice);
    const selectedShippingGovernorate = String(shippingAddressFields.governorate || '').trim();
    const selectedShippingDistrictId = String(shippingAddressFields.districtId || '').trim();
    const selectedShippingZoneId = String(shippingAddressFields.zoneId || '').trim();
    const fallbackShippingPricingDetails = useMemo(() => getShippingPricingDetails({
        governorate: selectedShippingGovernorate,
        shippingRates: derivedSettings?.shippingRates,
        fallbackAmount: configuredShippingAmount
    }), [configuredShippingAmount, derivedSettings?.shippingRates, selectedShippingGovernorate]);
    const governoratePricingZoneOption = useMemo(
        () => getGovernoratePricingZoneOption(districtOptions, selectedShippingZoneId),
        [districtOptions, selectedShippingZoneId]
    );
    const effectiveShippingZoneId = selectedShippingZoneId || governoratePricingZoneOption?.zoneId || '';
    const liveShippingQuotes = useMemo(
        () => (Array.isArray(liveShippingRate?.quotes)
            ? liveShippingRate.quotes.map((quote) => normalizeSideUpLivePricingQuote(quote)).filter(Boolean)
            : []),
        [liveShippingRate]
    );
    const recommendedShippingQuote = useMemo(() => {
        const recommendedCourierId = normalizeSideUpCourierId(liveShippingRate?.recommendedCourierId);
        return liveShippingQuotes.find((quote) => quote.courierId === recommendedCourierId) || liveShippingQuotes[0] || null;
    }, [liveShippingQuotes, liveShippingRate]);
    const selectedShippingQuote = useMemo(() => {
        const normalizedCourierId = normalizeSideUpCourierId(selectedShippingCourierId);
        return liveShippingQuotes.find((quote) => quote.courierId === normalizedCourierId) || recommendedShippingQuote || null;
    }, [liveShippingQuotes, recommendedShippingQuote, selectedShippingCourierId]);
    const isMylerzShippingSelected = isMylerzCourier(selectedShippingQuote?.courierName);
    const shippingPricingDetails = useMemo(() => {
        if (!isShippingSelected) {
            return {
                ...fallbackShippingPricingDetails,
                amount: 0,
                source: 'disabled',
                courierId: '',
                courierName: '',
                deliveryTime: '',
                recommendedCourierId: '',
                recommendedCourierName: '',
                quotes: [],
                vatAmount: 0,
                extraFeesAmount: 0,
                livePricingError: ''
            };
        }

        if (!effectiveShippingZoneId) {
            return {
                ...fallbackShippingPricingDetails,
                amount: 0,
                source: 'pending',
                courierId: '',
                courierName: '',
                deliveryTime: '',
                recommendedCourierId: '',
                recommendedCourierName: '',
                quotes: [],
                vatAmount: 0,
                extraFeesAmount: 0,
                livePricingError: ''
            };
        }

        if (isLoadingLiveShippingRate || (!liveShippingRate && !liveShippingRateError)) {
            return {
                ...fallbackShippingPricingDetails,
                amount: 0,
                source: 'loading',
                courierId: '',
                courierName: '',
                deliveryTime: '',
                recommendedCourierId: '',
                recommendedCourierName: '',
                quotes: [],
                vatAmount: 0,
                extraFeesAmount: 0,
                livePricingError: ''
            };
        }

        const activeLiveShippingQuote = selectedShippingQuote || recommendedShippingQuote;
        if (activeLiveShippingQuote) {
            const liveAmount = getSideUpQuoteAmount(activeLiveShippingQuote);
            const liveVatAmount = Number(activeLiveShippingQuote?.vatAmount);
            const liveExtraFeesAmount = getShippingExtraFeesAmount(activeLiveShippingQuote);
            return {
                ...fallbackShippingPricingDetails,
                amount: liveAmount,
                source: 'live',
                courierId: normalizeSideUpCourierId(activeLiveShippingQuote?.courierId),
                courierName: String(activeLiveShippingQuote?.courierName || '').trim(),
                deliveryTime: String(activeLiveShippingQuote?.deliveryTime || '').trim(),
                recommendedCourierId: normalizeSideUpCourierId(recommendedShippingQuote?.courierId),
                recommendedCourierName: String(recommendedShippingQuote?.courierName || '').trim(),
                quotes: liveShippingQuotes,
                vatAmount: Number.isFinite(liveVatAmount) && liveVatAmount > 0 ? liveVatAmount : 0,
                extraFeesAmount: liveExtraFeesAmount > 0 ? liveExtraFeesAmount : 0,
                livePricingError: ''
            };
        }

        return {
            ...fallbackShippingPricingDetails,
            source: 'fallback',
            courierId: '',
            courierName: '',
            deliveryTime: '',
            recommendedCourierId: '',
            recommendedCourierName: '',
            quotes: [],
            vatAmount: 0,
            extraFeesAmount: 0,
            livePricingError: liveShippingRateError
        };
    }, [effectiveShippingZoneId, fallbackShippingPricingDetails, isLoadingLiveShippingRate, isShippingSelected, liveShippingQuotes, liveShippingRateError, recommendedShippingQuote, selectedShippingQuote]);
    const shippingAmount = isShippingSelected ? shippingPricingDetails.amount : 0;
    const shippingAddress = useMemo(() => buildShippingAddressFromFields(shippingAddressFields), [shippingAddressFields]);
    const hasSavedShippingAddress = hasDetailedShippingAddress(shippingAddressFields);
    const productCount = items.length;
    const customerPhoneValue = getCustomerPhoneValue(customerInfo);
    const selectedSavedShippingAddress = useMemo(
        () => savedShippingAddresses.find((address) => address.id === selectedShippingAddressId) || null,
        [savedShippingAddresses, selectedShippingAddressId]
    );
    const selectedDistrictOptionId = useMemo(() => {
        const currentDistrictId = String(shippingAddressFields.districtId || '').trim();
        const currentDistrictName = String(shippingAddressFields.district || '').trim();
        return districtOptions.find((option) => (
            (currentDistrictId && String(option?.areaId || option?.districtId || '').trim() === currentDistrictId)
            || (currentDistrictName && String(option?.areaName || option?.districtName || '').trim() === currentDistrictName)
        ))?.optionId || '';
    }, [districtOptions, shippingAddressFields.district, shippingAddressFields.districtId]);
    const filteredDistrictOptions = useMemo(() => {
        const normalizedQuery = normalizeDistrictLookupValue(shippingAddressFields.district);
        if (!normalizedQuery) {
            return districtOptions.slice(0, 12);
        }

        return districtOptions
            .filter((option) => {
                const searchableValues = [
                    option?.label,
                    option?.areaName,
                    option?.districtName,
                    option?.zoneName
                ].map(normalizeDistrictLookupValue).filter(Boolean);

                return searchableValues.some((value) => value.includes(normalizedQuery));
            })
            .slice(0, 12);
    }, [districtOptions, shippingAddressFields.district]);
    const activePromoCodes = useMemo(() => derivedSettings?.activePromoCodes || [], [derivedSettings?.activePromoCodes]);
    const appliedPromoSettings = useMemo(() => findPromoCodeByInput(activePromoCodes, appliedPromoCode), [activePromoCodes, appliedPromoCode]);
    const appliedPromoApplicationDetails = useMemo(() => getPromoCodeApplicationDetails({
        subtotal,
        shippingAmount,
        promoCodeEntry: appliedPromoSettings,
        governorate: selectedShippingGovernorate,
        isShippingSelected
    }), [appliedPromoSettings, isShippingSelected, selectedShippingGovernorate, shippingAmount, subtotal]);
    const isPromoApplied = Boolean(appliedPromoSettings);
    const discountAmount = appliedPromoApplicationDetails.amount;
    const finalTotal = Math.max(0, subtotal - discountAmount + shippingAmount);
    const totalDisplayValue = !isShippingSelected
        ? formatCurrency(finalTotal)
        : !selectedShippingGovernorate
            ? 'اختر المحافظة'
            : (isLoadingDistrictOptions || shippingPricingDetails.source === 'loading')
                ? 'جاري حساب الشحن'
                : shippingPricingDetails.source === 'pending'
                    ? 'اختر المنطقة'
                    : formatCurrency(finalTotal);
    const shippingDisplayValue = isShippingSelected
        ? (!selectedShippingGovernorate
            ? 'اختر المحافظة'
            : (isLoadingDistrictOptions || shippingPricingDetails.source === 'loading')
                ? 'جاري حساب الشحن'
                : shippingPricingDetails.source === 'pending'
                    ? 'اختر المنطقة'
                    : formatCurrency(shippingAmount))
        : formatCurrency(0);
    const loginTarget = `/login?redirect=checkout${isWholesale ? '&type=wholesale' : ''}`;
    const signupTarget = `/signup?redirect=checkout${isWholesale ? '&type=wholesale' : ''}`;
    const isCheckoutBusy = isCheckoutProcessing || isSubmitting;
    const isCheckoutSubmitting = isCheckoutBusy && !orderConfirmation;
    const shouldNudgePromoApplyButton = Boolean(normalizePromoCodeLookupValue(promoCodeInput)) && activePromoCodes.length > 0 && !isPromoApplied;
    const selectedDeliveryCardClasses = 'border-brandGold/30 bg-[linear-gradient(135deg,rgba(212,175,55,0.14),rgba(255,255,255,0.96))] text-brandBlue shadow-[0_18px_45px_rgba(212,175,55,0.12)] dark:border-brandGold/24 dark:bg-[linear-gradient(135deg,rgba(212,175,55,0.14),rgba(15,23,42,0.9))] dark:text-white';
    const selectedDeliveryEyebrowClasses = 'text-brandBlue/60 dark:text-brandGold/75';
    const selectedDeliveryMutedTextClasses = 'text-brandBlue/78 dark:text-slate-200';
    const selectedDeliveryCheckClasses = 'border-brandGold/35 bg-brandGold/10 text-brandBlue dark:border-brandGold/28 dark:bg-brandGold/16 dark:text-brandGold';
    const selectedDeliveryToggleClasses = 'border-brandGold/22 bg-brandGold/8 text-brandBlue dark:border-brandGold/18 dark:bg-brandGold/14 dark:text-brandGold';
    const selectedDeliveryDividerClasses = 'border-brandGold/16 dark:border-brandGold/10';
    const selectedDeliveryActionClasses = 'border-brandGold/22 bg-brandGold/8 text-brandBlue hover:bg-brandGold/12 dark:border-brandGold/18 dark:bg-brandGold/14 dark:text-brandGold';

    const persistCheckoutDraftNow = useCallback(() => {
        writeCheckoutDraft(normalizedCheckoutType, {
            deliveryMethod,
            expandedDeliverySection,
            isShippingAddressFormOpen,
            selectedShippingAddressId,
            selectedShippingCourierId,
            makeShippingAddressDefault,
            shippingAddressFields
        });
    }, [
        deliveryMethod,
        expandedDeliverySection,
        isShippingAddressFormOpen,
        makeShippingAddressDefault,
        normalizedCheckoutType,
        selectedShippingAddressId,
        selectedShippingCourierId,
        shippingAddressFields
    ]);

    useEffect(() => {
        let isMounted = true;
        setIsCheckoutDraftHydrated(false);

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!isMounted) {
                return;
            }

            const checkoutDraft = readCheckoutDraft(normalizedCheckoutType);
            const draftFields = checkoutDraft?.shippingAddressFields || createEmptyShippingAddressFields();
            const hasDraftShippingAddress = hasAnyShippingAddressFieldValue(draftFields);
            const restoredDeliveryMethod = checkoutDraft?.deliveryMethod || 'pickup';
            const restoredExpandedDeliverySection = normalizeExpandedDeliverySection(checkoutDraft?.expandedDeliverySection)
                || ((restoredDeliveryMethod === 'shipping' || hasDraftShippingAddress) ? 'shipping' : null);
            const restoredIsShippingAddressFormOpen = Boolean(checkoutDraft?.isShippingAddressFormOpen || hasDraftShippingAddress);
            const restoredSelectedShippingCourierId = normalizeSideUpCourierId(checkoutDraft?.selectedShippingCourierId);

            setSelectedShippingCourierId(restoredSelectedShippingCourierId);

            if (!currentUser) {
                setCustomerInfo(null);
                setSavedShippingAddresses([]);
                setSelectedShippingAddressId('');
                setDefaultShippingAddressId('');
                setMakeShippingAddressDefault(checkoutDraft ? checkoutDraft.makeShippingAddressDefault : false);
                setDistrictOptions([]);
                setDistrictOptionsError('');
                setDeliveryMethod(restoredDeliveryMethod);
                setExpandedDeliverySection(restoredExpandedDeliverySection);
                setIsShippingAddressFormOpen(restoredIsShippingAddressFormOpen);
                setShippingAddressFields(hasDraftShippingAddress ? draftFields : createEmptyShippingAddressFields());
                setIsCustomerLoading(false);
                setIsCheckoutDraftHydrated(true);
                return;
            }

            setIsCustomerLoading(true);

            try {
                const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                const profileData = userDoc.exists() ? userDoc.data() : {};
                const nextSavedShippingAddresses = normalizeSavedShippingAddresses(profileData.shippingAddresses);
                const preferredDefaultShippingAddressId = String(profileData.defaultShippingAddressId || '').trim();
                const defaultShippingAddress = nextSavedShippingAddresses.find((address) => address.id === preferredDefaultShippingAddressId)
                    || nextSavedShippingAddresses[0]
                    || null;
                const draftSelectedShippingAddressId = String(checkoutDraft?.selectedShippingAddressId || '').trim();
                const draftSelectedShippingAddress = nextSavedShippingAddresses.find((address) => address.id === draftSelectedShippingAddressId) || null;
                const restoredSelectedShippingAddress = draftSelectedShippingAddress || defaultShippingAddress || null;

                if (!isMounted) {
                    return;
                }

                setCustomerInfo(buildCustomerSnapshot(currentUser, profileData, userRole));
                setSavedShippingAddresses(nextSavedShippingAddresses);
                setDefaultShippingAddressId(defaultShippingAddress?.id || '');
                setSelectedShippingAddressId(draftSelectedShippingAddress?.id || (hasDraftShippingAddress ? '' : defaultShippingAddress?.id || ''));
                setMakeShippingAddressDefault(checkoutDraft ? checkoutDraft.makeShippingAddressDefault : Boolean(defaultShippingAddress?.id));
                setDeliveryMethod(restoredDeliveryMethod);
                setExpandedDeliverySection(restoredExpandedDeliverySection);
                setIsShippingAddressFormOpen(restoredIsShippingAddressFormOpen);
                setShippingAddressFields(hasDraftShippingAddress
                    ? draftFields
                    : restoredSelectedShippingAddress
                        ? createShippingAddressFieldsFromSavedAddress(restoredSelectedShippingAddress)
                        : createEmptyShippingAddressFields());
            } catch (error) {
                console.error('Failed to load checkout customer profile:', error);
                if (isMounted) {
                    setCustomerInfo(buildCustomerSnapshot(currentUser, {}, userRole));
                    setSavedShippingAddresses([]);
                    setSelectedShippingAddressId('');
                    setDefaultShippingAddressId('');
                    setMakeShippingAddressDefault(checkoutDraft ? checkoutDraft.makeShippingAddressDefault : false);
                    setDeliveryMethod(restoredDeliveryMethod);
                    setExpandedDeliverySection(restoredExpandedDeliverySection);
                    setIsShippingAddressFormOpen(restoredIsShippingAddressFormOpen);
                    setShippingAddressFields(hasDraftShippingAddress ? draftFields : createEmptyShippingAddressFields());
                }
            } finally {
                if (isMounted) {
                    setIsCustomerLoading(false);
                    setIsCheckoutDraftHydrated(true);
                }
            }
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [normalizedCheckoutType, userRole]);

    useEffect(() => {
        if (!isCheckoutDraftHydrated) {
            return;
        }

        persistCheckoutDraftNow();
    }, [isCheckoutDraftHydrated, persistCheckoutDraftNow]);

    useEffect(() => {
        if (appliedPromoCode && !findPromoCodeByInput(activePromoCodes, appliedPromoCode)) {
            setAppliedPromoCode('');
            setPromoFeedback(null);
        }
    }, [activePromoCodes, appliedPromoCode]);

    useEffect(() => {
        if (!appliedPromoCode || !appliedPromoSettings || appliedPromoSettings.discountType !== 'free_shipping') {
            return;
        }

        if (appliedPromoApplicationDetails.isApplicable) {
            return;
        }

        setAppliedPromoCode('');
        setPromoFeedback({
            type: 'error',
            message: getPromoApplicationErrorMessage(appliedPromoApplicationDetails.reason)
        });
    }, [appliedPromoApplicationDetails.isApplicable, appliedPromoApplicationDetails.reason, appliedPromoCode, appliedPromoSettings]);

    useEffect(() => {
        if (!shouldScrollToShippingAddress || !isShippingSelected || !isShippingExpanded || !isShippingAddressFormOpen) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            shippingAddressSectionRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            const { missingFieldKey } = getShippingAddressValidation(shippingAddressFields);

            const targetField = missingFieldKey ? shippingAddressFieldRefs.current[missingFieldKey] : null;
            if (targetField?.focus) {
                targetField.focus({ preventScroll: true });
            }

            setShouldScrollToShippingAddress(false);
        }, 120);

        return () => window.clearTimeout(timeoutId);
    }, [
        isShippingAddressFormOpen,
        isShippingExpanded,
        isShippingSelected,
        shippingAddressFields.governorate,
        shippingAddressFields.district,
        shippingAddressFields.houseNumber,
        shippingAddressFields.streetName,
        shouldScrollToShippingAddress
    ]);

    useEffect(() => {
        const selectedGovernorate = String(shippingAddressFields.governorate || '').trim();

        if (!selectedGovernorate) {
            setDistrictOptions([]);
            setDistrictOptionsError('');
            setIsLoadingDistrictOptions(false);
            setIsDistrictSuggestionsOpen(false);
            return undefined;
        }

        const abortController = new AbortController();
        let isCancelled = false;

        const loadDistrictOptions = async () => {
            setIsLoadingDistrictOptions(true);
            setDistrictOptionsError('');

            try {
                const response = await fetch(`/api/integrations/sideup/locations?governorate=${encodeURIComponent(selectedGovernorate)}`, {
                    cache: 'no-store',
                    signal: abortController.signal
                });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok || payload?.ok === false) {
                    throw new Error(payload?.error || 'تعذر تحميل الأحياء / المناطق من SideUp حالياً.');
                }

                if (isCancelled) {
                    return;
                }

                const nextDistrictOptions = Array.isArray(payload?.areas) ? payload.areas : [];
                const cityId = String(payload?.city?.id || '').trim();
                const cityName = String(payload?.city?.name || '').trim();

                setDistrictOptions(nextDistrictOptions);
                setShippingAddressFields((current) => {
                    if (String(current.governorate || '').trim() !== selectedGovernorate) {
                        return current;
                    }

                    const currentDistrictId = String(current.districtId || '').trim();
                    const currentDistrictName = String(current.district || '').trim();
                    const matchedDistrict = nextDistrictOptions.find((option) => (
                        (currentDistrictId && String(option?.areaId || option?.districtId || '').trim() === currentDistrictId)
                        || (currentDistrictName && String(option?.areaName || option?.districtName || '').trim() === currentDistrictName)
                    ));

                    return {
                        ...current,
                        cityId: matchedDistrict ? String(matchedDistrict.cityId || cityId || '').trim() : cityId,
                        cityName: matchedDistrict ? String(matchedDistrict.cityName || cityName || '').trim() : cityName,
                        district: matchedDistrict ? String(matchedDistrict.areaName || matchedDistrict.label || '').trim() : '',
                        districtId: matchedDistrict ? String(matchedDistrict.areaId || '').trim() : '',
                        zoneId: matchedDistrict ? String(matchedDistrict.zoneId || '').trim() : '',
                        zoneName: matchedDistrict ? String(matchedDistrict.zoneName || '').trim() : ''
                    };
                });
            } catch (error) {
                if (abortController.signal.aborted || isCancelled) {
                    return;
                }

                setDistrictOptions([]);
                setDistrictOptionsError(error instanceof Error ? error.message : 'تعذر تحميل الأحياء / المناطق حالياً.');
            } finally {
                if (!isCancelled) {
                    setIsLoadingDistrictOptions(false);
                }
            }
        };

        loadDistrictOptions();

        return () => {
            isCancelled = true;
            abortController.abort();
        };
    }, [shippingAddressFields.governorate]);

    useEffect(() => {
        if (!isShippingSelected || !effectiveShippingZoneId) {
            if (!effectiveShippingZoneId) {
                setSelectedShippingCourierId('');
            }
            setLiveShippingRate(null);
            setLiveShippingRateError('');
            setIsLoadingLiveShippingRate(false);
            return undefined;
        }

        const abortController = new AbortController();
        let isCancelled = false;

        const loadLiveShippingRate = async () => {
            setIsLoadingLiveShippingRate(true);
            setLiveShippingRateError('');

            try {
                const searchParams = new URLSearchParams({
                    zoneId: String(effectiveShippingZoneId),
                    paymentMethod: 'PREPAID',
                    codAmount: '0'
                });

                if (selectedShippingDistrictId) {
                    searchParams.set('areaId', selectedShippingDistrictId);
                }

                const response = await fetch(`/api/integrations/sideup/pricing?${searchParams.toString()}`, {
                    cache: 'no-store',
                    signal: abortController.signal
                });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok || payload?.ok === false) {
                    throw new Error(getSideUpLivePricingFallbackMessage(payload));
                }

                if (isCancelled) {
                    return;
                }

                const normalizedQuotes = Array.isArray(payload?.quotes)
                    ? payload.quotes.map((quote) => normalizeSideUpLivePricingQuote(quote)).filter(Boolean)
                    : [];
                const normalizedCheapestQuote = normalizeSideUpLivePricingQuote(payload?.cheapestQuote || normalizedQuotes[0] || {});

                setLiveShippingRate({
                    amount: getSideUpQuoteAmount(normalizedCheapestQuote),
                    courierName: String(normalizedCheapestQuote?.courierName || payload?.courierName || '').trim(),
                    recommendedCourierId: normalizeSideUpCourierId(normalizedCheapestQuote?.courierId),
                    vatAmount: Number(normalizedCheapestQuote?.vatAmount) || 0,
                    codFees: Number(normalizedCheapestQuote?.codFees) || 0,
                    paymentFees: Number(normalizedCheapestQuote?.paymentFees) || 0,
                    quotes: normalizedQuotes
                });
            } catch (error) {
                if (abortController.signal.aborted || isCancelled) {
                    return;
                }

                setSelectedShippingCourierId('');
                setLiveShippingRate(null);
                setLiveShippingRateError(error instanceof Error ? error.message : getSideUpLivePricingFallbackMessage());
            } finally {
                if (!isCancelled) {
                    setIsLoadingLiveShippingRate(false);
                }
            }
        };

        loadLiveShippingRate();

        return () => {
            isCancelled = true;
            abortController.abort();
        };
    }, [effectiveShippingZoneId, isShippingSelected, selectedShippingDistrictId]);

    useEffect(() => {
        if (!isShippingSelected || liveShippingQuotes.length === 0) {
            return;
        }

        const normalizedSelectedCourierId = normalizeSideUpCourierId(selectedShippingCourierId);
        if (normalizedSelectedCourierId && liveShippingQuotes.some((quote) => quote.courierId === normalizedSelectedCourierId)) {
            return;
        }

        const nextRecommendedCourierId = normalizeSideUpCourierId(recommendedShippingQuote?.courierId || liveShippingQuotes[0]?.courierId);
        if (nextRecommendedCourierId && nextRecommendedCourierId !== normalizedSelectedCourierId) {
            setSelectedShippingCourierId(nextRecommendedCourierId);
        }
    }, [isShippingSelected, liveShippingQuotes, recommendedShippingQuote, selectedShippingCourierId]);

    useEffect(() => {
        const handlePointerDownOutsideDistrictAutocomplete = (event) => {
            if (!districtAutocompleteRef.current?.contains(event.target)) {
                setIsDistrictSuggestionsOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDownOutsideDistrictAutocomplete);
        return () => document.removeEventListener('mousedown', handlePointerDownOutsideDistrictAutocomplete);
    }, []);

    const handleApplyPromoCode = () => {
        if (!activePromoCodes.length) {
            setAppliedPromoCode('');
            setPromoFeedback({ type: 'error', message: 'لا يوجد Promo Code مفعّل حالياً.' });
            return;
        }

        const normalizedInput = normalizePromoCodeLookupValue(promoCodeInput);

        if (!normalizedInput) {
            setAppliedPromoCode('');
            setPromoFeedback({ type: 'error', message: 'اكتب الـ Promo Code أولاً.' });
            return;
        }

        const matchedPromoCode = findPromoCodeByInput(activePromoCodes, normalizedInput);

        if (!matchedPromoCode) {
            setAppliedPromoCode('');
            setPromoFeedback({ type: 'error', message: 'الـ Promo Code غير صحيح أو غير مفعّل.' });
            return;
        }

        const promoApplicationDetails = getPromoCodeApplicationDetails({
            subtotal,
            shippingAmount,
            promoCodeEntry: matchedPromoCode,
            governorate: selectedShippingGovernorate,
            isShippingSelected
        });

        if (!promoApplicationDetails.isApplicable) {
            setAppliedPromoCode('');
            setPromoFeedback({ type: 'error', message: getPromoApplicationErrorMessage(promoApplicationDetails.reason) });
            return;
        }

        setAppliedPromoCode(matchedPromoCode.code);
        setPromoCodeInput(matchedPromoCode.code);
        setPromoFeedback({
            type: 'success',
            message: matchedPromoCode.discountType === 'free_shipping'
                ? 'تم تطبيق كود الشحن المجاني على المحافظة المختارة.'
                : `تم تطبيق خصم ${formatPromoDiscountLabel(matchedPromoCode)} على الطلب.`
        });
    };

    const handleClearPromoCode = () => {
        setAppliedPromoCode('');
        setPromoCodeInput('');
        setPromoFeedback(null);
    };

    const handleSelectDeliveryMethod = (nextDeliveryMethod) => {
        const normalizedMethod = normalizeDeliveryMethod(nextDeliveryMethod);

        setDeliveryMethod(normalizedMethod);
        setShippingAddressError('');
        setExpandedDeliverySection((current) => (current === normalizedMethod ? current : null));
    };

    const toggleDeliverySection = (sectionName) => {
        const normalizedSection = normalizeDeliveryMethod(sectionName);
        setExpandedDeliverySection((current) => (current === normalizedSection ? null : normalizedSection));
    };

    const handleShippingAddressFieldChange = (fieldKey, value) => {
        setShippingAddressFields((current) => ({
            ...current,
            [fieldKey]: value,
            ...(fieldKey === 'governorate'
                ? {
                    district: '',
                    districtId: '',
                    cityId: '',
                    cityName: '',
                    zoneId: '',
                    zoneName: ''
                }
                : {})
        }));

        if (fieldKey === 'governorate') {
            setSelectedShippingCourierId('');
            setDistrictOptions([]);
            setDistrictOptionsError('');
            setIsDistrictSuggestionsOpen(false);
        }

        if (shippingAddressError) {
            setShippingAddressError('');
        }
    };

    const handleDistrictInputChange = (value) => {
        setSelectedShippingCourierId('');
        setShippingAddressFields((current) => ({
            ...current,
            district: value,
            districtId: '',
            zoneId: '',
            zoneName: ''
        }));
        setIsDistrictSuggestionsOpen(true);

        if (shippingAddressError) {
            setShippingAddressError('');
        }
    };

    const handleDistrictSelection = (selectedOptionId) => {
        const nextDistrict = districtOptions.find((option) => String(option?.optionId || '').trim() === String(selectedOptionId || '').trim());

        if (!nextDistrict) {
            return;
        }

        setSelectedShippingCourierId('');
        setShippingAddressFields((current) => ({
            ...current,
            district: String(nextDistrict?.areaName || nextDistrict?.districtName || '').trim(),
            districtId: String(nextDistrict?.areaId || nextDistrict?.districtId || '').trim(),
            cityId: String(nextDistrict?.cityId || current.cityId || '').trim(),
            cityName: String(nextDistrict?.cityName || current.cityName || '').trim(),
            zoneId: String(nextDistrict?.zoneId || '').trim(),
            zoneName: String(nextDistrict?.zoneName || '').trim()
        }));
        setIsDistrictSuggestionsOpen(false);

        if (shippingAddressError) {
            setShippingAddressError('');
        }
    };

    const handleDistrictInputKeyDown = (event) => {
        if (event.key === 'Enter' && filteredDistrictOptions.length > 0) {
            event.preventDefault();
            handleDistrictSelection(filteredDistrictOptions[0].optionId);
            return;
        }

        if (event.key === 'Escape') {
            setIsDistrictSuggestionsOpen(false);
        }
    };

    const handleSelectSavedShippingAddress = (addressId) => {
        const nextAddress = savedShippingAddresses.find((address) => address.id === addressId);
        if (!nextAddress) {
            return;
        }

        setSelectedShippingAddressId(nextAddress.id);
        setSelectedShippingCourierId('');
        setMakeShippingAddressDefault(nextAddress.id === defaultShippingAddressId);
        setShippingAddressFields(createShippingAddressFieldsFromSavedAddress(nextAddress));
        setIsShippingAddressFormOpen(false);
        setExpandedDeliverySection('shipping');
        setShippingAddressError('');
    };

    const handleAddNewShippingAddress = () => {
        setSelectedShippingAddressId('');
        setSelectedShippingCourierId('');
        setMakeShippingAddressDefault(savedShippingAddresses.length === 0 || !defaultShippingAddressId);
        setShippingAddressFields(createEmptyShippingAddressFields());
        setDistrictOptions([]);
        setDistrictOptionsError('');
        setIsShippingAddressFormOpen(true);
        setExpandedDeliverySection('shipping');
        setShippingAddressError('');
        setShouldScrollToShippingAddress(true);
    };

    const handleSelectShippingCourier = (courierId) => {
        const normalizedCourierId = normalizeSideUpCourierId(courierId);
        if (!normalizedCourierId) {
            return;
        }

        setSelectedShippingCourierId(normalizedCourierId);
    };

    const persistShippingAddressSelection = async (currentUser) => {
        if (!currentUser || !isShippingSelected) {
            return {
                addressId: String(selectedShippingAddressId || '').trim()
            };
        }

        const response = await saveCurrentUserShippingAddress(currentUser, {
            id: selectedShippingAddressId,
            ...buildSavedShippingAddressPayload(shippingAddressFields)
        }, {
            makeDefault: makeShippingAddressDefault,
            defaultAddressId: defaultShippingAddressId
        });

        const nextSavedShippingAddresses = normalizeSavedShippingAddresses(response?.profile?.shippingAddresses);
        const nextDefaultShippingAddressId = String(response?.defaultShippingAddressId || response?.profile?.defaultShippingAddressId || '').trim();
        const persistedAddress = nextSavedShippingAddresses.find((address) => address.id === String(response?.addressId || '').trim()) || null;

        setSavedShippingAddresses(nextSavedShippingAddresses);
        setDefaultShippingAddressId(nextDefaultShippingAddressId);

        if (persistedAddress) {
            setSelectedShippingAddressId(persistedAddress.id);
            setMakeShippingAddressDefault(persistedAddress.id === nextDefaultShippingAddressId);
            setShippingAddressFields(createShippingAddressFieldsFromSavedAddress(persistedAddress));
        }

        return {
            addressId: persistedAddress?.id || String(response?.addressId || '').trim()
        };
    };

    const closePhonePrompt = () => {
        if (isSavingPhone || isSubmitting) {
            return;
        }

        setIsPhonePromptOpen(false);
        setPhonePromptValue('');
        setPhonePromptError('');
    };

    const handleTrackOrder = () => {
        const trackedOrderNumber = String(orderConfirmation?.orderNumber || '').trim();
        setOrderConfirmation(null);
        router.replace(trackedOrderNumber
            ? `/profile?trackOrder=${encodeURIComponent(trackedOrderNumber)}#order-history`
            : '/profile#order-history');
    };

    const handleCloseOrderConfirmation = () => {
        setOrderConfirmation(null);
        router.replace('/');
    };

    const finalizeOrderConfirmation = async ({ shippingAddressIdOverride = '', shippingRecipientNameOverride = '', shippingRecipientPhoneOverride = '' } = {}) => {
        const effectiveShippingRecipientName = shippingRecipientNameOverride || getEffectiveShippingRecipientName(shippingAddressFields, customerInfo);
        const effectiveShippingRecipientPhone = shippingRecipientPhoneOverride || getEffectiveShippingRecipientPhone(shippingAddressFields, customerInfo);
        const result = await submitCheckout({
            subtotalAmount: subtotal,
            shippingAmount,
            discountAmount,
            totalPrice: finalTotal,
            promoCode: isPromoApplied ? appliedPromoSettings.code : '',
            promoDiscountType: isPromoApplied ? appliedPromoSettings.discountType : '',
            promoDiscountValue: isPromoApplied ? appliedPromoSettings.numericDiscountValue : 0,
            deliveryMethod: normalizedDeliveryMethod,
            shippingAddress: isShippingSelected ? shippingAddress.trim() : '',
            shippingGovernorate: isShippingSelected ? selectedShippingGovernorate : '',
            shippingZone: isShippingSelected ? String(shippingAddressFields.zoneName || '').trim() : '',
            shippingDistrict: isShippingSelected ? String(shippingAddressFields.district || '').trim() : '',
            shippingDistrictId: isShippingSelected ? String(shippingAddressFields.districtId || '').trim() : '',
            shippingCityId: isShippingSelected ? String(shippingAddressFields.cityId || '').trim() : '',
            shippingCityName: isShippingSelected ? String(shippingAddressFields.cityName || '').trim() : '',
            shippingZoneId: isShippingSelected ? String(shippingAddressFields.zoneId || '').trim() : '',
            shippingRecipientName: isShippingSelected ? effectiveShippingRecipientName : '',
            shippingRecipientPhone: isShippingSelected ? effectiveShippingRecipientPhone : '',
            shippingAddressId: isShippingSelected ? String(shippingAddressIdOverride || selectedShippingAddressId || '').trim() : '',
            shippingCourierId: isShippingSelected ? normalizeSideUpCourierId(selectedShippingQuote?.courierId) : '',
            shippingCourierName: isShippingSelected ? String(selectedShippingQuote?.courierName || '').trim() : '',
            shippingCourierDeliveryTime: isShippingSelected ? String(selectedShippingQuote?.deliveryTime || '').trim() : '',
            skipSuccessToast: true
        });

        if (result.requiresAuth) {
            persistCheckoutDraftNow();
            router.push(loginTarget);
            return;
        }

        if (result.ok) {
            clearCheckoutDraft(normalizedCheckoutType);
            setOrderConfirmation({
                orderNumber: String(result.websiteOrderRef || result.orderId || '').trim() || 'WEB-ORDER',
                totalPrice: parseAmount(result.totalPrice ?? finalTotal),
                deliveryMethod: normalizeDeliveryMethod(result.deliveryMethod || normalizedDeliveryMethod),
                itemCount: Number(result.itemCount) || itemCount
            });
        }
    };

    const handlePhonePromptSubmit = async (event) => {
        event.preventDefault();

        const currentUser = auth.currentUser;
        if (!currentUser) {
            closePhonePrompt();
            showToast('سجل الدخول أولاً لتأكيد الطلب.', 'error');
            persistCheckoutDraftNow();
            router.push(loginTarget);
            return;
        }

        const trimmedPhone = String(phonePromptValue || '').trim();
        if (!trimmedPhone) {
            setPhonePromptError('اكتب رقم الموبايل قبل إكمال الطلب.');
            return;
        }

        setIsSavingPhone(true);
        setIsCheckoutProcessing(true);
        setPhonePromptError('');

        try {
            const response = await upsertCurrentUserProfile(currentUser, { phone: trimmedPhone });
            const savedProfile = response?.profile || { phone: trimmedPhone };
            const nextCustomerInfo = buildCustomerSnapshot(currentUser, savedProfile, userRole);
            const effectiveShippingRecipientName = getEffectiveShippingRecipientName(shippingAddressFields, nextCustomerInfo);
            const effectiveShippingRecipientPhone = String(shippingAddressFields.recipientPhone || '').trim() || trimmedPhone;
            let persistedShippingAddressId = String(selectedShippingAddressId || '').trim();

            setCustomerInfo(nextCustomerInfo);
            setIsPhonePromptOpen(false);
            setPhonePromptValue('');

            if (isShippingSelected) {
                const persistResult = await persistShippingAddressSelection(currentUser);
                persistedShippingAddressId = persistResult.addressId || persistedShippingAddressId;
            }

            await finalizeOrderConfirmation({
                shippingAddressIdOverride: persistedShippingAddressId,
                shippingRecipientNameOverride: effectiveShippingRecipientName,
                shippingRecipientPhoneOverride: effectiveShippingRecipientPhone
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'تعذر حفظ رقم الموبايل حالياً. حاول مرة أخرى.';
            setPhonePromptError(errorMessage);
        } finally {
            setIsSavingPhone(false);
            setIsCheckoutProcessing(false);
        }
    };

    const handleConfirmOrder = async () => {
        if (!auth.currentUser) {
            showToast('سجل الدخول أولاً لتأكيد الطلب.', 'error');
            persistCheckoutDraftNow();
            router.push(loginTarget);
            return;
        }

        if (isCustomerLoading) {
            showToast('جارٍ تحميل بيانات الحساب، حاول مرة أخرى خلال لحظة.', 'error');
            return;
        }

        if (isShippingSelected) {
            const { errorMessage } = getShippingAddressValidation(shippingAddressFields);
            if (errorMessage) {
                setExpandedDeliverySection('shipping');
                setIsShippingAddressFormOpen(true);
                setShippingAddressError(errorMessage);
                setShouldScrollToShippingAddress(true);
                showToast(errorMessage, 'error');
                return;
            }
        }

        setShippingAddressError('');

        const effectiveShippingRecipientPhone = getEffectiveShippingRecipientPhone(shippingAddressFields, customerInfo);

        if (!effectiveShippingRecipientPhone) {
            setPhonePromptError('');
            setPhonePromptValue('');
            setIsPhonePromptOpen(true);
            return;
        }

        let persistedShippingAddressId = String(selectedShippingAddressId || '').trim();

        setIsCheckoutProcessing(true);

        try {
            if (isShippingSelected) {
                try {
                    const persistResult = await persistShippingAddressSelection(auth.currentUser);
                    persistedShippingAddressId = persistResult.addressId || persistedShippingAddressId;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'تعذر حفظ عنوان الشحن حالياً. حاول مرة أخرى.';
                    setExpandedDeliverySection('shipping');
                    setIsShippingAddressFormOpen(true);
                    setShippingAddressError(errorMessage);
                    showToast(errorMessage, 'error');
                    return;
                }
            }

            await finalizeOrderConfirmation({
                shippingAddressIdOverride: persistedShippingAddressId,
                shippingRecipientNameOverride: getEffectiveShippingRecipientName(shippingAddressFields, customerInfo),
                shippingRecipientPhoneOverride: effectiveShippingRecipientPhone
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'تعذر تأكيد الطلب حالياً. حاول مرة أخرى.';
            showToast(errorMessage, 'error');
        } finally {
            setIsCheckoutProcessing(false);
        }
    };

    const deliveryMethodSection = (
        <div className="rounded-[1.5rem] border border-brandGold/15 bg-brandGold/[0.04] px-4 py-4 dark:bg-brandGold/[0.06]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="text-right sm:flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brandGold">Delivery Method</p>
                    <h3 className="mt-2 text-lg font-black leading-[1.45] text-brandBlue dark:text-white sm:text-base sm:leading-[1.35]">طريقة الاستلام أو التوصيل</h3>
                    <p className="mt-2 text-sm font-bold leading-7 text-slate-500 dark:text-slate-300 sm:max-w-[26rem]">
                        اختَر إذا كنت ستستلم الطلب من المعرض أو تريد شحنه إلى عنوانك.
                    </p>
                </div>
                <span className="inline-flex w-fit self-start rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-brandBlue shadow-sm dark:bg-white/10 dark:text-brandGold sm:self-auto">
                    {isShippingSelected ? 'Shipping' : 'Pickup'}
                </span>
            </div>

            <div className="mt-4 space-y-3">
                <div className={`overflow-hidden rounded-[1.35rem] border transition-colors ${!isShippingSelected ? selectedDeliveryCardClasses : 'border-brandGold/18 bg-white text-brandBlue dark:bg-gray-900/60 dark:text-white'}`}>
                    <div className="flex items-center gap-3 px-4 py-4">
                        <button
                            type="button"
                            onClick={() => handleSelectDeliveryMethod('pickup')}
                            className="flex-1 text-right"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="text-right">
                                    <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${!isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>Pickup</p>
                                    <p className="mt-2 text-base font-black">استلام الطلب من المعرض</p>
                                </div>
                                <span className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${!isShippingSelected ? selectedDeliveryCheckClasses : 'border-brandGold/35 bg-transparent text-brandGold/0 dark:border-brandGold/20 dark:text-brandGold/0'}`}>
                                    <i className={`fa-solid fa-check text-[10px] ${!isShippingSelected ? 'opacity-100' : 'opacity-0'}`}></i>
                                </span>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleDeliverySection('pickup')}
                            aria-label={isPickupExpanded ? 'إغلاق تفاصيل الاستلام' : 'فتح تفاصيل الاستلام'}
                            aria-expanded={isPickupExpanded}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${!isShippingSelected ? selectedDeliveryToggleClasses : 'border-brandGold/20 bg-brandGold/5 text-brandGold dark:border-brandGold/15 dark:bg-brandGold/10'}`}
                        >
                            <i className={`fa-solid ${isPickupExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm`}></i>
                        </button>
                    </div>

                    {isPickupExpanded ? (
                        <div className={`border-t px-4 pb-4 pt-4 ${!isShippingSelected ? selectedDeliveryDividerClasses : 'border-brandGold/15 dark:border-brandGold/10'}`}>
                            <p className={`text-sm font-bold leading-7 ${!isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>
                                بدون رسوم شحن، وتأكيد الطلب يتم بنفس بياناتك الحالية.
                            </p>
                        </div>
                    ) : null}
                </div>

                <div className={`overflow-hidden rounded-[1.35rem] border transition-colors ${isShippingSelected ? selectedDeliveryCardClasses : 'border-brandGold/18 bg-white text-brandBlue dark:bg-gray-900/60 dark:text-white'}`}>
                    <div className="flex items-center gap-3 px-4 py-4">
                        <button
                            type="button"
                            onClick={() => handleSelectDeliveryMethod('shipping')}
                            className="flex-1 text-right"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="text-right">
                                    <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>Shipping</p>
                                    <p className="mt-2 text-base font-black">شحن الطلب إلى عنواني</p>
                                    <p className={`mt-2 text-sm font-bold leading-7 ${isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>
                                        {selectedShippingGovernorate
                                            ? (isLoadingDistrictOptions || shippingPricingDetails.source === 'loading'
                                                ? 'جاري حساب سعر الشحن من SideUp...'
                                                : shippingPricingDetails.source === 'pending'
                                                    ? 'اختر المنطقة لاستكمال سعر الشحن.'
                                                    : `الشحن: ${formatCurrency(shippingAmount)}`)
                                            : 'اختر المحافظة لحساب سعر الشحن تلقائياً.'}
                                    </p>
                                    {shippingPricingDetails.source === 'live' && shippingPricingDetails.recommendedCourierName ? (
                                        <p className={`mt-2 text-xs font-black ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>
                                            {shippingPricingDetails.recommendedCourierName === shippingPricingDetails.courierName
                                                ? `الشركة الموصى بها حاليًا: ${shippingPricingDetails.recommendedCourierName}`
                                                : `الاقتراح الأرخص حاليًا: ${shippingPricingDetails.recommendedCourierName}`}
                                        </p>
                                    ) : null}
                                    {shippingPricingDetails.source === 'live' && shippingPricingDetails.courierName && shippingPricingDetails.courierName !== shippingPricingDetails.recommendedCourierName ? (
                                        <p className={`mt-2 text-xs font-black ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>
                                            الشركة المختارة حاليًا: {shippingPricingDetails.courierName}
                                        </p>
                                    ) : null}
                                    {selectedShippingAddressId ? (
                                        <p className={`mt-2 text-xs font-black ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>
                                            تم اختيار عنوان محفوظ
                                        </p>
                                    ) : hasSavedShippingAddress ? (
                                        <p className={`mt-2 text-xs font-black ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>
                                            العنوان الحالي جاهز للحفظ مع الطلب
                                        </p>
                                    ) : null}
                                </div>
                                <span className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isShippingSelected ? selectedDeliveryCheckClasses : 'border-brandGold/35 bg-transparent text-brandGold/0 dark:border-brandGold/20 dark:text-brandGold/0'}`}>
                                    <i className={`fa-solid fa-check text-[10px] ${isShippingSelected ? 'opacity-100' : 'opacity-0'}`}></i>
                                </span>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleDeliverySection('shipping')}
                            aria-label={isShippingExpanded ? 'إغلاق تفاصيل الشحن' : 'فتح تفاصيل الشحن'}
                            aria-expanded={isShippingExpanded}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${isShippingSelected ? selectedDeliveryToggleClasses : 'border-brandGold/20 bg-brandGold/5 text-brandGold dark:border-brandGold/15 dark:bg-brandGold/10'}`}
                        >
                            <i className={`fa-solid ${isShippingExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm`}></i>
                        </button>
                    </div>

                    {isShippingExpanded ? (
                        <div className={`border-t px-4 pb-4 pt-4 ${isShippingSelected ? selectedDeliveryDividerClasses : 'border-brandGold/15 dark:border-brandGold/10'}`}>
                            {savedShippingAddresses.length > 0 ? (
                                <div className="mb-4 space-y-3 rounded-[1.1rem] border border-brandGold/15 bg-brandGold/[0.04] p-4 dark:bg-brandGold/[0.08]">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="text-right">
                                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>Saved Addresses</p>
                                            <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">العناوين المحفوظة</p>
                                            <p className={`mt-2 text-sm font-bold leading-7 ${isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>
                                                اختَر عنوانًا محفوظًا أو أضف عنوانًا جديدًا بدون فقدان الافتراضي الحالي.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAddNewShippingAddress}
                                            className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition-colors ${isShippingSelected ? selectedDeliveryActionClasses : 'border-brandGold/20 bg-brandGold/5 text-brandBlue hover:bg-brandGold/10 dark:text-brandGold'}`}
                                        >
                                            إضافة عنوان جديد
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {savedShippingAddresses.map((address) => {
                                            const isSelectedAddress = address.id === selectedShippingAddressId;
                                            const isDefaultAddress = address.id === defaultShippingAddressId;

                                            return (
                                                <button
                                                    key={address.id}
                                                    type="button"
                                                    onClick={() => handleSelectSavedShippingAddress(address.id)}
                                                    className={`w-full rounded-[1rem] border px-4 py-3 text-right transition-colors ${isSelectedAddress ? 'border-brandGold/35 bg-brandGold/10 text-brandBlue dark:text-white' : 'border-brandGold/12 bg-white/70 text-brandBlue hover:bg-brandGold/[0.06] dark:bg-gray-900/35 dark:text-slate-200'}`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1 text-right">
                                                            <div className="flex flex-wrap justify-end gap-2">
                                                                {isDefaultAddress ? (
                                                                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Default</span>
                                                                ) : null}
                                                                {isSelectedAddress ? (
                                                                    <span className="rounded-full bg-brandBlue/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brandBlue dark:text-brandGold">Selected</span>
                                                                ) : null}
                                                            </div>
                                                            <p className="mt-2 text-sm font-black">{address.recipientName || customerInfo?.name || 'عنوان محفوظ'}</p>
                                                            <p className="mt-2 text-xs font-bold leading-6 text-slate-500 dark:text-slate-300">{buildSavedShippingAddressSummary(address)}</p>
                                                            {address.recipientPhone ? (
                                                                <p className="mt-2 text-[11px] font-black text-slate-400">رقم بديل: {address.recipientPhone}</p>
                                                            ) : null}
                                                        </div>
                                                        <span className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelectedAddress ? selectedDeliveryCheckClasses : 'border-brandGold/35 bg-transparent text-brandGold/0 dark:border-brandGold/20 dark:text-brandGold/0'}`}>
                                                            <i className={`fa-solid fa-check text-[10px] ${isSelectedAddress ? 'opacity-100' : 'opacity-0'}`}></i>
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isShippingAddressFormOpen) {
                                            setIsShippingAddressFormOpen(false);
                                            setShippingAddressError('');
                                            return;
                                        }

                                        handleAddNewShippingAddress();
                                    }}
                                    className={`inline-flex w-fit shrink-0 items-center gap-3 whitespace-nowrap rounded-full border px-5 py-3 text-sm font-black leading-none transition-colors ${isShippingSelected ? selectedDeliveryActionClasses : 'border-brandGold/20 bg-brandGold/5 text-brandBlue hover:bg-brandGold/10 dark:text-brandGold'}`}
                                >
                                    <span className="text-lg leading-none">{isShippingAddressFormOpen ? '−' : '+'}</span>
                                    <span className="leading-none">{isShippingAddressFormOpen ? 'إخفاء العنوان' : 'إضافة عنوان جديد'}</span>
                                </button>
                            </div>

                            {selectedSavedShippingAddress && !isShippingAddressFormOpen ? (
                                <div className="mt-4 rounded-[1.1rem] border border-brandGold/15 bg-white/70 px-4 py-4 text-right dark:bg-gray-900/35">
                                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>Selected Address</p>
                                    <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">{selectedSavedShippingAddress.recipientName || customerInfo?.name || 'عنوان الشحن المختار'}</p>
                                    <p className={`mt-2 text-sm font-bold leading-7 ${isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>{buildSavedShippingAddressSummary(selectedSavedShippingAddress)}</p>
                                </div>
                            ) : null}

                            {isShippingAddressFormOpen ? (
                                <div ref={shippingAddressSectionRef} className="mt-4 scroll-mt-28">
                                    <label className={`block text-right text-[11px] font-black uppercase tracking-[0.2em] ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>Shipping Address | عنوان الشحن</label>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        {SHIPPING_ADDRESS_FIELDS.map((field) => (
                                            <label key={field.key} className={`block text-right ${field.wrapperClassName || ''}`}>
                                                <span className={`block text-[11px] font-black uppercase tracking-[0.18em] ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-slate-500 dark:text-slate-300'}`}>
                                                    {field.label}
                                                </span>
                                                {field.type === 'select' ? (
                                                    <select
                                                        ref={(element) => {
                                                            shippingAddressFieldRefs.current[field.key] = element;
                                                        }}
                                                        name={field.key}
                                                        value={shippingAddressFields[field.key]}
                                                        onChange={(event) => handleShippingAddressFieldChange(field.key, event.target.value)}
                                                        className={`mt-2 w-full rounded-[1.1rem] border bg-white px-4 py-3 text-sm font-bold text-brandBlue outline-none transition-colors dark:bg-gray-900 dark:text-white ${shippingAddressError ? 'border-red-400 focus:border-red-500' : 'border-brandGold/20 focus:border-brandGold'}`}
                                                    >
                                                        <option value="">{field.placeholder}</option>
                                                        {field.options?.map((option) => (
                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                ) : field.type === 'district-select' ? (
                                                    <div ref={districtAutocompleteRef} className="relative mt-2">
                                                        <input
                                                            ref={(element) => {
                                                                shippingAddressFieldRefs.current[field.key] = element;
                                                            }}
                                                            type="text"
                                                            name={field.key}
                                                            value={shippingAddressFields[field.key]}
                                                            onChange={(event) => handleDistrictInputChange(event.target.value)}
                                                            onFocus={() => {
                                                                if (selectedShippingGovernorate && districtOptions.length > 0) {
                                                                    setIsDistrictSuggestionsOpen(true);
                                                                }
                                                            }}
                                                            onKeyDown={handleDistrictInputKeyDown}
                                                            disabled={!selectedShippingGovernorate || isLoadingDistrictOptions || districtOptions.length === 0}
                                                            placeholder={!selectedShippingGovernorate
                                                                ? 'اختر المحافظة أولاً'
                                                                : isLoadingDistrictOptions
                                                                    ? 'جاري تحميل المناطق من SideUp...'
                                                                    : districtOptions.length > 0
                                                                        ? 'ابدأ اكتب الحي / المنطقة'
                                                                        : 'لا توجد مناطق متاحة حالياً'}
                                                            className={`w-full rounded-[1.1rem] border bg-white px-4 py-3 text-right text-sm font-bold text-brandBlue outline-none transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:text-white ${shippingAddressError ? 'border-red-400 focus:border-red-500' : 'border-brandGold/20 focus:border-brandGold'}`}
                                                        />

                                                        {isDistrictSuggestionsOpen && selectedShippingGovernorate && !isLoadingDistrictOptions && districtOptions.length > 0 ? (
                                                            <div className="custom-scroll absolute inset-x-0 top-full z-[90] mt-2 max-h-64 overflow-y-auto rounded-[1rem] border border-brandGold/20 bg-[#11192b] py-2 shadow-[0_20px_45px_rgba(6,11,23,0.35)]">
                                                                {filteredDistrictOptions.length > 0 ? (
                                                                    filteredDistrictOptions.map((option) => {
                                                                        const isSelectedDistrict = String(option?.optionId || '').trim() === selectedDistrictOptionId;

                                                                        return (
                                                                            <button
                                                                                key={option.optionId}
                                                                                type="button"
                                                                                onClick={() => handleDistrictSelection(option.optionId)}
                                                                                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-sm font-bold transition-colors ${isSelectedDistrict ? 'bg-brandGold/12 text-brandGold' : 'text-white hover:bg-white/5'}`}
                                                                            >
                                                                                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                                                                {isSelectedDistrict ? <i className="fa-solid fa-check text-[11px]"></i> : null}
                                                                            </button>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <div className="px-4 py-3 text-sm font-bold text-slate-300">
                                                                        لا يوجد حي / منطقة مطابقة لما كتبته.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : (
                                                    <input
                                                        ref={(element) => {
                                                            shippingAddressFieldRefs.current[field.key] = element;
                                                        }}
                                                        type="text"
                                                        name={field.key}
                                                        inputMode={field.inputMode || 'text'}
                                                        dir={field.dir || 'rtl'}
                                                        value={shippingAddressFields[field.key]}
                                                        onChange={(event) => handleShippingAddressFieldChange(field.key, event.target.value)}
                                                        placeholder={field.placeholder}
                                                        className={`mt-2 w-full rounded-[1.1rem] border bg-white px-4 py-3 text-sm font-bold text-brandBlue outline-none transition-colors placeholder:text-slate-400 dark:bg-gray-900 dark:text-white ${shippingAddressError ? 'border-red-400 focus:border-red-500' : 'border-brandGold/20 focus:border-brandGold'}`}
                                                    />
                                                )}
                                            </label>
                                        ))}
                                    </div>

                                    <label className="mt-4 flex items-center justify-end gap-3 text-right">
                                        <span className={`text-sm font-black leading-7 ${isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>اجعل هذا العنوان هو الافتراضي للحساب</span>
                                        <input
                                            type="checkbox"
                                            checked={makeShippingAddressDefault}
                                            onChange={(event) => setMakeShippingAddressDefault(event.target.checked)}
                                            className="h-4 w-4 rounded border-brandGold/30 text-brandGold focus:ring-brandGold"
                                        />
                                    </label>

                                    {selectedShippingGovernorate ? (
                                        <div className="mt-3 rounded-[1.1rem] border border-brandGold/15 bg-brandGold/[0.05] px-4 py-3 text-right dark:bg-brandGold/[0.08]">
                                            <p className={`text-sm font-black ${isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>
                                                المحافظة: {selectedShippingGovernorate}
                                            </p>
                                            {shippingAddressFields.district ? (
                                                <p className={`mt-2 text-sm font-bold leading-7 ${isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>
                                                    الحي / المنطقة: {shippingAddressFields.district}
                                                </p>
                                            ) : null}
                                            {shippingAddressFields.districtId ? (
                                                <p className="mt-2 text-xs font-black text-emerald-600 dark:text-brandGold">
                                                    تم اختيار المنطقة من بيانات SideUp بنجاح.
                                                </p>
                                            ) : null}
                                            {shippingPricingDetails.source === 'live' || shippingPricingDetails.source === 'fallback' ? (
                                                <p className="mt-2 text-sm font-black text-emerald-600 dark:text-brandGold">
                                                    الشحن: {formatCurrency(shippingAmount)}
                                                </p>
                                            ) : null}
                                            {shippingPricingDetails.source === 'loading' ? (
                                                <p className="mt-2 text-xs font-black text-emerald-600 dark:text-brandGold">
                                                    جاري حساب سعر الشحن من SideUp...
                                                </p>
                                            ) : null}
                                            {shippingPricingDetails.source === 'pending' ? (
                                                <p className="mt-2 text-xs font-black text-emerald-600 dark:text-brandGold">
                                                    اختر المنطقة لاستكمال تحديد سعر الشحن.
                                                </p>
                                            ) : null}
                                            {shippingPricingDetails.source === 'live' && shippingPricingDetails.courierName ? (
                                                <p className="mt-2 text-xs font-black text-emerald-600 dark:text-brandGold">
                                                    {shippingPricingDetails.recommendedCourierName === shippingPricingDetails.courierName
                                                        ? `تم اعتماد الشركة الموصى بها من SideUp: ${shippingPricingDetails.courierName}`
                                                        : `الشركة المختارة حاليًا: ${shippingPricingDetails.courierName}`}
                                                </p>
                                            ) : null}
                                            {shippingPricingDetails.source === 'live' && shippingPricingDetails.recommendedCourierName && shippingPricingDetails.recommendedCourierName !== shippingPricingDetails.courierName ? (
                                                <p className="mt-2 text-xs font-black text-emerald-600 dark:text-brandGold">
                                                    الترشيح الأرخص لمنطقتك: {shippingPricingDetails.recommendedCourierName}
                                                </p>
                                            ) : null}
                                            {shippingPricingDetails.source === 'fallback' && shippingPricingDetails.livePricingError ? (
                                                <p className="mt-2 text-xs font-black text-amber-600 dark:text-amber-300">
                                                    {shippingPricingDetails.livePricingError}
                                                </p>
                                            ) : null}
                                        </div>
                                    ) : null}

                                    {districtOptionsError ? (
                                        <p className="mt-3 text-sm font-extrabold text-red-200 dark:text-red-500">{districtOptionsError}</p>
                                    ) : null}

                                    {shippingAddressError ? (
                                        <p className="mt-3 text-sm font-extrabold text-red-200 dark:text-red-500">{shippingAddressError}</p>
                                    ) : (
                                        <p className={`mt-3 text-sm font-bold leading-7 ${isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>
                                            سيتم حفظ هذا العنوان في حسابك، واستخدام الحي / المنطقة المختارة مباشرة مع SideUp بدل التخمين من النص الحر.
                                        </p>
                                    )}
                                </div>
                            ) : shippingAddressError ? (
                                <p className="mt-3 text-sm font-extrabold text-red-200 dark:text-red-500">{shippingAddressError}</p>
                            ) : null}

                            {shippingPricingDetails.source === 'live' && shippingPricingDetails.quotes.length > 0 ? (
                                <div className="mt-4 rounded-[1.1rem] border border-brandGold/15 bg-brandGold/[0.04] p-4 dark:bg-brandGold/[0.08]">
                                    <div className="text-right">
                                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isShippingSelected ? selectedDeliveryEyebrowClasses : 'text-brandGold'}`}>Shipping Courier</p>
                                        <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">اختَر شركة الشحن المناسبة لك</p>
                                        <p className={`mt-2 text-sm font-bold leading-7 ${isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>
                                            الموقع يرشّح الأرخص تلقائيًا حسب المنطقة، ويمكنك تغييره قبل تأكيد الطلب.
                                        </p>
                                    </div>

                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        {shippingPricingDetails.quotes.map((quote) => {
                                            const isSelectedQuote = String(quote?.courierId || '').trim() === shippingPricingDetails.courierId;
                                            const isRecommendedQuote = String(quote?.courierId || '').trim() === shippingPricingDetails.recommendedCourierId;

                                            return (
                                                <button
                                                    key={quote.courierId}
                                                    type="button"
                                                    onClick={() => handleSelectShippingCourier(quote.courierId)}
                                                    className={`rounded-[1rem] border px-4 py-4 text-right transition-colors ${isSelectedQuote ? 'border-brandGold/35 bg-brandGold/10 text-brandBlue dark:text-white' : 'border-brandGold/12 bg-white/70 text-brandBlue hover:bg-brandGold/[0.06] dark:bg-gray-900/35 dark:text-slate-200'}`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1 text-right">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <CourierLogoBadge courierName={quote.courierName} />
                                                                <div className="flex flex-wrap justify-end gap-2">
                                                                    {isRecommendedQuote ? (
                                                                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Recommended</span>
                                                                    ) : null}
                                                                    {isSelectedQuote ? (
                                                                        <span className="rounded-full bg-brandBlue/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brandBlue dark:text-brandGold">Selected</span>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                            <p className="mt-3 text-base font-black">{quote.courierName || 'شركة شحن'}</p>
                                                            <p className="mt-2 text-sm font-black text-emerald-600 dark:text-brandGold">الشحن: {formatCurrency(getSideUpQuoteAmount(quote))}</p>
                                                            {quote.deliveryTime ? (
                                                                <p className="mt-2 text-xs font-black text-slate-500 dark:text-slate-300">المدة المتوقعة: {quote.deliveryTime}</p>
                                                            ) : null}
                                                        </div>
                                                        <span className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelectedQuote ? selectedDeliveryCheckClasses : 'border-brandGold/35 bg-transparent text-brandGold/0 dark:border-brandGold/20 dark:text-brandGold/0'}`}>
                                                            <i className={`fa-solid fa-check text-[10px] ${isSelectedQuote ? 'opacity-100' : 'opacity-0'}`}></i>
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <p className={`mt-3 text-sm font-bold leading-7 ${isShippingSelected ? selectedDeliveryMutedTextClasses : 'text-slate-500 dark:text-slate-300'}`}>
                                        سيتم حفظ اختيارك مع الطلب واستخدامه لاحقًا عند إنشاء شحنة SideUp.
                                    </p>
                                </div>
                            ) : null}

                            {shippingPricingDetails.source === 'live' && isMylerzShippingSelected ? (
                                <div className="mt-4 rounded-[1rem] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-right">
                                    <p className="text-sm font-black text-amber-700 dark:text-amber-200">
                                        تنبيه بسيط: شركة Mylerz قد تستغرق حتى 5 أيام لتوصيل الطلب.
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );

    if (isGalleryLoading || isSettingsLoading || isCustomerLoading || !isCartPricingReady) {
        return (
            <BrandLoadingScreen
                title={isWholesale ? 'Loading wholesale checkout' : 'Loading checkout'}
                message={isWholesale ? 'جاري تحميل بيانات طلب الجملة والحساب والأسعار النهائية قبل فتح الصفحة' : 'جاري تحميل بيانات العربة والحساب والأسعار النهائية قبل فتح صفحة الـ checkout'}
                showProgressBar={false}
            />
        );
    }

    if (isWholesale && auth.currentUser && !isWholesaleCustomer) {
        return (
            <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-12" dir="rtl">
                <div className="overflow-hidden rounded-[2rem] border border-brandGold/25 bg-white shadow-[0_25px_80px_rgba(18,25,38,0.08)] dark:bg-darkCard">
                    <div className="border-b border-brandGold/15 bg-gradient-to-r from-brandBlue via-[#1f2a44] to-brandBlue px-6 py-8 text-white md:px-10">
                        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-brandGold">Wholesale Checkout</p>
                        <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">هذا المسار متاح لحسابات الجملة فقط</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
                            الحساب الحالي لا يملك صلاحية تأكيد طلب جملة. يمكنك الرجوع لطلب التجزئة أو التواصل مع الإدارة لتفعيل حساب الجملة.
                        </p>
                    </div>
                    <div className="flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-10">
                        <Link href="/checkout" className="inline-flex items-center justify-center rounded-2xl border border-brandBlue bg-brandBlue px-6 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01]">
                            التحويل إلى Checkout التجزئة
                        </Link>
                        <Link href="/profile" className="inline-flex items-center justify-center rounded-2xl border border-brandGold/35 px-6 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-brandGold">
                            الذهاب إلى الحساب
                        </Link>
                    </div>
                </div>
            </section>
        );
    }

    if (items.length === 0 && !orderConfirmation) {
        return (
            <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-12" dir="rtl">
                <div className="overflow-hidden rounded-[2rem] border border-brandGold/20 bg-white shadow-[0_25px_80px_rgba(18,25,38,0.08)] dark:bg-darkCard">
                    <div className="border-b border-brandGold/15 bg-gradient-to-r from-brandBlue via-[#1f2a44] to-brandBlue px-6 py-8 text-white md:px-10">
                        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-brandGold">{isWholesale ? 'Wholesale Checkout' : 'Checkout'}</p>
                        <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">{isWholesale ? 'طلب الجملة فارغ حالياً' : 'لا توجد منتجات داخل الطلب حالياً'}</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
                            أضف المنتجات أولاً من المعرض، وبعدها ارجع هنا لمراجعة التفاصيل وتأكيد الطلب.
                        </p>
                    </div>
                    <div className="flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-10">
                        <Link href="/" className="inline-flex items-center justify-center rounded-2xl border border-brandBlue bg-brandBlue px-6 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01]">
                            الرجوع للمعرض
                        </Link>
                        {isWholesale ? (
                            <Link href="/checkout" className="inline-flex items-center justify-center rounded-2xl border border-brandGold/35 px-6 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-brandGold">
                                فتح Checkout التجزئة
                            </Link>
                        ) : null}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12" dir="rtl">
            <div className="overflow-hidden rounded-[2rem] border border-brandGold/20 bg-white shadow-[0_25px_80px_rgba(18,25,38,0.08)] dark:bg-darkCard">
                <div className={`relative overflow-hidden px-5 py-6 md:px-10 md:py-10 ${isWholesale ? 'bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.25),_transparent_38%),linear-gradient(135deg,#121926_0%,#1e2740_45%,#0b1222_100%)]' : 'bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.18),_transparent_35%),linear-gradient(135deg,#f7f3e8_0%,#ffffff_42%,#eef3fb_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.22),_transparent_38%),linear-gradient(135deg,#121926_0%,#1c2438_48%,#0b1222_100%)]'}`}>
                    <div className="pointer-events-none absolute left-[-8rem] top-1/2 hidden h-[22rem] w-[34rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.22)_0%,rgba(212,175,55,0.13)_26%,rgba(212,175,55,0.06)_46%,transparent_74%)] blur-3xl md:block dark:bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.2)_0%,rgba(212,175,55,0.12)_26%,rgba(212,175,55,0.05)_46%,transparent_74%)]"></div>
                    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className={`text-[10px] font-black uppercase tracking-[0.28em] md:text-[11px] md:tracking-[0.35em] ${isWholesale ? 'text-brandGold' : 'text-brandBlue/60 dark:text-brandGold'}`}>
                                {isWholesale ? 'Wholesale Checkout' : 'Retail Checkout'}
                            </p>
                            <h1 className={`mt-2 max-w-[280px] text-[1.95rem] font-black leading-[1.12] sm:max-w-sm sm:text-[2.2rem] md:mt-3 md:max-w-none md:text-4xl ${isWholesale ? 'text-white' : 'text-brandBlue dark:text-white'}`}>
                                {isWholesale ? 'راجع طلب الجملة قبل التأكيد' : 'راجع تفاصيل الطلب قبل التأكيد'}
                            </h1>
                            <p className={`mt-3 max-w-[290px] text-[12.5px] leading-6 sm:max-w-xl sm:text-sm md:max-w-2xl md:text-base md:leading-7 ${isWholesale ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                                هنا تقدر تشوف كل المنتجات، تعدل الكميات، وتراجع بيانات الحساب قبل إرسال الطلب النهائي.
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            <div className={`rounded-[1.1rem] border px-3 py-3 sm:rounded-[1.4rem] sm:px-5 sm:py-4 ${isWholesale ? 'border-brandGold/20 bg-white/8 text-white' : 'border-brandBlue/10 bg-white/80 text-brandBlue dark:border-brandGold/20 dark:bg-white/[0.05] dark:text-white'}`}>
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-60 sm:text-[10px] sm:tracking-[0.24em]">Items</p>
                                <p className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl">{itemCount}</p>
                            </div>
                            <div className={`rounded-[1.1rem] border px-3 py-3 sm:rounded-[1.4rem] sm:px-5 sm:py-4 ${isWholesale ? 'border-brandGold/20 bg-white/8 text-white' : 'border-brandBlue/10 bg-white/80 text-brandBlue dark:border-brandGold/20 dark:bg-white/[0.05] dark:text-white'}`}>
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-60 sm:text-[10px] sm:tracking-[0.24em]">Type</p>
                                <p className="mt-1 text-sm font-black sm:mt-2 sm:text-lg">{isWholesale ? 'Wholesale' : 'Retail'}</p>
                            </div>
                            <div className={`rounded-[1.1rem] border px-3 py-3 sm:rounded-[1.4rem] sm:px-5 sm:py-4 ${isWholesale ? 'border-brandGold/20 bg-white/8 text-white' : 'border-brandBlue/10 bg-white/80 text-brandBlue dark:border-brandGold/20 dark:bg-white/[0.05] dark:text-white'}`}>
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-60 sm:text-[10px] sm:tracking-[0.24em]">Total</p>
                                <p className="mt-1 text-lg font-black sm:mt-2 sm:text-2xl">{formatCurrency(subtotal)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
                <div className="space-y-5">
                    {items.map((item) => {
                        const stockLimit = getCartItemStockLimit(item, isWholesale ? 'wholesale' : 'retail');
                        const isAtStockLimit = stockLimit !== null && item.quantity >= stockLimit;

                        return (
                            <article key={item.cartId} className="rounded-[1.8rem] border border-brandGold/18 bg-white p-5 shadow-[0_20px_45px_rgba(18,25,38,0.06)] dark:border-brandGold/15 dark:bg-darkCard md:p-6">
                                <div className="flex flex-col gap-5 md:flex-row md:items-center">
                                    <div className="hidden h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[1.5rem] border border-brandGold/15 bg-gray-50 p-3 dark:bg-gray-900/50 md:flex">
                                        <img src={item.image || '/logo.png'} alt={item.title || item.name} className="max-h-full max-w-full object-contain" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="space-y-4 md:hidden">
                                            <div className="flex items-start gap-4">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] border border-brandGold/15 bg-gray-50 p-3 dark:bg-gray-900/50">
                                                        <img src={item.image || '/logo.png'} alt={item.title || item.name} className="max-h-full max-w-full object-contain" />
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Price</p>
                                                        <p className="mt-1 text-lg font-black text-green-600 dark:text-brandGold">{formatCurrency(item.price)}</p>
                                                    </div>
                                                </div>

                                                <div className="min-w-0 flex-1 pt-1 text-right flex flex-col items-start min-h-[140px] justify-between">
                                                    <div>
                                                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-brandGold w-full text-right">{item.category || (isWholesale ? 'Wholesale Item' : 'Gallery Item')}</p>
                                                        <h2 className="mt-2 text-[1.28rem] font-black leading-[1.15] text-brandBlue dark:text-white sm:text-[1.45rem] w-full text-right">{item.title || item.name}</h2>
                                                        {item.productCode ? <p className="mt-2 text-[11px] font-bold tracking-[0.14em] text-slate-400 w-full text-right">Code: {item.productCode}</p> : null}
                                                    </div>
                                                    
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(item.cartId)}
                                                        className="inline-flex items-center justify-center rounded-full border border-red-200 px-5 py-2 text-xs font-black text-red-500 transition-colors hover:bg-red-50 dark:border-red-500/20 dark:hover:bg-red-500/10 mt-auto ml-0 mr-auto self-end"
                                                    >
                                                        حذف
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="hidden md:flex md:flex-row md:items-start md:justify-between md:gap-4">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold">{item.category || (isWholesale ? 'Wholesale Item' : 'Gallery Item')}</p>
                                                <h2 className="mt-2 text-xl font-black text-brandBlue dark:text-white">{item.title || item.name}</h2>
                                                {item.productCode ? <p className="mt-2 text-xs font-bold tracking-[0.18em] text-slate-400">Code: {item.productCode}</p> : null}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => removeItem(item.cartId)}
                                                className="inline-flex items-center justify-center rounded-full border border-red-200 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-500 transition-colors hover:bg-red-50 dark:border-red-500/20 dark:hover:bg-red-500/10"
                                            >
                                                حذف
                                            </button>
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 items-start gap-4 md:mt-5 md:grid-cols-[auto_auto_1fr] md:items-end">
                                            <div className="hidden text-right md:block">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Price</p>
                                                <p className="mt-2 text-xl font-black text-green-600 dark:text-brandGold">{formatCurrency(item.price)}</p>
                                            </div>

                                            <div className="text-left md:text-center order-2 md:order-none">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Quantity</p>
                                                <div className="mt-2 inline-flex items-center rounded-2xl border border-brandGold/20 bg-white shadow-sm dark:bg-gray-900">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateQuantity(item.cartId, item.quantity - 1)}
                                                        className="flex h-11 w-11 items-center justify-center text-lg font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-white"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="min-w-12 border-x border-brandGold/15 px-4 text-center text-sm font-black text-brandBlue dark:text-white">{item.quantity}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateQuantity(item.cartId, item.quantity + 1)}
                                                        disabled={isAtStockLimit}
                                                        className="flex h-11 w-11 items-center justify-center text-lg font-black text-brandBlue transition-colors hover:bg-brandGold/10 disabled:cursor-not-allowed disabled:opacity-35 dark:text-white"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="text-right md:text-left order-1 md:order-none">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Line Total</p>
                                                <p className="mt-2 text-2xl font-black text-brandBlue dark:text-white md:text-xl">{formatCurrency((Number(item.price) || 0) * item.quantity)}</p>
                                                {stockLimit !== null ? (
                                                    <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                                        {stockLimit > 0 ? `المتاح حالياً: ${stockLimit}` : 'غير متاح حالياً'}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>

                <aside className="space-y-5 xl:sticky xl:top-28 xl:self-start">
                    <div className="rounded-[1.8rem] border border-brandGold/20 bg-white p-6 shadow-[0_20px_45px_rgba(18,25,38,0.06)] dark:bg-darkCard">
                        <div className="flex items-center justify-between gap-3 border-b border-brandGold/12 pb-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold">Customer Details</p>
                                <h2 className="mt-2 text-xl font-black text-brandBlue dark:text-white">بيانات تأكيد الطلب</h2>
                            </div>
                            {!auth.currentUser ? (
                                <span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-red-500 dark:bg-red-500/10">Login Required</span>
                            ) : null}
                        </div>

                        {isCustomerLoading ? (
                            <div className="space-y-3 pt-5">
                                <div className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"></div>
                                <div className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"></div>
                                <div className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"></div>
                            </div>
                        ) : customerInfo ? (
                            <div className="space-y-3 pt-5">
                                <div className="rounded-2xl border border-brandGold/12 bg-gray-50 px-4 py-4 dark:bg-gray-900/50">
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">الاسم</p>
                                    <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">{customerInfo.name}</p>
                                </div>
                                <div className="rounded-2xl border border-brandGold/12 bg-gray-50 px-4 py-4 dark:bg-gray-900/50">
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">البريد الإلكتروني</p>
                                    <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">{customerInfo.email}</p>
                                </div>
                                <div className="rounded-2xl border border-brandGold/12 bg-gray-50 px-4 py-4 dark:bg-gray-900/50">
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">رقم الهاتف</p>
                                    <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">{customerInfo.phone}</p>
                                </div>

                                {deliveryMethodSection}
                            </div>
                        ) : (
                            <div className="space-y-4 pt-5">
                                {deliveryMethodSection}
                                <p className="rounded-2xl border border-dashed border-brandGold/25 bg-brandGold/5 px-4 py-4 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">
                                    لازم تسجل الدخول أو تنشئ حساب قبل تأكيد الطلب. السلة محفوظة عندك، وبعد تسجيل الدخول هترجع لنفس صفحة الـ checkout.
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Link href={loginTarget} onClick={persistCheckoutDraftNow} className="inline-flex items-center justify-center rounded-2xl border border-brandBlue bg-brandBlue px-4 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01]">
                                        تسجيل الدخول
                                    </Link>
                                    <Link href={signupTarget} onClick={persistCheckoutDraftNow} className="inline-flex items-center justify-center rounded-2xl border border-brandGold/35 px-4 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-brandGold">
                                        إنشاء حساب
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-[1.8rem] border border-brandGold/20 bg-white p-6 shadow-[0_20px_45px_rgba(18,25,38,0.06)] dark:bg-darkCard">
                        <div className="border-b border-brandGold/12 pb-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold">Order Summary</p>
                            <h2 className="mt-2 text-xl font-black text-brandBlue dark:text-white">ملخص الطلب</h2>
                        </div>

                        <div className="space-y-4 pt-5 text-sm font-bold text-slate-600 dark:text-slate-300">
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Items</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">عدد الأصناف</span>
                                </span>
                                <span className="text-brandBlue dark:text-white">{productCount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Subtotal</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">الطلب</span>
                                </span>
                                <span className="text-brandBlue dark:text-white">{formatCurrency(subtotal)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Discount</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">الخصم</span>
                                </span>
                                <span className={discountAmount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-brandBlue dark:text-white'}>
                                    {discountAmount > 0 ? `- ${formatCurrency(discountAmount)}` : formatCurrency(0)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Delivery</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">طريقة الاستلام</span>
                                </span>
                                <span className="text-brandBlue dark:text-white">{isShippingSelected ? 'شحن' : 'استلام من المعرض'}</span>
                            </div>
                            {isShippingSelected && selectedShippingGovernorate ? (
                                <div className="flex items-center justify-between gap-4">
                                    <span className="flex flex-col items-end gap-1 text-right">
                                        <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Governorate</span>
                                        <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">المحافظة</span>
                                    </span>
                                    <span className="text-brandBlue dark:text-white">{selectedShippingGovernorate}</span>
                                </div>
                            ) : null}
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Shipping</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">الشحن</span>
                                </span>
                                <span className="text-brandBlue dark:text-white">{shippingDisplayValue}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-dashed border-brandGold/15 pt-4 text-base">
                                <span className="flex flex-col items-end gap-1 text-right font-black text-brandBlue dark:text-white">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Total</span>
                                    <span className="block w-full text-right text-[1.05rem] font-extrabold leading-tight text-brandBlue dark:text-white">الإجمالي النهائي</span>
                                </span>
                                <span className="text-2xl font-black text-green-600 dark:text-brandGold">{totalDisplayValue}</span>
                            </div>
                        </div>

                        <div className="mt-5 rounded-[1.4rem] border border-brandGold/15 bg-brandGold/[0.04] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 text-right">
                                    <p className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Promo Code</p>
                                    <p className="mt-1 block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">كود الخصم</p>
                                    <p className="mt-2 block w-full text-right text-[0.95rem] font-bold leading-7 text-slate-500 dark:text-slate-300">
                                        {activePromoCodes.length > 0 ? 'اكتب أي Promo Code مفعّل واضغط تطبيق. أكواد الشحن المجاني تحتاج اختيار الشحن والمحافظة أولاً.' : 'لا يوجد Promo Code مفعّل حالياً من لوحة الإدارة.'}
                                    </p>
                                </div>
                                {isPromoApplied ? (
                                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-500">
                                        Applied
                                    </span>
                                ) : null}
                            </div>

                            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                <input
                                    type="text"
                                    value={promoCodeInput}
                                    onChange={(event) => {
                                        setPromoCodeInput(event.target.value);
                                        setAppliedPromoCode('');
                                        setPromoFeedback(null);
                                    }}
                                    placeholder="اكتب الـ Promo Code"
                                    disabled={!activePromoCodes.length}
                                    className="min-w-0 flex-1 rounded-2xl border border-brandGold/20 bg-white px-4 py-3 text-sm font-black uppercase text-brandBlue outline-none transition-colors placeholder:text-slate-400 focus:border-brandGold dark:bg-gray-900 dark:text-white"
                                />
                                <button
                                    type="button"
                                    onClick={handleApplyPromoCode}
                                    disabled={!activePromoCodes.length}
                                    className={`inline-flex items-center justify-center rounded-2xl border border-brandBlue bg-brandBlue px-5 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 ${shouldNudgePromoApplyButton ? 'promo-apply-attention' : ''}`}
                                >
                                    تطبيق الكود
                                </button>
                            </div>

                            {promoFeedback ? (
                                <p className={`mt-3 text-sm font-extrabold leading-7 ${promoFeedback.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                                    {promoFeedback.message}
                                </p>
                            ) : null}

                            {isPromoApplied ? (
                                <button
                                    type="button"
                                    onClick={handleClearPromoCode}
                                    className="mt-3 text-sm font-extrabold text-brandBlue transition-colors hover:text-brandGold dark:text-brandGold"
                                >
                                    إزالة البرومو كود
                                </button>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={handleConfirmOrder}
                            disabled={isCheckoutSubmitting}
                            className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border px-5 py-4 text-sm font-black uppercase tracking-[0.18em] shadow-lg transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 ${isWholesale ? 'border-brandGold bg-brandGold text-brandBlue shadow-brandGold/20' : 'border-brandGold bg-brandBlue text-white shadow-brandBlue/20'}`}
                        >
                            <span>{isCheckoutSubmitting ? 'Processing...' : (auth.currentUser ? 'Confirm Order | تأكيد الطلب' : 'Login To Confirm | سجل الدخول أولاً')}</span>
                            <i className={`fa-solid ${isCheckoutSubmitting ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                        </button>

                        <Link href="/" className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-brandGold/20 px-5 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-brandGold">
                            متابعة التسوق
                        </Link>
                    </div>
                </aside>
            </div>
            {isPhonePromptOpen ? (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#060b17]/72 px-4 py-6 backdrop-blur-sm" onClick={closePhonePrompt}>
                    <div className="w-full max-w-md rounded-[1.8rem] border border-brandGold/20 bg-white p-6 shadow-[0_28px_80px_rgba(6,11,23,0.38)] dark:bg-darkCard" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="text-right">
                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold">Mobile Number Required</p>
                                <h3 className="mt-2 text-2xl font-black text-brandBlue dark:text-white">أضف رقم الموبايل لإكمال الطلب</h3>
                                <p className="mt-3 text-sm font-bold leading-7 text-slate-500 dark:text-slate-300">
                                    قبل تأكيد الطلب نحتاج رقم موبايلك. بعد حفظه سيتم تسجيله في حسابك وإرسال الطلب للإدارة بشكل طبيعي.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closePhonePrompt}
                                disabled={isSavingPhone || isSubmitting}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-brandGold/15 text-brandBlue transition-colors hover:bg-brandGold/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white"
                                aria-label="إغلاق"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <form className="mt-6" onSubmit={handlePhonePromptSubmit}>
                            <label className="block text-right text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Mobile Number | رقم الموبايل</label>
                            <input
                                type="tel"
                                inputMode="tel"
                                autoFocus
                                dir="ltr"
                                value={phonePromptValue}
                                onChange={(event) => {
                                    setPhonePromptValue(event.target.value);
                                    setPhonePromptError('');
                                }}
                                placeholder="01012345678 أو +201012345678"
                                className={`mt-3 w-full rounded-[1.35rem] border bg-white px-4 py-3 text-left text-sm font-black text-brandBlue outline-none transition-colors placeholder:text-slate-400 dark:bg-gray-900 dark:text-white ${phonePromptError ? 'border-red-400 focus:border-red-500' : 'border-brandGold/20 focus:border-brandGold'}`}
                            />

                            {phonePromptError ? (
                                <p className="mt-3 text-sm font-extrabold leading-7 text-red-500 dark:text-red-400">{phonePromptError}</p>
                            ) : (
                                <p className="mt-3 text-sm font-bold leading-7 text-slate-500 dark:text-slate-300">
                                    يمكنك كتابة الرقم بصيغة `010...` أو `+20...` وسنحفظه في بياناتك مباشرة.
                                </p>
                            )}

                            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={closePhonePrompt}
                                    disabled={isSavingPhone || isSubmitting}
                                    className="inline-flex items-center justify-center rounded-2xl border border-brandGold/20 px-5 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-brandGold"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingPhone || isSubmitting}
                                    className="inline-flex items-center justify-center gap-3 rounded-2xl border border-brandGold bg-brandBlue px-5 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <span>{isSavingPhone ? 'Saving...' : 'حفظ الرقم وتأكيد الطلب'}</span>
                                    <i className="fa-solid fa-check"></i>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
            {orderConfirmation ? (
                <OrderSuccessPopup
                    isWholesale={isWholesale}
                    orderConfirmation={orderConfirmation}
                    onTrackOrder={handleTrackOrder}
                    onCloseToHome={handleCloseOrderConfirmation}
                />
            ) : null}
            {isCheckoutSubmitting ? <CheckoutSubmittingOverlay isWholesale={isWholesale} /> : null}
        </section>
    );
}