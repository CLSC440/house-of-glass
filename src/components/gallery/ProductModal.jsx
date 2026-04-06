'use client';
import { useGallery } from '@/contexts/GalleryContext';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatedTestimonials } from '@/components/ui/animated-testimonials';
import { buildWhatsAppUrl, useSiteSettings } from '@/lib/use-site-settings';
import { isAdminRole, normalizeUserRole, USER_ROLE_VALUES } from '@/lib/user-roles';

const LIVE_INDICATOR_DURATION_MS = 8000;

function parsePrice(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatPriceLabel(value) {
    return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
}

function normalizeShareCode(value) {
    return String(value || '')
        .trim()
        .replace(/^['"]+|['"]+$/g, '')
        .toLowerCase();
}

function getProductShareCode(product = {}) {
    const safeProduct = product && typeof product === 'object' ? product : {};

    const primaryCode = [safeProduct.code, safeProduct.barcode, safeProduct.sku]
        .map((entry) => String(entry || '').trim())
        .find(Boolean);

    if (primaryCode) {
        return primaryCode;
    }

    const variants = Array.isArray(safeProduct.variants) ? safeProduct.variants : [];
    const fallbackVariantCode = variants
        .flatMap((variant) => [variant?.code, variant?.barcode, variant?.sku])
        .map((entry) => String(entry || '').trim())
        .find(Boolean);

    return fallbackVariantCode || '';
}

function productMatchesShareCode(product = {}, shareCode) {
    const safeProduct = product && typeof product === 'object' ? product : {};
    const normalizedShareCode = normalizeShareCode(shareCode);
    if (!normalizedShareCode) {
        return false;
    }

    const directCodes = [safeProduct.code, safeProduct.barcode, safeProduct.sku]
        .map(normalizeShareCode)
        .filter(Boolean);

    if (directCodes.includes(normalizedShareCode)) {
        return true;
    }

    const variants = Array.isArray(safeProduct.variants) ? safeProduct.variants : [];
    return variants.some((variant) => [variant?.code, variant?.barcode, variant?.sku]
        .map(normalizeShareCode)
        .filter(Boolean)
        .includes(normalizedShareCode));
}

function findProductByShareCode(products = [], shareCode) {
    return products.find((product) => productMatchesShareCode(product, shareCode)) || null;
}

function clampQuantityValue(nextValue, limit = null) {
    const numericValue = Number(nextValue);
    const safeValue = Number.isFinite(numericValue) ? Math.max(1, Math.floor(numericValue)) : 1;

    if (limit === null) {
        return safeValue;
    }

    return Math.min(safeValue, Math.max(1, limit));
}

function resolveModalProductTitle(product = {}, fallbackTitle = '') {
    return String(product?.title || product?.name || product?.label || fallbackTitle || 'Selected product').trim();
}

function resolveModalProductImage(product = {}, fallbackImage = '') {
    if (fallbackImage) {
        return fallbackImage;
    }

    const imageCandidates = [
        product?.image,
        product?.primaryUrl,
        product?.url,
        product?.images?.[0]?.url,
        product?.images?.[0]?.primaryUrl,
        product?.images?.[0],
        product?.media?.[0]?.url,
        product?.media?.[0]?.primaryUrl,
        product?.media?.[0]
    ];

    return imageCandidates.find((entry) => typeof entry === 'string' && entry.trim()) || '/logo.png';
}

function buildProductModalUrl(pathname, currentSearch, nextShareCode, currentHash = '') {
    const params = new URLSearchParams(String(currentSearch || '').replace(/^\?/, ''));

    if (nextShareCode) {
        params.set('code', nextShareCode);
    } else {
        params.delete('code');
    }

    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ''}${currentHash || ''}`;
}

function replaceProductModalUrl(pathname, currentSearch, nextShareCode, currentHash = '') {
    if (typeof window === 'undefined') {
        return pathname;
    }

    const safePathname = pathname || window.location.pathname || '/';
    const safeSearch = currentSearch ?? window.location.search;
    const safeHash = currentHash || window.location.hash || '';
    const nextUrl = buildProductModalUrl(safePathname, safeSearch, nextShareCode, safeHash);

    window.history.replaceState(window.history.state, '', nextUrl);
    return nextUrl;
}

function AdminPricingMetric({ englishLabel, arabicLabel, value, valueClassName = '' }) {
    return (
        <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
            <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-white/45">{englishLabel}</span>
            <span className="mt-1 block text-[11px] font-bold text-white/65">{arabicLabel}</span>
            <span className={`mt-3 block text-lg font-black md:text-xl ${valueClassName}`}>{value}</span>
        </div>
    );
}

function CompactAdminPricingMetric({ englishLabel, arabicLabel, value, valueClassName = '', showDivider = false }) {
    return (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">{englishLabel}</p>
                <p className="mt-1 text-[10px] font-bold text-white/65">{arabicLabel}</p>
                <p className={`mt-2.5 text-[0.95rem] font-black leading-none lg:text-[1rem] ${valueClassName}`}>{value}</p>
            </div>
            {showDivider ? <span className="h-9 w-px bg-white/14"></span> : null}
        </div>
    );
}

function AdminPricingCard({ netPriceValue, discountValue, retailPriceValue, wholesalePriceValue }) {
    return (
        <div className="mt-4 overflow-hidden rounded-[1.7rem] border border-slate-200/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-3 text-white shadow-[0_20px_60px_rgba(15,23,42,0.24)] dark:border-white/10">
            <div className="md:hidden">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.26em] text-brandGold">Admin Pricing</p>
                        <p className="mt-1 text-[11px] font-medium text-white/55">ملخص سريع للأسعار والخصم</p>
                    </div>
                    <span className="rounded-full border border-brandGold/25 bg-brandGold/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brandGold">DC Feed</span>
                </div>

                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <AdminPricingMetric
                        englishLabel="Pack. Price"
                        arabicLabel="سعر العبوة"
                        value={formatPriceLabel(netPriceValue)}
                        valueClassName="text-emerald-400"
                    />
                    <AdminPricingMetric
                        englishLabel="Discount"
                        arabicLabel="الخصم"
                        value={discountValue.toFixed(2)}
                        valueClassName="text-rose-400"
                    />
                    <AdminPricingMetric
                        englishLabel="Retail"
                        arabicLabel="العبوة"
                        value={formatPriceLabel(retailPriceValue)}
                        valueClassName="text-white/80"
                    />
                    <AdminPricingMetric
                        englishLabel="Wholesale"
                        arabicLabel="الكرتونة"
                        value={wholesalePriceValue > 0 ? formatPriceLabel(wholesalePriceValue) : 'غير متاح'}
                        valueClassName="text-brandGold"
                    />
                </div>
            </div>

            <div className="hidden md:block">
                <div className="mb-4 flex items-start justify-between gap-4 px-1">
                    <span className="rounded-full border border-brandGold/25 bg-brandGold/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brandGold">DC Feed</span>
                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-[0.26em] text-brandGold">Admin Pricing</p>
                        <p className="mt-1 text-[11px] font-medium text-white/55">ملخص سريع للأسعار والخصم</p>
                    </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:px-5">
                    <div className="flex flex-row-reverse items-start gap-3 lg:gap-4">
                        <CompactAdminPricingMetric
                            englishLabel="Whole."
                            arabicLabel="الكرتونة"
                            value={wholesalePriceValue > 0 ? formatPriceLabel(wholesalePriceValue) : 'غير متاح'}
                            valueClassName="text-brandGold"
                            showDivider
                        />
                        <CompactAdminPricingMetric
                            englishLabel="Retail"
                            arabicLabel="العبوة"
                            value={formatPriceLabel(retailPriceValue)}
                            valueClassName="text-white/80"
                            showDivider
                        />
                        <CompactAdminPricingMetric
                            englishLabel="Disc."
                            arabicLabel="الخصم"
                            value={discountValue.toFixed(2)}
                            valueClassName="text-rose-400"
                            showDivider
                        />
                        <CompactAdminPricingMetric
                            englishLabel="Pack"
                            arabicLabel="سعر العبوة"
                            value={formatPriceLabel(netPriceValue)}
                            valueClassName="text-emerald-400"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function ProductDetailCard({ iconClassName, iconWrapperClassName, label, value, valueClassName = '', caption, badge }) {
    return (
        <div className="rounded-[1.6rem] border border-slate-200/70 bg-white/90 p-4 shadow-[0_18px_50px_rgba(148,163,184,0.12)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.04] dark:shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
            <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg shadow-sm ${iconWrapperClassName}`}>
                    <i className={iconClassName}></i>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/45">{label}</p>
                    {badge ? <div className="mt-2">{badge}</div> : null}
                    <p className={`mt-2 text-2xl font-black leading-none text-slate-900 dark:text-white ${valueClassName}`}>{value}</p>
                    {caption ? <p className="mt-2 text-xs font-medium text-slate-500 dark:text-white/55">{caption}</p> : null}
                </div>
            </div>
        </div>
    );
}

function ProductOrderDecisionSheet({ summary, onDismiss, onContinueShopping, onCompleteOrder }) {
    if (!summary) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[180]" dir="rtl">
            <button
                type="button"
                aria-label="Close order review"
                className="absolute inset-0 bg-black/55 backdrop-blur-[3px] animate-[order-sheet-backdrop_180ms_ease-out]"
                onClick={onDismiss}
            ></button>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
                <div className="pointer-events-auto order-sheet-scroll max-h-[68vh] w-full max-w-lg overflow-y-auto rounded-[2rem] border border-brandGold/20 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.34)] animate-[order-sheet-rise_260ms_cubic-bezier(0.22,1,0.36,1)] dark:bg-[#11192c] sm:max-h-[74vh] sm:max-w-xl" onClick={(event) => event.stopPropagation()}>
                    <div className="sticky top-0 z-10 flex justify-center border-b border-slate-200/80 bg-slate-50/94 px-5 pb-3 pt-3 backdrop-blur dark:border-white/10 dark:bg-[#11192c]/94">
                        <div className="flex flex-col items-center gap-2">
                            <span className="h-1.5 w-20 rounded-full bg-slate-300 dark:bg-white/15"></span>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-brandGold/15 bg-brandGold/8 text-brandGold">
                                <i className="fa-solid fa-chevron-up text-[11px]"></i>
                            </span>
                        </div>
                    </div>

                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/90 px-5 py-5 dark:border-white/10 dark:bg-white/[0.04]">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brandGold">Order Review</p>
                        <h3 className="mt-2 text-2xl font-black text-brandBlue dark:text-white">
                            {summary.wasExisting ? 'Quantity Updated' : 'Pack Added'}
                        </h3>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-300" dir="rtl">
                            {summary.wasExisting ? 'تم تحديث الكمية داخل طلبك الحالي.' : 'تمت إضافة العبوة إلى طلبك بنجاح.'}
                        </p>
                    </div>
                    <button type="button" onClick={onDismiss} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:text-red-500 dark:border-white/10 dark:bg-white/10 dark:text-white">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                    <div className="space-y-4 px-5 py-5">
                    <div className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1rem] border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-[#0d1426] sm:h-20 sm:w-20 sm:rounded-[1.2rem]">
                            <img src={summary.image} alt={summary.title} className="h-full w-full object-contain" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brandGold">Selected Pack</p>
                            <p className="mt-2 text-sm font-black leading-snug text-brandBlue dark:text-white sm:text-base">{summary.title}</p>
                            <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-300" dir="rtl">
                                إجمالي الكمية لهذا المنتج داخل العربة: {summary.nextQuantity}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/70 px-3 py-4 text-center dark:border-white/10 dark:bg-white/[0.04]">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Added</p>
                            <p className="mt-2 text-lg font-black text-emerald-600 dark:text-emerald-300">{summary.addedQuantity}</p>
                        </div>
                        <div className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/70 px-3 py-4 text-center dark:border-white/10 dark:bg-white/[0.04]">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pack Price</p>
                            <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">{formatPriceLabel(summary.unitPrice)}</p>
                        </div>
                        <div className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/70 px-3 py-4 text-center dark:border-white/10 dark:bg-white/[0.04]">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Cart Items</p>
                            <p className="mt-2 text-lg font-black text-brandGold">{summary.nextCartCount}</p>
                        </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-brandGold/20 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.14),transparent_46%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] px-4 py-4 dark:bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_42%),linear-gradient(180deg,rgba(17,25,44,0.98),rgba(9,13,24,0.98))]">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Added Total</p>
                                <p className="mt-2 text-xl font-black text-emerald-600 dark:text-emerald-300">{formatPriceLabel(summary.addedSubtotal)}</p>
                            </div>
                            <div className="text-left">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Cart Total</p>
                                <p className="mt-2 text-xl font-black text-brandBlue dark:text-white">{formatPriceLabel(summary.nextCartSubtotal)}</p>
                            </div>
                        </div>
                    </div>

                    <p className="text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-300" dir="rtl">
                        تقدر تكمل التسوق دلوقتي أو تفتح العربة علشان تراجع الطلب وتتممه.
                    </p>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <button type="button" onClick={onContinueShopping} className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-colors hover:border-brandGold hover:text-brandGold dark:border-white/10 dark:bg-white/[0.04] dark:text-white">
                            Continue Shopping | كمل تسوق
                            </button>
                            <button type="button" onClick={onCompleteOrder} className="rounded-[1.2rem] border border-brandGold bg-brandGold px-4 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-[#e0bc46]">
                            Complete Order | اتمام الطلب
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ProductModal() {
    const { selectedProduct, setSelectedProduct, addToCart, addToWholesaleCart, isWholesaleCustomer, userRole, dcLiveUpdateAt, dcSyncedAt, refreshDcCatalog, allProducts, getProductStockLimit, getProductStockStatus, cartItems, cartCount, cartSubtotal, openCart } = useGallery();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const lastSyncedShareCodeRef = useRef('');
    const dismissedShareCodeRef = useRef('');
    const requestedShareCode = String(searchParams?.get('code') || '').trim();
    const selectedProductShareCode = getProductShareCode(selectedProduct);

    useEffect(() => {
        if (selectedProduct) {
            document.body.style.overflow = 'hidden';
            
            // Record view count tracking asynchronously
            if (selectedProduct.id) {
                // Ensure we only record once per selected product per session
                const viewKey = `viewed_${selectedProduct.id}`;
                if (!sessionStorage.getItem(viewKey)) {
                    sessionStorage.setItem(viewKey, '1');
                    fetch('/api/product-view', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ productId: selectedProduct.id })
                    }).catch((error) => console.error('Failed to register product view:', error));
                }
            }
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [selectedProduct]);

    useEffect(() => {
        if (!requestedShareCode || selectedProduct) {
            return;
        }

        if (normalizeShareCode(requestedShareCode) === normalizeShareCode(dismissedShareCodeRef.current)) {
            return;
        }

        const matchedProduct = findProductByShareCode(allProducts, requestedShareCode);
        if (matchedProduct) {
            setSelectedProduct(matchedProduct);
        }
    }, [allProducts, requestedShareCode, selectedProduct, setSelectedProduct]);

    useEffect(() => {
        if (!selectedProduct || !selectedProductShareCode) {
            return;
        }

        lastSyncedShareCodeRef.current = selectedProductShareCode;
        if (normalizeShareCode(requestedShareCode) === normalizeShareCode(selectedProductShareCode)) {
            return;
        }

        replaceProductModalUrl(pathname, searchParams?.toString(), selectedProductShareCode);
    }, [pathname, requestedShareCode, searchParams, selectedProduct, selectedProductShareCode]);

    useEffect(() => {
        if (!selectedProduct) {
            return;
        }

        if (Date.now() - Number(dcSyncedAt || 0) <= 15000) {
            return;
        }

        refreshDcCatalog({ forceRefresh: true });
    }, [dcSyncedAt, refreshDcCatalog, selectedProduct]);

    useEffect(() => {
        if (!requestedShareCode && dismissedShareCodeRef.current) {
            dismissedShareCodeRef.current = '';
        }

        if (selectedProduct) {
            return;
        }

        const lastSyncedShareCode = lastSyncedShareCodeRef.current;
        if (!lastSyncedShareCode) {
            return;
        }

        if (normalizeShareCode(requestedShareCode) !== normalizeShareCode(lastSyncedShareCode)) {
            lastSyncedShareCodeRef.current = '';
            dismissedShareCodeRef.current = '';
            return;
        }

        lastSyncedShareCodeRef.current = '';
        replaceProductModalUrl(pathname, searchParams?.toString(), '');
    }, [pathname, requestedShareCode, searchParams, selectedProduct]);

    if (!selectedProduct) return null;

    const closeModal = () => {
        dismissedShareCodeRef.current = requestedShareCode || selectedProductShareCode || lastSyncedShareCodeRef.current;
        lastSyncedShareCodeRef.current = '';
        replaceProductModalUrl(pathname, searchParams?.toString(), '');
        setSelectedProduct(null);
    };

    return (
        <ProductModalContent
            key={selectedProduct.id || selectedProduct.code || selectedProduct.name}
            selectedProduct={selectedProduct}
            closeModal={closeModal}
            addToCart={addToCart}
            addToWholesaleCart={addToWholesaleCart}
            isWholesaleCustomer={isWholesaleCustomer}
            userRole={userRole}
            dcLiveUpdateAt={dcLiveUpdateAt}
            dcSyncedAt={dcSyncedAt}
            getProductStockLimit={getProductStockLimit}
            getProductStockStatus={getProductStockStatus}
            cartItems={cartItems}
            cartCount={cartCount}
            cartSubtotal={cartSubtotal}
            openCart={openCart}
        />
    );
}

function ProductModalContent({ selectedProduct, closeModal, addToCart, addToWholesaleCart, isWholesaleCustomer, userRole, dcLiveUpdateAt, dcSyncedAt, getProductStockLimit, getProductStockStatus, cartItems, cartCount, cartSubtotal, openCart }) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [wholesaleQuantity, setWholesaleQuantity] = useState(1);
    const { siteSettings } = useSiteSettings();
    const [showLiveIndicator, setShowLiveIndicator] = useState(false);
    const [lightboxState, setLightboxState] = useState({ isOpen: false, images: [], index: 0, title: '' });
    const [retailOrderSheet, setRetailOrderSheet] = useState(null);

    useEffect(() => {
        if (userRole !== 'admin' || !dcLiveUpdateAt) {
            setShowLiveIndicator(false);
            return undefined;
        }

        setShowLiveIndicator(true);
        const timeoutId = window.setTimeout(() => {
            setShowLiveIndicator(false);
        }, LIVE_INDICATOR_DURATION_MS);

        return () => window.clearTimeout(timeoutId);
    }, [userRole, dcLiveUpdateAt, dcSyncedAt]);

    useEffect(() => {
        if (!lightboxState.isOpen) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setLightboxState((currentValue) => ({ ...currentValue, isOpen: false }));
                return;
            }

            if (event.key === 'ArrowLeft') {
                setLightboxState((currentValue) => {
                    const count = currentValue.images.length;
                    if (count <= 1) return currentValue;
                    return {
                        ...currentValue,
                        index: (currentValue.index - 1 + count) % count
                    };
                });
                return;
            }

            if (event.key === 'ArrowRight') {
                setLightboxState((currentValue) => {
                    const count = currentValue.images.length;
                    if (count <= 1) return currentValue;
                    return {
                        ...currentValue,
                        index: (currentValue.index + 1) % count
                    };
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxState.isOpen]);
    
    const fallbackDesc = selectedProduct.desc || selectedProduct.description || '';
    const productDisplayName = selectedProduct.title || selectedProduct.name || '';

    const splitBilingualLabel = (value) => {
        const normalizedValue = String(value || '').trim();
        if (!normalizedValue.includes('|')) {
            return { english: normalizedValue, arabic: '' };
        }

        const parts = normalizedValue.split('|').map((part) => part.trim()).filter(Boolean);
        const arabicPart = parts.find((part) => /[\u0600-\u06FF]/.test(part)) || '';
        const englishPart = parts.find((part) => /[A-Za-z]/.test(part)) || parts[0] || '';

        return { english: englishPart, arabic: arabicPart };
    };

    const productNameParts = splitBilingualLabel(productDisplayName);

    const images = (() => {
        if (selectedProduct.url) {
            return [{ url: selectedProduct.url, type: 'image' }];
        }

        if (Array.isArray(selectedProduct.media) && selectedProduct.media.length > 0) {
            return selectedProduct.media;
        }

        if (Array.isArray(selectedProduct.images) && selectedProduct.images.length > 0) {
            return selectedProduct.images.map((entry) => ({
                url: entry.url || entry.primaryUrl || entry,
                type: entry.type || 'image'
            }));
        }

        return [];
    })();

    const hasImages = images.length > 0;
    const safeImageIndex = hasImages ? Math.min(currentImageIndex, images.length - 1) : 0;
    const currentMedia = hasImages ? images[safeImageIndex] : null;
    const metadata = [selectedProduct.category, selectedProduct.brand, selectedProduct.origin].filter(Boolean);
    const productCode = selectedProduct.code || selectedProduct.barcode || selectedProduct.sku || '';
    const enquiryText = `مرحباً، أستفسر عن المنتج: ${selectedProduct.title || selectedProduct.name}`;
    const wholesalePrice = Number(
        selectedProduct.wholesalePrice
        || selectedProduct.wholesale_price
        || selectedProduct.cartonPrice
        || selectedProduct.wholesaleCartonPrice
        || selectedProduct.priceWholesale
        || selectedProduct.bulkPrice
        || selectedProduct.bulk_price
        || 0
    );
    const canViewAdminPricing = isAdminRole(userRole);
    const isStrictWholesaleUser = normalizeUserRole(userRole) === USER_ROLE_VALUES.CST_WHOLESALE;
    const displayOrderType = isStrictWholesaleUser ? 'wholesale' : 'retail';

    const increaseQuantity = () => {
        setQuantity((currentValue) => {
            const nextValue = currentValue + 1;
            if (retailStockLimit === null) return nextValue;
            return Math.min(nextValue, retailStockLimit);
        });
    };

    const decreaseQuantity = () => {
        setQuantity((currentValue) => Math.max(1, currentValue - 1));
    };

    const increaseWholesaleQuantity = () => {
        setWholesaleQuantity((currentValue) => clampQuantityValue(currentValue + 1, wholesaleStockLimit));
    };

    const decreaseWholesaleQuantity = () => {
        setWholesaleQuantity((currentValue) => Math.max(1, currentValue - 1));
    };

    const handleWholesaleQuantityInputChange = (event) => {
        const rawValue = String(event.target.value || '').replace(/\D/g, '');
        setWholesaleQuantity(clampQuantityValue(rawValue === '' ? 1 : rawValue, wholesaleStockLimit));
    };

    const handleQuantityInputChange = (event) => {
        const rawValue = String(event.target.value || '').replace(/\D/g, '');
        setQuantity(clampQuantityValue(rawValue === '' ? 1 : rawValue, retailStockLimit));
    };

    const dismissRetailOrderSheet = () => {
        setRetailOrderSheet(null);
    };

    const handleContinueShopping = () => {
        setRetailOrderSheet(null);
        closeModal();
    };

    const handleCompleteRetailOrder = () => {
        setRetailOrderSheet(null);
        closeModal();

        if (typeof window !== 'undefined') {
            window.requestAnimationFrame(() => {
                openCart();
            });
            return;
        }

        openCart();
    };

    const handleRetailAddWithConfirmation = (product, requestedQuantity, options = {}) => {
        if (!product) {
            return;
        }

        const resolvedTitle = resolveModalProductTitle(product, options.title);
        const cartId = String(product.id || product.code || resolvedTitle).trim();
        const existingItem = cartItems.find((item) => item.cartId === cartId) || null;
        const existingQuantity = Number(existingItem?.quantity || 0);
        const existingItemPrice = parsePrice(existingItem?.price);
        const stockLimitValue = getProductStockLimit(product, 'retail');
        const normalizedQuantity = Math.max(1, Number(requestedQuantity) || 1);
        const requestedTotalQuantity = existingQuantity + normalizedQuantity;
        const nextQuantity = stockLimitValue === null ? requestedTotalQuantity : Math.min(requestedTotalQuantity, stockLimitValue);
        const actualAddedQuantity = Math.max(0, nextQuantity - existingQuantity);
        const safeUnitPrice = parsePrice(options.unitPrice ?? existingItemPrice);
        const nextCartCount = cartCount + actualAddedQuantity;
        const nextCartSubtotal = existingItem
            ? Math.max(0, cartSubtotal - (existingItemPrice * existingQuantity)) + (safeUnitPrice * nextQuantity)
            : cartSubtotal + (safeUnitPrice * nextQuantity);

        addToCart(product, normalizedQuantity);

        if (actualAddedQuantity <= 0) {
            return;
        }

        setRetailOrderSheet({
            title: resolvedTitle,
            image: resolveModalProductImage(product, options.image),
            addedQuantity: actualAddedQuantity,
            nextQuantity,
            unitPrice: safeUnitPrice,
            addedSubtotal: safeUnitPrice * actualAddedQuantity,
            nextCartCount,
            nextCartSubtotal,
            wasExisting: existingQuantity > 0
        });
    };

    const handleAddToCart = () => {
        handleRetailAddWithConfirmation(selectedProduct, quantity, {
            unitPrice: primaryDisplayPrice,
            image: currentMedia?.url || currentMedia,
            title: selectedProduct.title || selectedProduct.name
        });
    };

    const handleAddToWholesaleCart = () => {
        addToWholesaleCart(selectedProduct, wholesaleQuantity);
    };

    const hasVariants = Array.isArray(selectedProduct.variants) && selectedProduct.variants.length > 0;
    const [activeVariantIndex, setActiveVariantIndex] = useState(0);
    const [subImageIndex, setSubImageIndex] = useState(0);

    const getVariantAllImages = (variant) => {
        let imgs = [];
        if (Array.isArray(variant?.images) && variant.images.length > 0) {
            imgs = variant.images.map(img => img?.url || img?.primaryUrl || img);
        } else if (Array.isArray(variant?.media) && variant.media.length > 0) {
            imgs = variant.media.map(m => m?.url || m?.primaryUrl || m);
        } else if (variant?.image) {
            imgs = [variant.image];
        }
        
        if (imgs.length === 0) {
            imgs = images.map(img => img.url || img);
        }
        return imgs.filter(Boolean);
    };

    const handleActiveVariantChange = (idx) => {
        setActiveVariantIndex(idx);
        setSubImageIndex(0);
    };

    const hasMultipleVariants = hasVariants && selectedProduct.variants.length > 1;

    const stepActiveVariant = (direction) => {
        if (!hasMultipleVariants) return;

        setActiveVariantIndex((currentIndex) => {
            const variantCount = selectedProduct.variants.length;
            return (currentIndex + direction + variantCount) % variantCount;
        });
        setSubImageIndex(0);
    };

    const variantsAsTestimonials = hasVariants ? selectedProduct.variants.map((v, idx) => {
        const vImages = getVariantAllImages(v);
        const displayImage = idx === activeVariantIndex && vImages[subImageIndex] ? vImages[subImageIndex] : vImages[0];
        const variantRetailPrice = parsePrice(v?.price || v?.retailPrice || v?.retail_price || selectedProduct?.price);
        const variantDiscountValue = parsePrice(v?.discountAmount || v?.discount_amount || v?.discount || v?.discountValue || selectedProduct?.discountAmount || selectedProduct?.discount_amount || selectedProduct?.discount || selectedProduct?.discountValue);
        const variantExplicitNet = parsePrice(v?.netPrice || v?.net_price || v?.net);
        const variantNetPrice = variantExplicitNet > 0 ? variantExplicitNet : Math.max(0, variantRetailPrice - variantDiscountValue);
        const variantDisplayPrice = isStrictWholesaleUser ? variantNetPrice : variantRetailPrice;
        
        return {
            src: displayImage,
            name: v.name || v.label || selectedProduct.title || selectedProduct.name || `Variant ${idx + 1}`,
            designation: variantDisplayPrice > 0 ? `${variantDisplayPrice} ج.م` : (v.code || 'House of Glass'),
            quote: fallbackDesc || v.desc || v.description || '',
            originalVariant: v
        };
    }) : [];

    const activeVariant = hasVariants ? selectedProduct.variants[activeVariantIndex] : null;
    const activeVariantImages = hasVariants ? getVariantAllImages(activeVariant) : [];
    const safeSubImageIndex = activeVariantImages.length > 0 ? Math.min(subImageIndex, activeVariantImages.length - 1) : 0;
    const activeVariantDisplayName = activeVariant?.name || activeVariant?.label || `موديل ${activeVariantIndex + 1}`;
    const activeVariantCode = String(activeVariant?.code || activeVariant?.barcode || '').trim();
    const activeVariantDescription = activeVariant?.desc || activeVariant?.description || fallbackDesc;
    const currentVariantImage = activeVariantImages[safeSubImageIndex] || '';
    const activePricingSource = hasVariants ? (activeVariant || selectedProduct) : selectedProduct;
    const retailPriceValue = parsePrice(
        activePricingSource?.price
        || activePricingSource?.retailPrice
        || activePricingSource?.retail_price
        || selectedProduct?.price
        || selectedProduct?.retailPrice
        || selectedProduct?.retail_price
    );
    const wholesalePriceValue = parsePrice(
        activePricingSource?.wholesalePrice
        || activePricingSource?.wholesale_price
        || activePricingSource?.cartonPrice
        || activePricingSource?.wholesaleCartonPrice
        || activePricingSource?.priceWholesale
        || activePricingSource?.bulkPrice
        || activePricingSource?.bulk_price
    );
    const discountValue = parsePrice(
        activePricingSource?.discountAmount
        || activePricingSource?.discount_amount
        || activePricingSource?.discount
        || activePricingSource?.discountValue
        || selectedProduct?.discountAmount
        || selectedProduct?.discount_amount
        || selectedProduct?.discount
        || selectedProduct?.discountValue
    );
    const explicitNetPrice = parsePrice(
        activePricingSource?.netPrice
        || activePricingSource?.net_price
        || activePricingSource?.net
    );
    const netPriceValue = explicitNetPrice > 0 ? explicitNetPrice : Math.max(0, retailPriceValue - discountValue);
    const primaryDisplayPrice = isStrictWholesaleUser ? netPriceValue : retailPriceValue;
    const canShowWholesaleOrder = isWholesaleCustomer && wholesalePriceValue > 0;

    const resolveStockLimit = (entry, orderType = 'retail') => getProductStockLimit(entry || {}, orderType);
    const resolveStockStatus = (entry, orderType = 'retail') => getProductStockStatus(entry || {}, orderType);

    const retailStockLimit = hasVariants ? resolveStockLimit(activeVariant, 'retail') : resolveStockLimit(selectedProduct, 'retail');
    const wholesaleStockLimit = hasVariants ? resolveStockLimit(activeVariant, 'wholesale') : resolveStockLimit(selectedProduct, 'wholesale');
    const retailStockStatus = hasVariants ? resolveStockStatus(activeVariant, 'retail') : resolveStockStatus(selectedProduct, 'retail');
    const wholesaleStockStatus = hasVariants ? resolveStockStatus(activeVariant, 'wholesale') : resolveStockStatus(selectedProduct, 'wholesale');
    const stockLimit = displayOrderType === 'wholesale' ? wholesaleStockLimit : retailStockLimit;
    const normalizedStockStatus = displayOrderType === 'wholesale' ? wholesaleStockStatus : retailStockStatus;
    const retailOutOfStock = retailStockStatus === 'out_of_stock' || retailStockLimit === 0;
    const wholesaleOutOfStock = wholesaleStockStatus === 'out_of_stock' || wholesaleStockLimit === 0;
    const isOutOfStock = normalizedStockStatus === 'out_of_stock' || stockLimit === 0;
    const showStockLimitMessage = stockLimit !== null && quantity >= stockLimit;
    const stockLabel = isOutOfStock
        ? 'نفدت الكمية'
        : normalizedStockStatus === 'low_stock'
            ? (stockLimit !== null ? `كمية محدودة (${stockLimit})` : 'كمية محدودة')
            : 'متوفر';
    const stockCaption = isOutOfStock
        ? 'سيتم التحديث بمجرد توفر شحنة جديدة.'
        : stockLimit !== null
            ? `الحد الأقصى المتاح حالياً: ${stockLimit}`
            : 'جاهز للطلب الآن.';
    const stockCardTone = isOutOfStock
        ? 'bg-rose-500 text-white'
        : normalizedStockStatus === 'low_stock'
            ? 'bg-amber-400 text-slate-950'
            : 'bg-emerald-500 text-white';
    const stockIcon = isOutOfStock
        ? 'fa-solid fa-xmark'
        : normalizedStockStatus === 'low_stock'
            ? 'fa-solid fa-exclamation'
            : 'fa-solid fa-check';

    useEffect(() => {
        if (retailStockLimit !== null) {
            setQuantity((currentValue) => Math.min(Math.max(1, currentValue), retailStockLimit || 1));
        }

        if (wholesaleStockLimit !== null) {
            setWholesaleQuantity((currentValue) => Math.min(Math.max(1, currentValue), wholesaleStockLimit || 1));
        }
    }, [retailStockLimit, wholesaleStockLimit]);

    const closeLightbox = () => {
        setLightboxState((currentValue) => ({ ...currentValue, isOpen: false }));
    };

    const stepLightbox = (direction) => {
        setLightboxState((currentValue) => {
            const count = currentValue.images.length;
            if (count <= 1) return currentValue;

            return {
                ...currentValue,
                index: (currentValue.index + direction + count) % count
            };
        });
    };

    const openLightbox = (imageEntries, startIndex = 0, title = '') => {
        const normalizedImages = (imageEntries || [])
            .map((entry) => {
                if (!entry) return '';
                if (typeof entry === 'string') return entry;
                return entry.url || entry.primaryUrl || '';
            })
            .filter(Boolean);

        if (normalizedImages.length === 0) return;

        const safeIndex = Math.max(0, Math.min(startIndex, normalizedImages.length - 1));
        setLightboxState({
            isOpen: true,
            images: normalizedImages,
            index: safeIndex,
            title
        });
    };

    const renderVariantGallerySection = () => {
        if (activeVariantImages.length <= 1) return null;

        return (
            <div className="rounded-[1.7rem] border border-slate-200/70 bg-white/88 p-4 shadow-[0_20px_50px_rgba(148,163,184,0.1)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.04] md:p-5">
                <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/45">Gallery | صور الموديل</p>
                <div className="flex gap-3 overflow-x-auto hide-scroll pb-1">
                    {activeVariantImages.map((imgUrl, i) => (
                        <button
                            key={i}
                            onClick={() => setSubImageIndex(i)}
                            className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border-2 transition-all shadow-md ${
                                subImageIndex === i
                                    ? 'border-brandGold opacity-100 ring-2 ring-brandGold/30 ring-offset-2 dark:ring-offset-[#121926]'
                                    : 'border-transparent opacity-50 hover:opacity-100 grayscale-[30%] hover:grayscale-0'
                            }`}
                        >
                            <img src={imgUrl} alt={`صورة فرعية ${i + 1}`} className="h-full w-full object-cover" />
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    const renderWholesaleOrderCard = ({ priceValue, isOutOfStockValue, description, stockLimitValue, onAdd }) => {
        const showWholesaleStockLimitMessage = stockLimitValue !== null && wholesaleQuantity >= stockLimitValue;

        return (
            <div className="rounded-[1.4rem] border border-brandGold/25 bg-brandGold/5 p-4 dark:bg-brandGold/10">
                <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Wholesale Cart | طلب جملة</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
                    </div>
                    {priceValue > 0 ? (
                        <div className="text-left">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Wholesale</p>
                            <p className="text-lg font-black text-brandGold">{priceValue.toLocaleString()} ج.م</p>
                        </div>
                    ) : null}
                </div>

                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                    <div className="flex items-center overflow-hidden rounded-xl border-2 border-brandGold/20 bg-white dark:bg-gray-900">
                        <button
                            type="button"
                            onClick={decreaseWholesaleQuantity}
                            className="flex h-12 w-10 items-center justify-center text-lg font-black text-brandGold transition-colors hover:bg-brandGold/10 dark:hover:bg-brandGold/10"
                        >
                            -
                        </button>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={wholesaleQuantity}
                            onChange={handleWholesaleQuantityInputChange}
                            className="min-w-12 flex-1 border-x border-brandGold/15 bg-transparent px-3 py-0 text-center text-sm font-black text-brandBlue outline-none dark:text-white"
                            aria-label="Wholesale quantity"
                        />
                        <button
                            type="button"
                            onClick={increaseWholesaleQuantity}
                            className="flex h-12 w-10 items-center justify-center text-lg font-black text-brandGold transition-colors hover:bg-brandGold/10 dark:hover:bg-brandGold/10"
                        >
                            +
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={onAdd}
                        disabled={isOutOfStockValue}
                        className="flex-1 rounded-xl border-2 border-brandGold/30 bg-brandGold/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-brandGold transition-all hover:bg-brandGold hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isOutOfStockValue ? 'غير متوفر حالياً' : 'ADD CARTON | اضف كرتونة'}
                    </button>
                </div>

                {showWholesaleStockLimitMessage ? (
                    <p className="mt-2 text-[11px] font-bold text-amber-600 dark:text-amber-300">وصلت للكمية المتاحة في المخزن: {stockLimitValue}</p>
                ) : null}
                {stockLimitValue !== null ? (
                    <p className="mt-2 text-[10px] font-bold text-gray-400">الحد الأقصى المتاح حالياً: {stockLimitValue}</p>
                ) : null}
            </div>
        );
    };

    const renderVariantsExtra = (activeIndex, setActiveIndex) => {
        const variant = selectedProduct.variants[activeIndex];
        const variantRetailPrice = parsePrice(
            variant?.price
            || variant?.retailPrice
            || variant?.retail_price
            || selectedProduct?.price
            || selectedProduct?.retailPrice
            || selectedProduct?.retail_price
        );
        const variantWholesalePrice = parsePrice(
            variant?.wholesalePrice
            || variant?.wholesale_price
            || variant?.cartonPrice
            || variant?.wholesaleCartonPrice
            || variant?.priceWholesale
            || variant?.bulkPrice
            || variant?.bulk_price
            || selectedProduct?.wholesalePrice
            || selectedProduct?.wholesale_price
        );
        const variantDiscountValue = parsePrice(
            variant?.discountAmount
            || variant?.discount_amount
            || variant?.discount
            || variant?.discountValue
            || selectedProduct?.discountAmount
            || selectedProduct?.discount_amount
            || selectedProduct?.discount
            || selectedProduct?.discountValue
        );
        const variantExplicitNetPrice = parsePrice(variant?.netPrice || variant?.net_price || variant?.net);
        const variantNetPrice = variantExplicitNetPrice > 0 ? variantExplicitNetPrice : Math.max(0, variantRetailPrice - variantDiscountValue);
        const vPrice = isStrictWholesaleUser ? variantNetPrice : variantRetailPrice;
        const getVariantAvailability = (candidateVariant) => {
            const candidateStatus = resolveStockStatus(candidateVariant, displayOrderType);
            const candidateStockLimit = resolveStockLimit(candidateVariant, displayOrderType);

            if (candidateStatus === 'out_of_stock') return 'out';
            if (candidateStockLimit === 0) return 'out';
            return 'available';
        };
        const variantRetailStockLimit = resolveStockLimit(variant, 'retail');
        const variantWholesaleStockLimit = resolveStockLimit(variant, 'wholesale');
        const variantRetailStockStatus = resolveStockStatus(variant, 'retail');
        const variantWholesaleStockStatus = resolveStockStatus(variant, 'wholesale');
        const variantStockLimit = displayOrderType === 'wholesale' ? variantWholesaleStockLimit : variantRetailStockLimit;
        const variantNormalizedStockStatus = displayOrderType === 'wholesale' ? variantWholesaleStockStatus : variantRetailStockStatus;
        const variantRetailOutOfStock = variantRetailStockStatus === 'out_of_stock' || variantRetailStockLimit === 0;
        const variantWholesaleOutOfStock = variantWholesaleStockStatus === 'out_of_stock' || variantWholesaleStockLimit === 0;
        const variantOutOfStock = variantNormalizedStockStatus === 'out_of_stock' || variantStockLimit === 0;
        const variantStockLabel = variantOutOfStock
            ? 'نفدت الكمية'
            : variantNormalizedStockStatus === 'low_stock'
                ? (variantStockLimit !== null ? `كمية محدودة (${variantStockLimit})` : 'كمية محدودة')
                : 'متوفر';
        const variantStockCaption = variantOutOfStock
            ? 'هذا الموديل غير متاح حالياً.'
            : variantStockLimit !== null
                ? `الحد الأقصى المتاح حالياً: ${variantStockLimit}`
                : 'جاهز للطلب الآن.';
        const variantStockCardTone = variantOutOfStock
            ? 'bg-rose-500 text-white'
            : variantNormalizedStockStatus === 'low_stock'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-emerald-500 text-white';
        const variantStockIcon = variantOutOfStock
            ? 'fa-solid fa-xmark'
            : variantNormalizedStockStatus === 'low_stock'
                ? 'fa-solid fa-exclamation'
                : 'fa-solid fa-check';
        const variantShowStockLimitMessage = variantRetailStockLimit !== null && quantity >= variantRetailStockLimit;

        return (
            <div className="mt-2 space-y-5 md:mt-4 md:space-y-6">
                <div className="rounded-[1.7rem] border border-slate-200/70 bg-white/88 p-4 shadow-[0_20px_50px_rgba(148,163,184,0.12)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.04] md:p-5">
                   <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/45">Choose Variant | اختر الشكل</p>
                   <div className="flex flex-wrap gap-2">
                       {selectedProduct.variants.map((v, idx) => {
                           const availability = getVariantAvailability(v);
                           return (
                               <button
                                   key={idx}
                                   onClick={() => setActiveIndex(idx)}
                                   className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border-2 ${
                                       activeIndex === idx
                                           ? 'bg-brandGold text-brandBlue border-brandGold shadow-lg shadow-brandGold/25 scale-105'
                                           : 'bg-white/5 dark:bg-neutral-800/50 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-neutral-700 hover:border-brandGold/50'
                                   }`}
                               >
                                   <span className={`h-2.5 w-2.5 rounded-full ${availability === 'available' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.55)]'}`}></span>
                                   <span>{v.name || v.label || `موديل ${idx + 1}`}</span>
                               </button>
                           );
                       })}
                   </div>
                </div>

                <div className="hidden md:block">
                    {renderVariantGallerySection()}
                </div>
                
                <div className="space-y-4 pt-1">
                    {canViewAdminPricing ? (
                        <AdminPricingCard
                            netPriceValue={variantNetPrice}
                            discountValue={variantDiscountValue}
                            retailPriceValue={variantRetailPrice}
                            wholesalePriceValue={variantWholesalePrice}
                        />
                    ) : null}

                    <ProductDetailCard
                        iconClassName="fa-solid fa-coins"
                        iconWrapperClassName="bg-brandGold/15 text-brandGold dark:bg-brandGold/18"
                        label="Price | السعر"
                        value={vPrice > 0 ? `${vPrice.toLocaleString()} ج.م` : 'تواصل معنا لمعرفة السعر'}
                        valueClassName={vPrice > 0 ? 'text-brandBlue dark:text-white' : 'text-slate-500 dark:text-white/65'}
                        caption={isStrictWholesaleUser
                            ? (variantWholesalePrice > 0 ? `Wholesale: ${variantWholesalePrice.toLocaleString()} ج.م` : 'Wholesale: غير متاح')
                            : 'سعر البيع الحالي للعنصر المحدد.'}
                        badge={showLiveIndicator ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"></span>
                                DC Live Update
                            </span>
                        ) : null}
                    />

                    <ProductDetailCard
                        iconClassName={variantStockIcon}
                        iconWrapperClassName={variantStockCardTone}
                        label="Availability | حالة التوفر"
                        value={variantStockLabel}
                        valueClassName={variantOutOfStock ? 'text-rose-500 dark:text-rose-300' : variantNormalizedStockStatus === 'low_stock' ? 'text-amber-500 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}
                        caption={variantStockCaption}
                    />

                    {isWholesaleCustomer && variantWholesalePrice > 0 ? renderWholesaleOrderCard({
                        priceValue: variantWholesalePrice,
                        isOutOfStockValue: variantWholesaleOutOfStock,
                        description: 'أضف هذا الموديل إلى مسار الجملة بشكل منفصل.',
                        stockLimitValue: variantWholesaleStockLimit,
                        onAdd: () => addToWholesaleCart(variant, wholesaleQuantity)
                    }) : null}

                    <div className="rounded-[1.4rem] border border-green-500/20 bg-green-500/5 p-4 dark:bg-green-500/10">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-600 dark:text-green-300">Unit Order | عبوة / علبة</p>
                        <p className="mt-1 mb-3 text-xs text-gray-500 dark:text-gray-400">الكمية هنا محسوبة بالعبوة أو العلبة، وليس بالكرتونة.</p>
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                        <div className="flex items-center overflow-hidden rounded-xl border-2 border-green-500/20 bg-white dark:bg-neutral-900">
                            <button type="button" onClick={decreaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-green-600 transition-colors hover:bg-green-500/10 dark:text-green-300">
                                -
                            </button>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={quantity}
                                onChange={handleQuantityInputChange}
                                className="min-w-12 flex-1 border-x border-green-500/15 bg-transparent px-3 py-0 text-center text-sm font-black text-brandBlue outline-none md:hidden dark:text-white"
                                aria-label="Unit quantity"
                            />
                            <span className="hidden min-w-12 items-center justify-center border-x border-green-500/15 bg-slate-950/5 px-3 text-center text-base font-black text-slate-900 dark:bg-slate-950/40 dark:text-emerald-50 md:flex">{quantity}</span>
                            <button type="button" onClick={increaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-green-600 transition-colors hover:bg-green-500/10 dark:text-green-300">
                                +
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleRetailAddWithConfirmation(variant, quantity, {
                                unitPrice: vPrice,
                                image: getVariantAllImages(variant)[0],
                                title: variant.name || variant.label || selectedProduct.title || selectedProduct.name
                            })}
                            disabled={variantRetailOutOfStock}
                            className="flex-1 rounded-xl border-2 border-emerald-700 bg-emerald-700 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition-all hover:border-emerald-800 hover:bg-emerald-800 shadow-xl disabled:border-emerald-700/20 disabled:bg-emerald-700/20 disabled:text-emerald-50/80"
                        >
                            {variantRetailOutOfStock ? 'غير متوفر حالياً' : 'ADD PACK | اضف عبوة'}
                        </button>
                    </div>
                    {variantShowStockLimitMessage ? (
                        <p className="text-[11px] font-bold text-amber-600 dark:text-amber-300">
                            وصلت للكمية المتاحة حالياً: {variantRetailStockLimit}
                        </p>
                    ) : null}
                    </div>
                </div>
            </div>
        );
    };

    if (hasVariants) {
        return (
            <div key={selectedProduct.id || selectedProduct.code || selectedProduct.name} className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6" dir="rtl">
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                    onClick={closeModal}
                ></div>

                <div className="relative my-auto hidden w-full max-w-5xl flex-col rounded-[2rem] bg-white shadow-2xl transition-all dark:bg-darkCard md:flex md:max-h-[94vh] md:flex-row md:overflow-hidden md:rounded-3xl">
                    <button
                        onClick={closeModal}
                        className="absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/55 text-gray-800 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 dark:border-white/10 dark:bg-white/10 dark:text-white"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>

                    <div className="relative flex w-full flex-col border-b border-slate-200/70 bg-gradient-to-b from-slate-100 via-white to-slate-100 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 md:w-3/5 md:border-b-0 md:border-l">
                        <div className="relative flex h-[26rem] shrink-0 items-center justify-center overflow-hidden px-6 pb-24 pt-16 md:h-full md:min-h-[34rem] md:pb-6">
                            {activeVariantImages.length > 0 ? (
                                <div className="pointer-events-none absolute left-6 top-6 z-20 flex items-center gap-2">
                                    {hasMultipleVariants ? (
                                        <span className="rounded-full border border-white/60 bg-white/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-950/70 dark:text-white/75">
                                            {activeVariantIndex + 1} / {selectedProduct.variants.length}
                                        </span>
                                    ) : null}
                                    <span className="rounded-full border border-white/60 bg-white/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-950/70 dark:text-white/75">
                                        {safeSubImageIndex + 1} / {activeVariantImages.length}
                                    </span>
                                    {activeVariantCode ? (
                                        <span className="rounded-full border border-white/60 bg-white/65 px-3 py-1 text-[10px] font-bold text-slate-600 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-950/65 dark:text-white/55">
                                            {activeVariantCode}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}

                            {currentVariantImage ? (
                                <button
                                    type="button"
                                    onClick={() => openLightbox(activeVariantImages, safeSubImageIndex, activeVariantDisplayName)}
                                    className="relative z-10 flex h-full w-full items-center justify-center rounded-[1.9rem] border border-white/45 bg-white/80 p-3 shadow-[0_24px_80px_rgba(148,163,184,0.16)] backdrop-blur-sm focus:outline-none dark:border-white/10 dark:bg-white/[0.04]"
                                    aria-label="Open variant image fullscreen"
                                >
                                    <img
                                        src={currentVariantImage}
                                        alt={activeVariantDisplayName}
                                        className="h-full w-full rounded-[1.45rem] object-contain object-top cursor-zoom-in"
                                    />
                                </button>
                            ) : (
                                <div className="relative z-10 flex h-full w-full items-center justify-center rounded-[1.9rem] border border-dashed border-slate-300 bg-white/75 text-gray-400 dark:border-white/10 dark:bg-white/[0.04]">
                                    <i className="fa-regular fa-image text-6xl"></i>
                                </div>
                            )}

                            {hasMultipleVariants ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            stepActiveVariant(-1);
                                        }}
                                        className="detail-nav-arrow right-6"
                                        aria-label="Show previous variant"
                                    >
                                        <i className="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            stepActiveVariant(1);
                                        }}
                                        className="absolute left-6 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white shadow-xl transition-colors hover:bg-brandGold"
                                        aria-label="Show next variant"
                                    >
                                        <i className="fa-solid fa-chevron-left"></i>
                                    </button>
                                </>
                            ) : activeVariantImages.length > 1 ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setSubImageIndex((prev) => (prev > 0 ? prev - 1 : activeVariantImages.length - 1));
                                        }}
                                        className="detail-nav-arrow right-6"
                                        aria-label="Show previous variant image"
                                    >
                                        <i className="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setSubImageIndex((prev) => (prev < activeVariantImages.length - 1 ? prev + 1 : 0));
                                        }}
                                        className="absolute left-6 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white shadow-xl transition-colors hover:bg-brandGold"
                                        aria-label="Show next variant image"
                                    >
                                        <i className="fa-solid fa-chevron-left"></i>
                                    </button>
                                </>
                            ) : null}
                        </div>

                        {activeVariantImages.length > 1 ? (
                            <div className="bg-slate-100/80 p-3 dark:bg-slate-950/70">
                                <div className="flex gap-2 overflow-x-auto hide-scroll rounded-2xl border border-white/65 bg-white/80 p-2 shadow-[0_12px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/72 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
                                    {activeVariantImages.map((imgUrl, idx) => (
                                        <button
                                            type="button"
                                            key={idx}
                                            onClick={() => setSubImageIndex(idx)}
                                            aria-label={`View variant media ${idx + 1}`}
                                            className={`relative h-20 w-20 flex-none overflow-hidden rounded-[1rem] border-2 transition-all ${
                                                idx === safeSubImageIndex
                                                    ? 'border-brandGold opacity-100 shadow-[0_10px_25px_rgba(212,175,55,0.28)]'
                                                    : 'border-transparent opacity-65 hover:opacity-100'
                                            }`}
                                        >
                                            <img src={imgUrl} className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="custom-scrollbar flex w-full flex-col p-6 md:min-h-0 md:w-2/5 md:overflow-y-auto md:p-8">
                        <div className="mb-2">
                            {metadata.length > 0 ? (
                                <div className="mb-3 flex flex-wrap gap-2">
                                    {metadata.map((item, index) => (
                                        <span key={`${index}-${item}`} className="inline-block rounded-full bg-brandGold/10 px-3 py-1 text-[11px] font-bold text-brandGold">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                            <h2 className="text-[1.75rem] font-black leading-[1.05] tracking-tight text-brandBlue dark:text-slate-100 md:text-3xl">
                                {productNameParts.english ? <span dir="ltr">{productNameParts.english}</span> : null}
                                {productNameParts.english && productNameParts.arabic ? <span className="mx-2 text-brandGold">|</span> : null}
                                {productNameParts.arabic ? <span dir="rtl">{productNameParts.arabic}</span> : null}
                            </h2>
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500 dark:text-white/55">
                                {productCode ? (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                                        Code: {productCode}
                                    </span>
                                ) : null}
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                                    {selectedProduct.variants.length} موديل
                                </span>
                            </div>
                            <div className="mt-4 h-px bg-gradient-to-r from-brandGold via-brandGold/30 to-transparent"></div>
                        </div>

                        <div className="my-5 space-y-4">
                            <div className="rounded-[1.6rem] border border-slate-200/70 bg-white/90 p-4 shadow-[0_18px_50px_rgba(148,163,184,0.12)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.04] dark:shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/45">Variant | الموديل المحدد</p>
                                <p className="mt-3 text-2xl font-black leading-none text-slate-900 dark:text-white">{activeVariantDisplayName}</p>
                                {activeVariantCode ? (
                                    <p className="mt-2 text-xs font-medium text-slate-500 dark:text-white/55">Code: {activeVariantCode}</p>
                                ) : null}
                            </div>

                            <div className="rounded-[1.7rem] border border-slate-200/70 bg-white/88 p-4 shadow-[0_20px_50px_rgba(148,163,184,0.12)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.04] md:p-5">
                                <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/45">Choose Variant | اختر الشكل</p>
                                <div className="flex flex-wrap gap-2">
                                    {selectedProduct.variants.map((variantEntry, idx) => {
                                        const availability = resolveStockStatus(variantEntry, displayOrderType) === 'out_of_stock'
                                            || resolveStockLimit(variantEntry, displayOrderType) === 0
                                            ? 'out'
                                            : 'available';

                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => handleActiveVariantChange(idx)}
                                                className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-bold transition-all ${
                                                    activeVariantIndex === idx
                                                        ? 'scale-105 border-brandGold bg-brandGold text-brandBlue shadow-lg shadow-brandGold/25'
                                                        : 'border-gray-200 bg-white/5 text-gray-600 hover:border-brandGold/50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-gray-300'
                                                }`}
                                            >
                                                <span className={`h-2.5 w-2.5 rounded-full ${availability === 'available' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.55)]'}`}></span>
                                                <span>{variantEntry.name || variantEntry.label || `موديل ${idx + 1}`}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {renderVariantGallerySection()}

                            {canViewAdminPricing ? (
                                <AdminPricingCard
                                    netPriceValue={netPriceValue}
                                    discountValue={discountValue}
                                    retailPriceValue={retailPriceValue}
                                    wholesalePriceValue={wholesalePriceValue}
                                />
                            ) : null}

                            <ProductDetailCard
                                iconClassName="fa-solid fa-coins"
                                iconWrapperClassName="bg-brandGold/15 text-brandGold dark:bg-brandGold/18"
                                label="Price | السعر"
                                value={primaryDisplayPrice > 0 ? `${primaryDisplayPrice.toLocaleString()} ج.م` : 'تواصل معنا لمعرفة السعر'}
                                valueClassName={primaryDisplayPrice > 0 ? 'text-brandBlue dark:text-white' : 'text-slate-500 dark:text-white/65'}
                                caption={isStrictWholesaleUser
                                    ? (wholesalePriceValue > 0 ? `Wholesale: ${wholesalePriceValue.toLocaleString()} ج.م` : 'Wholesale: غير متاح')
                                    : 'سعر البيع الحالي للموديل المحدد.'}
                                badge={showLiveIndicator ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"></span>
                                        DC Live Update
                                    </span>
                                ) : null}
                            />

                            <ProductDetailCard
                                iconClassName={stockIcon}
                                iconWrapperClassName={stockCardTone}
                                label="Availability | حالة التوفر"
                                value={stockLabel}
                                valueClassName={isOutOfStock ? 'text-rose-500 dark:text-rose-300' : normalizedStockStatus === 'low_stock' ? 'text-amber-500 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}
                                caption={stockCaption}
                            />

                            {activeVariantDescription !== '' ? (
                                <div className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50/85 p-4 shadow-[0_18px_50px_rgba(148,163,184,0.08)] dark:border-white/8 dark:bg-white/[0.03]">
                                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/45">Description | وصف المنتج</h3>
                                    <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                                        {activeVariantDescription}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-auto space-y-3 border-t border-gray-100 pt-6 dark:border-gray-800">
                            {canShowWholesaleOrder ? renderWholesaleOrderCard({
                                priceValue: wholesalePriceValue,
                                isOutOfStockValue: wholesaleOutOfStock,
                                description: 'أضف كراتين الجملة في مسار منفصل عن العربة العادية.',
                                stockLimitValue: wholesaleStockLimit,
                                onAdd: () => addToWholesaleCart(activeVariant, wholesaleQuantity)
                            }) : null}

                            <div className="rounded-[1.4rem] border border-green-500/20 bg-green-500/5 p-4 dark:bg-green-500/10">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-600">Add Pack | عبوة / علبة</p>
                                <p className="mt-1 mb-3 text-xs text-gray-500 dark:text-gray-400">الكمية هنا محسوبة بالعبوة أو العلبة، وليس بالكرتونة.</p>
                                <div className="flex flex-col items-stretch gap-2">
                                    <div className="flex items-center overflow-hidden rounded-xl border-2 border-green-500/20 bg-white dark:bg-gray-900">
                                        <button type="button" onClick={decreaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-green-600 transition-colors hover:bg-green-50 dark:hover:bg-green-500/10">
                                            -
                                        </button>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={quantity}
                                            onChange={handleQuantityInputChange}
                                            className="min-w-12 flex-1 border-x border-green-500/15 bg-slate-950/5 px-3 py-0 text-center text-base font-black text-slate-900 outline-none dark:bg-slate-950/35 dark:text-emerald-50"
                                            aria-label="Unit quantity"
                                        />
                                        <button type="button" onClick={increaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-green-600 transition-colors hover:bg-green-50 dark:hover:bg-green-500/10">
                                            +
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRetailAddWithConfirmation(activeVariant, quantity, {
                                            unitPrice: primaryDisplayPrice,
                                            image: currentVariantImage,
                                            title: activeVariantDisplayName
                                        })}
                                        disabled={retailOutOfStock}
                                        className="w-full rounded-xl border-2 border-emerald-700 bg-emerald-700 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition-all hover:border-emerald-800 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-emerald-700/20 disabled:bg-emerald-700/20 disabled:text-emerald-50/80"
                                    >
                                        {retailOutOfStock ? 'غير متوفر حالياً' : 'ADD PACK | اضف عبوة'}
                                    </button>
                                </div>
                                {showStockLimitMessage ? (
                                    <p className="mt-2 text-[11px] font-bold text-amber-600 dark:text-amber-300">وصلت للكمية المتاحة حالياً: {retailStockLimit}</p>
                                ) : null}
                                {retailStockLimit !== null ? (
                                    <p className="mt-2 text-[10px] font-bold text-gray-400">الحد الأقصى المتاح حالياً: {retailStockLimit}</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative my-auto w-full max-w-6xl rounded-[2rem] border border-slate-200/70 bg-white shadow-2xl transition-all dark:border-white/10 dark:bg-darkCard md:hidden sm:max-h-[92vh] sm:overflow-hidden">
                    
                    <button
                        onClick={closeModal}
                        className="absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/55 text-gray-800 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 dark:border-white/10 dark:bg-white/10 dark:text-white"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>

                    <div className="hide-scroll flex w-full flex-col pb-6 sm:h-full sm:overflow-y-auto sm:pb-8">
                        <div className="px-4 pt-5 md:px-8 md:pt-8">
                            <div className="rounded-[1.8rem] border border-slate-200/70 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] px-5 py-5 text-center shadow-[0_20px_55px_rgba(148,163,184,0.1)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.16),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] md:px-8 md:py-6">
                                {metadata.length > 0 ? (
                                    <div className="mb-3 flex flex-wrap justify-center gap-2">
                                        {metadata.map((item, index) => (
                                            <span key={`${index}-${item}`} className="inline-flex rounded-full border border-brandGold/15 bg-brandGold/10 px-3 py-1 text-[11px] font-bold text-brandGold">
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                                <h2 className="text-[1.9rem] font-black leading-[1.02] tracking-tight text-brandBlue dark:text-white md:text-4xl">
                                    {productNameParts.english ? <span dir="ltr">{productNameParts.english}</span> : null}
                                    {productNameParts.english && productNameParts.arabic ? <span className="mx-2 text-brandGold">|</span> : null}
                                    {productNameParts.arabic ? <span dir="rtl">{productNameParts.arabic}</span> : null}
                                </h2>
                                <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] font-bold text-slate-500 dark:text-white/55">
                                    {productCode ? (
                                        <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
                                            Code: {productCode}
                                        </span>
                                    ) : null}
                                    <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
                                        {selectedProduct.variants.length} موديل
                                    </span>
                                </div>
                                <p className="mt-4 text-sm font-medium text-gray-500 dark:text-white/55">استعرض الخيارات المتاحة لهذا المنتج واختر الموديل المناسب.</p>
                            </div>
                        </div>

                        <div className="flex-grow" dir="ltr">
                            <AnimatedTestimonials 
                                testimonials={variantsAsTestimonials} 
                                activeIndex={activeVariantIndex}
                                onActiveChange={handleActiveVariantChange}
                                onActiveImageClick={() => openLightbox(activeVariantImages, subImageIndex, activeVariant?.name || activeVariant?.label || selectedProduct.title || selectedProduct.name || '')}
                                renderMobileBeforeContent={() => (
                                    <div dir="rtl">
                                        {renderVariantGallerySection()}
                                    </div>
                                )}
                                containerClassName="max-w-none px-4 py-6 md:px-8 md:py-8"
                                imageClassName="h-full w-full rounded-[1.2rem] object-contain object-center"
                                showCount
                                renderExtra={(idx, setActiveIndex) => (
                                    <div dir="rtl">
                                        {renderVariantsExtra(idx, setActiveIndex)}
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                </div>

                <ProductOrderDecisionSheet
                    summary={retailOrderSheet}
                    onDismiss={dismissRetailOrderSheet}
                    onContinueShopping={handleContinueShopping}
                    onCompleteOrder={handleCompleteRetailOrder}
                />
            </div>
        );
    }

    return (
        <div key={selectedProduct.id || selectedProduct.code || selectedProduct.name} className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-6" dir="rtl">
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={closeModal}
            ></div>
            
            <div className="relative my-auto flex w-full max-w-5xl flex-col rounded-[2rem] bg-white shadow-2xl transition-all dark:bg-darkCard md:max-h-[94vh] md:flex-row md:overflow-hidden md:rounded-3xl">
                
                {/* Close button */}
                <button 
                    onClick={closeModal}
                    className="absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/55 text-gray-800 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 dark:border-white/10 dark:bg-white/10 dark:text-white"
                >
                    <i className="fa-solid fa-xmark"></i>
                </button>

                {/* Media Section */}
                <div className="relative flex w-full flex-col border-b border-slate-200/70 bg-gradient-to-b from-slate-100 via-white to-slate-100 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 md:w-3/5 md:border-b-0 md:border-l">
                    <div className="relative flex h-[23rem] shrink-0 items-center justify-center overflow-hidden px-4 pb-24 pt-16 sm:h-[26rem] md:h-full md:min-h-[34rem] md:px-6 md:pb-6">
                        {images.length > 1 ? (
                            <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2 md:left-6 md:top-6">
                                <span className="rounded-full border border-white/60 bg-white/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-950/70 dark:text-white/75">
                                    {safeImageIndex + 1} / {images.length}
                                </span>
                                {productCode ? (
                                    <span className="hidden rounded-full border border-white/60 bg-white/65 px-3 py-1 text-[10px] font-bold text-slate-600 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-950/65 dark:text-white/55 sm:inline-flex">
                                        {productCode}
                                    </span>
                                ) : null}
                            </div>
                        ) : null}

                        {currentMedia ? (
                            currentMedia.type === 'video' ? (
                                <video 
                                    src={currentMedia.url} 
                                    controls 
                                    autoPlay 
                                    loop 
                                    className="relative z-10 h-full w-full rounded-[1.75rem] border border-white/40 bg-white/75 object-contain p-3 shadow-[0_24px_80px_rgba(148,163,184,0.16)] backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]"
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => openLightbox(images, safeImageIndex, selectedProduct.title || selectedProduct.name || '')}
                                    className="relative z-10 flex h-full w-full items-center justify-center rounded-[1.9rem] border border-white/45 bg-white/80 p-3 shadow-[0_24px_80px_rgba(148,163,184,0.16)] backdrop-blur-sm focus:outline-none dark:border-white/10 dark:bg-white/[0.04]"
                                    aria-label="Open product image fullscreen"
                                >
                                    <img 
                                        src={currentMedia.url || currentMedia} 
                                        alt={selectedProduct.title || selectedProduct.name}
                                        className="h-full w-full rounded-[1.45rem] object-contain object-top cursor-zoom-in"
                                    />
                                </button>
                            )
                        ) : (
                            <div className="relative z-10 flex h-full w-full items-center justify-center rounded-[1.9rem] border border-dashed border-slate-300 bg-white/75 text-gray-400 dark:border-white/10 dark:bg-white/[0.04]">
                                <i className="fa-regular fa-image text-6xl"></i>
                            </div>
                        )}
                        
                        {/* Navigation Arrows */}
                        {images.length > 1 && (
                            <>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                                    }}
                                    className="detail-nav-arrow right-4"
                                >
                                    <i className="fa-solid fa-chevron-right"></i>
                                </button>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                                    }}
                                    className="absolute left-4 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white shadow-xl transition-colors hover:bg-brandGold md:left-6"
                                >
                                    <i className="fa-solid fa-chevron-left"></i>
                                </button>
                            </>
                        )}
                    </div>
                    
                    {/* Thumbnails */}
                    {images.length > 1 && (
                        <div className="absolute bottom-4 left-4 right-4 z-20 md:static md:bottom-auto md:left-auto md:right-auto md:bg-slate-100/80 md:p-3 dark:md:bg-slate-950/70">
                            <div className="flex gap-2 overflow-x-auto hide-scroll rounded-[1.5rem] border border-white/65 bg-white/80 p-2 shadow-[0_12px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/72 md:rounded-2xl md:border-0 md:bg-transparent md:p-0 md:shadow-none">
                            {images.map((img, idx) => (
                                <button 
                                    type="button"
                                    key={idx}
                                    onClick={() => setCurrentImageIndex(idx)}
                                    aria-label={`View media ${idx + 1}`}
                                    className={`relative h-16 w-16 flex-none overflow-hidden rounded-[1rem] border-2 transition-all md:h-20 md:w-20 ${
                                        idx === safeImageIndex
                                            ? 'border-brandGold opacity-100 shadow-[0_10px_25px_rgba(212,175,55,0.28)]'
                                            : 'border-transparent opacity-65 hover:opacity-100'
                                    }`}
                                >
                                    {img.type === 'video' ? (
                                        <div className="w-full h-full bg-black flex items-center justify-center">
                                            <i className="fa-solid fa-play text-white"></i>
                                        </div>
                                    ) : (
                                        <img src={img.url || img} className="w-full h-full object-cover" />
                                    )}
                                </button>
                            ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Info Section */}
                <div className="custom-scrollbar flex w-full flex-col p-5 md:min-h-0 md:w-2/5 md:overflow-y-auto md:p-8">
                    <div className="mb-2">
                        {metadata.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                                {metadata.map((item, index) => (
                                    <span key={`${index}-${item}`} className="inline-block rounded-full bg-brandGold/10 px-3 py-1 text-[11px] font-bold text-brandGold">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        )}
                        <h2 className="text-[1.75rem] font-black leading-[1.05] tracking-tight text-brandBlue dark:text-slate-100 md:text-3xl">
                            {productNameParts.english ? <span dir="ltr">{productNameParts.english}</span> : null}
                            {productNameParts.english && productNameParts.arabic ? <span className="mx-2 text-brandGold">|</span> : null}
                            {productNameParts.arabic ? <span dir="rtl">{productNameParts.arabic}</span> : null}
                        </h2>
                        {(productCode || images.length > 1) ? (
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500 dark:text-white/55">
                                {productCode ? (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                                        Code: {productCode}
                                    </span>
                                ) : null}
                                {images.length > 1 ? (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                                        {images.length} صور
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                        <div className="mt-4 h-px bg-gradient-to-r from-brandGold via-brandGold/30 to-transparent"></div>
                    </div>

                    <div className="my-5 space-y-4">
                        {canViewAdminPricing ? (
                            <AdminPricingCard
                                netPriceValue={netPriceValue}
                                discountValue={discountValue}
                                retailPriceValue={retailPriceValue}
                                wholesalePriceValue={wholesalePriceValue}
                            />
                        ) : null}

                        <ProductDetailCard
                            iconClassName="fa-solid fa-coins"
                            iconWrapperClassName="bg-brandGold/15 text-brandGold dark:bg-brandGold/18"
                            label="Price | السعر"
                            value={primaryDisplayPrice > 0 ? `${primaryDisplayPrice.toLocaleString()} ج.م` : 'تواصل معنا لمعرفة السعر'}
                            valueClassName={primaryDisplayPrice > 0 ? 'text-brandBlue dark:text-white' : 'text-slate-500 dark:text-white/65'}
                            caption={isStrictWholesaleUser
                                ? (wholesalePriceValue > 0 ? `Wholesale: ${wholesalePriceValue.toLocaleString()} ج.م` : 'Wholesale: غير متاح')
                                : 'سعر البيع الحالي للمنتج.'}
                            badge={showLiveIndicator ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"></span>
                                    DC Live Update
                                </span>
                            ) : null}
                        />

                        {(selectedProduct.stockStatus || stockLimit !== null) ? (
                            <ProductDetailCard
                                iconClassName={stockIcon}
                                iconWrapperClassName={stockCardTone}
                                label="Availability | حالة التوفر"
                                value={stockLabel}
                                valueClassName={isOutOfStock ? 'text-rose-500 dark:text-rose-300' : normalizedStockStatus === 'low_stock' ? 'text-amber-500 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}
                                caption={stockCaption}
                            />
                        ) : null}
                        
                        {fallbackDesc !== '' && (
                            <div className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50/85 p-4 shadow-[0_18px_50px_rgba(148,163,184,0.08)] dark:border-white/8 dark:bg-white/[0.03]">
                                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/45">Description | وصف المنتج</h3>
                                <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                                    {fallbackDesc}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-auto pt-6 border-t border-gray-100 dark:border-gray-800 space-y-3">
                        {canShowWholesaleOrder ? renderWholesaleOrderCard({
                            priceValue: wholesalePrice,
                            isOutOfStockValue: wholesaleOutOfStock,
                            description: 'أضف كراتين الجملة في مسار منفصل عن العربة العادية.',
                            stockLimitValue: wholesaleStockLimit,
                            onAdd: handleAddToWholesaleCart
                        }) : null}

                        <div className="rounded-[1.4rem] border border-green-500/20 bg-green-500/5 p-4 dark:bg-green-500/10">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-600">Add Pack | عبوة / علبة</p>
                            <p className="mt-1 mb-3 text-xs text-gray-500 dark:text-gray-400">الكمية هنا محسوبة بالعبوة أو العلبة، وليس بالكرتونة.</p>
                            <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                                <div className="flex items-center overflow-hidden rounded-xl border-2 border-green-500/20 bg-white dark:bg-gray-900">
                                    <button type="button" onClick={decreaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-green-600 transition-colors hover:bg-green-50 dark:hover:bg-green-500/10">
                                        -
                                    </button>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={quantity}
                                        onChange={handleQuantityInputChange}
                                        className="min-w-12 flex-1 border-x border-green-500/15 bg-transparent px-3 py-0 text-center text-sm font-black text-brandBlue outline-none md:hidden dark:text-white"
                                        aria-label="Unit quantity"
                                    />
                                    <span className="hidden min-w-12 items-center justify-center border-x border-green-500/15 bg-slate-950/5 px-3 text-center text-base font-black text-slate-900 dark:bg-slate-950/40 dark:text-emerald-50 md:flex">{quantity}</span>
                                    <button type="button" onClick={increaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-green-600 transition-colors hover:bg-green-50 dark:hover:bg-green-500/10">
                                        +
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddToCart}
                                    disabled={retailOutOfStock}
                                    className="flex-1 rounded-xl border-2 border-emerald-700 bg-emerald-700 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition-all hover:border-emerald-800 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-emerald-700/20 disabled:bg-emerald-700/20 disabled:text-emerald-50/80"
                                >
                                    {retailOutOfStock ? 'غير متوفر حالياً' : 'ADD PACK | اضف عبوة'}
                                </button>
                            </div>
                            {showStockLimitMessage ? (
                                <p className="mt-2 text-[11px] font-bold text-amber-600 dark:text-amber-300">وصلت للكمية المتاحة حالياً: {retailStockLimit}</p>
                            ) : null}
                            {retailStockLimit !== null ? (
                                <p className="mt-2 text-[10px] font-bold text-gray-400">الحد الأقصى المتاح حالياً: {retailStockLimit}</p>
                            ) : null}
                        </div>

                        <a 
                            href={buildWhatsAppUrl(siteSettings.whatsapp, enquiryText)}
                            target="_blank" 
                            rel="noreferrer"
                            className="w-full py-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                        >
                            <i className="fa-brands fa-whatsapp text-xl"></i>
                            اسأل عبر واتساب
                        </a>
                    </div>
                </div>

            </div>

            <ProductOrderDecisionSheet
                summary={retailOrderSheet}
                onDismiss={dismissRetailOrderSheet}
                onContinueShopping={handleContinueShopping}
                onCompleteOrder={handleCompleteRetailOrder}
            />

            {lightboxState.isOpen ? (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/95 p-4" dir="ltr">
                    <button
                        type="button"
                        onClick={closeLightbox}
                        className="absolute inset-0 cursor-default"
                        aria-label="Close fullscreen viewer"
                    ></button>

                    <div className="relative z-10 flex h-full w-full max-w-6xl items-center justify-center">
                        <button
                            type="button"
                            onClick={closeLightbox}
                            className="absolute right-2 top-2 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20 md:right-4 md:top-4"
                            aria-label="Close fullscreen viewer"
                        >
                            <i className="fa-solid fa-xmark text-lg"></i>
                        </button>

                        {lightboxState.images.length > 1 ? (
                            <button
                                type="button"
                                onClick={() => stepLightbox(-1)}
                                className="absolute left-1 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20 md:left-4"
                                aria-label="Previous image"
                            >
                                <i className="fa-solid fa-chevron-left text-lg"></i>
                            </button>
                        ) : null}

                        <div className="flex max-h-full w-full flex-col items-center justify-center gap-4 px-12 md:px-20">
                            <img
                                src={lightboxState.images[lightboxState.index]}
                                alt={lightboxState.title || 'Fullscreen product image'}
                                className="max-h-[78vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_20px_80px_rgba(0,0,0,0.55)]"
                            />

                            {lightboxState.title ? (
                                <div className="text-center text-white/90">
                                    <p className="text-base font-bold md:text-lg">{lightboxState.title}</p>
                                    {lightboxState.images.length > 1 ? (
                                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-white/55">
                                            {lightboxState.index + 1} / {lightboxState.images.length}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        {lightboxState.images.length > 1 ? (
                            <button
                                type="button"
                                onClick={() => stepLightbox(1)}
                                className="absolute right-1 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20 md:right-4"
                                aria-label="Next image"
                            >
                                <i className="fa-solid fa-chevron-right text-lg"></i>
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}