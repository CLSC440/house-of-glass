'use client';
import { useGallery } from '@/contexts/GalleryContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatedTestimonials } from '@/components/ui/animated-testimonials';
import { buildWhatsAppUrl, useSiteSettings } from '@/lib/use-site-settings';
import { getGlobalRetailDisplayPrice, parsePercentage } from '@/lib/site-pricing';
import { isAdminRole, normalizeUserRole, USER_ROLE_VALUES } from '@/lib/user-roles';
import BrandLoadingScreen from '@/components/layout/BrandLoadingScreen';
import useCheckoutNavigation from '@/lib/use-checkout-navigation';

const LIVE_INDICATOR_DURATION_MS = 8000;
const RELATED_PRODUCTS_LIMIT = 8;

function parsePrice(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatPriceLabel(value) {
    return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

function hashSeedValue(value) {
    return Array.from(String(value || '')).reduce((hash, character) => {
        return ((hash << 5) - hash + character.charCodeAt(0)) >>> 0;
    }, 0);
}

function normalizeComparisonValue(value) {
    return String(value || '').trim().toLowerCase();
}

function resolveNormalizedCategoryName(value) {
    return normalizeComparisonValue(value);
}

function resolveRelatedProductIdentity(product = {}) {
    return normalizeComparisonValue(
        product?.id
        || getProductShareCode(product)
        || product?.title
        || product?.name
    );
}

function getSeededProductOrder(products = [], seed = '') {
    return [...products].sort((leftProduct, rightProduct) => {
        const leftIdentity = resolveRelatedProductIdentity(leftProduct);
        const rightIdentity = resolveRelatedProductIdentity(rightProduct);
        const leftHash = hashSeedValue(`${seed}-${leftIdentity}`);
        const rightHash = hashSeedValue(`${seed}-${rightIdentity}`);

        if (leftHash !== rightHash) {
            return leftHash - rightHash;
        }

        return leftIdentity.localeCompare(rightIdentity);
    });
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

function buildRetailCartSummary(cartItems = [], cartCount = 0, cartSubtotal = 0, orderSummary = null) {
    if (orderSummary && !orderSummary.isCartFallback) {
        return {
            ...orderSummary,
            cartItems: Array.isArray(orderSummary.cartItems) ? orderSummary.cartItems : [],
            isCartFallback: Boolean(orderSummary.isCartFallback)
        };
    }

    if (cartCount <= 0) {
        return null;
    }

    const latestItem = cartItems[cartItems.length - 1] || null;
    const latestQuantity = Number(latestItem?.quantity || 0);
    const latestUnitPrice = parsePrice(latestItem?.price);
    const latestSubtotal = latestUnitPrice > 0 && latestQuantity > 0 ? latestUnitPrice * latestQuantity : cartSubtotal;
    const cartLines = cartItems.map((item, index) => {
        const quantity = Number(item?.quantity || 0);
        const unitPrice = parsePrice(item?.price);
        const cartId = String(item?.cartId || item?.id || item?.code || item?.title || item?.name || `cart-item-${index}`);

        return {
            id: cartId,
            cartId,
            title: String(item?.title || item?.name || 'Cart item').trim() || 'Cart item',
            quantity,
            unitPrice,
            lineTotal: quantity > 0 ? unitPrice * quantity : unitPrice
        };
    });

    return {
        title: String(latestItem?.title || latestItem?.name || 'Cart summary').trim() || 'Cart summary',
        image: resolveModalProductImage(latestItem, '/logo.png'),
        addedQuantity: latestQuantity || cartCount,
        nextQuantity: latestQuantity || cartCount,
        unitPrice: latestUnitPrice,
        addedSubtotal: latestSubtotal,
        nextCartCount: cartCount,
        nextCartSubtotal: cartSubtotal,
        wasExisting: true,
        cartItems: cartLines,
        isCartFallback: true
    };
}

function isCompactMobileViewport() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }

    return window.matchMedia('(max-width: 639px)').matches;
}

function isSummaryBarScrollViewport() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }

    return window.matchMedia('(max-width: 767px)').matches;
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

function getLoopedCarouselIndex(index, itemCount) {
    if (itemCount <= 0) {
        return 0;
    }

    return ((index % itemCount) + itemCount) % itemCount;
}

function SwipeableLoopCarousel({
    itemCount = 0,
    activeIndex = 0,
    onIndexChange,
    renderSlide,
    onActiveSlideClick,
    activeSlideAriaLabel = 'Open image',
    className = '',
    viewportClassName = '',
    trackClassName = '',
    slideClassName = ''
}) {
    const viewportRef = useRef(null);
    const pointerIdRef = useRef(null);
    const gestureAxisRef = useRef('');
    const dragStartXRef = useRef(0);
    const dragStartYRef = useRef(0);
    const dragOffsetRef = useRef(0);
    const settleTimeoutRef = useRef(null);
    const suppressClickRef = useRef(false);
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const hasMultipleItems = itemCount > 1;
    const safeActiveIndex = itemCount > 0 ? Math.min(Math.max(activeIndex, 0), itemCount - 1) : 0;
    const slideIndices = useMemo(() => {
        if (itemCount <= 0) {
            return [];
        }

        if (!hasMultipleItems) {
            return [safeActiveIndex];
        }

        return [
            getLoopedCarouselIndex(safeActiveIndex - 1, itemCount),
            safeActiveIndex,
            getLoopedCarouselIndex(safeActiveIndex + 1, itemCount)
        ];
    }, [hasMultipleItems, itemCount, safeActiveIndex]);

    const clearSettleTimeout = () => {
        if (typeof window === 'undefined' || !settleTimeoutRef.current) {
            return;
        }

        window.clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
    };

    useEffect(() => {
        return () => {
            clearSettleTimeout();
        };
    }, []);

    const finishResetPosition = () => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => {
                setIsResetting(false);
            });
            return;
        }

        setIsResetting(false);
    };

    const settleToDirection = (direction) => {
        if (!hasMultipleItems || typeof onIndexChange !== 'function') {
            setIsDragging(false);
            setDragOffset(0);
            return;
        }

        const viewportWidth = viewportRef.current?.offsetWidth || 0;
        const targetOffset = direction > 0 ? -(viewportWidth || 0) : (viewportWidth || 0);

        clearSettleTimeout();
        setIsDragging(false);
        setDragOffset(targetOffset);

        if (typeof window === 'undefined') {
            onIndexChange(getLoopedCarouselIndex(safeActiveIndex + direction, itemCount));
            setDragOffset(0);
            return;
        }

        settleTimeoutRef.current = window.setTimeout(() => {
            setIsResetting(true);
            onIndexChange(getLoopedCarouselIndex(safeActiveIndex + direction, itemCount));
            dragOffsetRef.current = 0;
            setDragOffset(0);
            finishResetPosition();
            settleTimeoutRef.current = null;
        }, 240);
    };

    const releasePointer = (event) => {
        try {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch (_error) {
            // Ignore capture release failures from browsers that already released it.
        }

        pointerIdRef.current = null;
        gestureAxisRef.current = '';
    };

    const handlePointerDown = (event) => {
        if (!hasMultipleItems || isResetting || typeof onIndexChange !== 'function') {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        pointerIdRef.current = event.pointerId;
        gestureAxisRef.current = '';
        dragStartXRef.current = event.clientX;
        dragStartYRef.current = event.clientY;
        dragOffsetRef.current = 0;
        suppressClickRef.current = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event) => {
        if (pointerIdRef.current !== event.pointerId) {
            return;
        }

        const deltaX = event.clientX - dragStartXRef.current;
        const deltaY = event.clientY - dragStartYRef.current;

        if (!gestureAxisRef.current) {
            if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) {
                return;
            }

            gestureAxisRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
        }

        if (gestureAxisRef.current !== 'x') {
            return;
        }

        event.preventDefault();
        dragOffsetRef.current = deltaX;
        if (!isDragging) {
            setIsDragging(true);
        }

        if (Math.abs(deltaX) > 10) {
            suppressClickRef.current = true;
        }

        setDragOffset(deltaX);
    };

    const handlePointerEnd = (event) => {
        if (pointerIdRef.current !== event.pointerId) {
            return;
        }

        const dragAxis = gestureAxisRef.current;
        const horizontalOffset = dragOffsetRef.current;
        releasePointer(event);

        if (dragAxis !== 'x') {
            return;
        }

        const viewportWidth = viewportRef.current?.offsetWidth || 0;
        const settleThreshold = Math.max(48, Math.min(110, viewportWidth * 0.18 || 72));

        dragOffsetRef.current = 0;
        if (Math.abs(horizontalOffset) >= settleThreshold) {
            settleToDirection(horizontalOffset < 0 ? 1 : -1);
            return;
        }

        setIsDragging(false);
        setDragOffset(0);
    };

    const handleSlideClick = (itemIndex, isActive) => (event) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (isActive) {
            onActiveSlideClick?.(itemIndex);
            return;
        }

        if (typeof onIndexChange === 'function') {
            onIndexChange(itemIndex);
        }
    };

    if (slideIndices.length === 0) {
        return null;
    }

    return (
        <div className={`relative h-full w-full ${className}`}>
            <div
                ref={viewportRef}
                dir="ltr"
                className={`h-full w-full overflow-hidden ${viewportClassName}`}
                style={{ touchAction: hasMultipleItems ? 'pan-y pinch-zoom' : 'auto' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
            >
                <div
                    className={`flex h-full will-change-transform ${trackClassName}`}
                    style={{
                        width: hasMultipleItems ? '300%' : '100%',
                        transform: hasMultipleItems
                            ? `translate3d(calc(-33.333333% + ${dragOffset}px), 0, 0)`
                            : 'translate3d(0, 0, 0)',
                        transition: isDragging || isResetting ? 'none' : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)'
                    }}
                >
                    {slideIndices.map((itemIndex, slotIndex) => {
                        const isActive = !hasMultipleItems || slotIndex === 1;
                        const isInteractive = isActive ? typeof onActiveSlideClick === 'function' : typeof onIndexChange === 'function';

                        return (
                            <div
                                key={`${itemIndex}-${slotIndex}-${safeActiveIndex}`}
                                className={`h-full shrink-0 ${slideClassName}`}
                                style={{ width: hasMultipleItems ? '33.333333%' : '100%' }}
                            >
                                <button
                                    type="button"
                                    onClick={handleSlideClick(itemIndex, isActive)}
                                    disabled={!isInteractive}
                                    aria-label={isActive ? activeSlideAriaLabel : `View image ${itemIndex + 1}`}
                                    className={`h-full w-full ${isInteractive ? '' : 'cursor-default'}`}
                                >
                                    {renderSlide(itemIndex, { isActive })}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function buildWholesaleAvailabilityCaption({ isStrictWholesaleUser, retailStockLimit, wholesaleStockLimit, fallbackCaption }) {
    if (!isStrictWholesaleUser) {
        return fallbackCaption;
    }

    const captionLines = [];

    if (retailStockLimit !== null) {
        captionLines.push(
            <span key="retail-stock-limit" className="block">
                الحد الأقصى المتاح حالياً للعبوات: {retailStockLimit}
            </span>
        );
    }

    if (wholesaleStockLimit !== null) {
        captionLines.push(
            <span key="wholesale-stock-limit" className="block">
                الحد الأقصى المتاح حالياً للجملة: {wholesaleStockLimit}
            </span>
        );
    }

    if (captionLines.length === 0) {
        return fallbackCaption;
    }

    return <>{captionLines}</>;
}

function ProductOrderDecisionSheet({ summary, onDismiss, onCompleteOrder, onRemoveCartItem, onUpdateCartItemQuantity, startMinimized = false }) {
    const sheetRef = useRef(null);
    const backdropRef = useRef(null);
    const activePointerIdRef = useRef(null);
    const dragStartYRef = useRef(0);
    const dragOffsetRef = useRef(0);
    const dismissTimeoutRef = useRef(null);
    const minimizedBarHideTimeoutRef = useRef(null);
    const lastMinimizedBarScrollYRef = useRef(0);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isMinimizedBarVisible, setIsMinimizedBarVisible] = useState(Boolean(startMinimized));

    const clearMinimizedBarHideTimeout = () => {
        if (typeof window === 'undefined' || !minimizedBarHideTimeoutRef.current) {
            return;
        }

        window.clearTimeout(minimizedBarHideTimeoutRef.current);
        minimizedBarHideTimeoutRef.current = null;
    };

    const scheduleMinimizedBarHide = () => {
        if (typeof window === 'undefined' || !isSummaryBarScrollViewport()) {
            return;
        }

        clearMinimizedBarHideTimeout();
        minimizedBarHideTimeoutRef.current = window.setTimeout(() => {
            setIsMinimizedBarVisible(false);
            minimizedBarHideTimeoutRef.current = null;
        }, 3000);
    };

    const detachDragListeners = () => {
        if (typeof window === 'undefined') {
            return;
        }

        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerEnd);
        window.removeEventListener('pointercancel', handlePointerEnd);
    };

    const applyDragOffset = (offset, options = {}) => {
        const { animate = false } = options;
        const sheetElement = sheetRef.current;
        const backdropElement = backdropRef.current;

        if (!sheetElement || !backdropElement) {
            return;
        }

        const positiveOffset = Math.max(0, offset);
        const backdropOpacity = Math.max(0, 0.55 - (positiveOffset / 320) * 0.35);

        sheetElement.style.transition = animate ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
        sheetElement.style.transform = `translateY(${offset}px)`;
        backdropElement.style.transition = animate ? 'opacity 220ms ease' : 'none';
        backdropElement.style.opacity = String(backdropOpacity);
        backdropElement.style.pointerEvents = 'auto';
        dragOffsetRef.current = offset;
    };

    const minimizeSheet = () => {
        if (dismissTimeoutRef.current) {
            window.clearTimeout(dismissTimeoutRef.current);
            dismissTimeoutRef.current = null;
        }

        setIsMinimized(true);
        setIsMinimizedBarVisible(true);

        if (typeof window !== 'undefined') {
            lastMinimizedBarScrollYRef.current = Math.max(0, window.scrollY || 0);
        }

        scheduleMinimizedBarHide();
        dragOffsetRef.current = 0;
    };

    const expandSheet = () => {
        if (dismissTimeoutRef.current) {
            window.clearTimeout(dismissTimeoutRef.current);
            dismissTimeoutRef.current = null;
        }

        clearMinimizedBarHideTimeout();
        setIsMinimizedBarVisible(true);
        setIsMinimized(false);
        applyDragOffset(0, { animate: true });
    };

    const stopEvent = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    const handleMinimizeClick = (event) => {
        stopEvent(event);

        if (typeof window !== 'undefined') {
            window.setTimeout(() => {
                minimizeSheet();
            }, 0);
            return;
        }

        minimizeSheet();
    };

    const handleExpandClick = (event) => {
        stopEvent(event);
        expandSheet();
    };

    const handleDismissClick = (event) => {
        stopEvent(event);
        onDismiss();
    };

    const handleCompleteOrderClick = (event) => {
        stopEvent(event);
        onCompleteOrder();
    };

    function handlePointerMove(event) {
        if (activePointerIdRef.current !== event.pointerId) {
            return;
        }

        event.preventDefault();

        const deltaY = event.clientY - dragStartYRef.current;
        const adjustedOffset = deltaY < 0 ? Math.max(-36, deltaY * 0.28) : deltaY;
        applyDragOffset(adjustedOffset);
    }

    function handlePointerEnd(event) {
        if (activePointerIdRef.current !== event.pointerId) {
            return;
        }

        const sheetElement = sheetRef.current;
        const settleThreshold = Math.min(220, Math.max(120, (sheetElement?.offsetHeight || 0) * 0.28));
        const currentOffset = dragOffsetRef.current;

        activePointerIdRef.current = null;
        detachDragListeners();

        if (currentOffset > settleThreshold) {
            minimizeSheet();
            return;
        }

        expandSheet();
    }

    const handlePointerStart = (event) => {
        if (!isCompactMobileViewport()) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        if (dismissTimeoutRef.current) {
            window.clearTimeout(dismissTimeoutRef.current);
            dismissTimeoutRef.current = null;
        }

        activePointerIdRef.current = event.pointerId;
        dragStartYRef.current = event.clientY - dragOffsetRef.current;
        detachDragListeners();
        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        window.addEventListener('pointerup', handlePointerEnd);
        window.addEventListener('pointercancel', handlePointerEnd);
    };

    const summaryStateSyncKey = summary?.isCartFallback ? 'cart-fallback' : summary;

    useEffect(() => {
        setIsMinimized(startMinimized);
        setIsMinimizedBarVisible(Boolean(startMinimized));

        clearMinimizedBarHideTimeout();

        if (typeof window !== 'undefined') {
            lastMinimizedBarScrollYRef.current = Math.max(0, window.scrollY || 0);
        }

        if (startMinimized) {
            scheduleMinimizedBarHide();
        }

        if (!startMinimized) {
            if (typeof window !== 'undefined') {
                window.requestAnimationFrame(() => applyDragOffset(0));
            } else {
                applyDragOffset(0);
            }
        }
    }, [startMinimized, summaryStateSyncKey]);

    useEffect(() => {
        return () => {
            detachDragListeners();
            clearMinimizedBarHideTimeout();
            if (dismissTimeoutRef.current) {
                window.clearTimeout(dismissTimeoutRef.current);
                dismissTimeoutRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !summary || !isMinimized || !isSummaryBarScrollViewport()) {
            clearMinimizedBarHideTimeout();
            return undefined;
        }

        lastMinimizedBarScrollYRef.current = Math.max(0, window.scrollY || 0);

        const handleScroll = () => {
            const nextScrollY = Math.max(0, window.scrollY || 0);
            const deltaY = nextScrollY - lastMinimizedBarScrollYRef.current;

            if (Math.abs(deltaY) < 6) {
                return;
            }

            lastMinimizedBarScrollYRef.current = nextScrollY;

            if (deltaY > 0) {
                setIsMinimizedBarVisible(true);
                scheduleMinimizedBarHide();
                return;
            }

            clearMinimizedBarHideTimeout();
            setIsMinimizedBarVisible(false);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            clearMinimizedBarHideTimeout();
        };
    }, [isMinimized, summary]);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return undefined;
        }

        if (isMinimized || !summary) {
            return undefined;
        }

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [isMinimized, summary]);

    if (!summary) {
        return null;
    }

    const minimizedCartIconMaskStyle = {
        WebkitMaskImage: 'url(/icons/add-to-cart-retail-collapsed.svg)',
        maskImage: 'url(/icons/add-to-cart-retail-collapsed.svg)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain'
    };
    const shouldTrackMinimizedBarScroll = isSummaryBarScrollViewport();
    const isMinimizedBarShown = !shouldTrackMinimizedBarScroll || isMinimizedBarVisible;

    if (isMinimized) {
        return (
            <div
                key="order-sheet-minimized"
                className={`fixed inset-x-0 bottom-0 z-[180] px-3 pb-[max(0.15rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-200 ease-out sm:px-6 sm:pb-6 ${isMinimizedBarShown ? 'pointer-events-auto' : 'pointer-events-none'}`}
                dir="rtl"
                style={{
                    transform: isMinimizedBarShown ? 'translateY(0)' : 'translateY(calc(100% + 1.25rem))',
                    opacity: isMinimizedBarShown ? 1 : 0
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    aria-label="Open order review summary"
                    onClick={handleExpandClick}
                    className="mx-auto block w-full max-w-lg rounded-[1.35rem] border border-brandGold/25 bg-[#11192c] text-white shadow-[0_24px_70px_rgba(15,23,42,0.38)] transition-transform duration-200 hover:-translate-y-0.5 sm:max-w-xl sm:rounded-[1.6rem]"
                >
                    <div className="flex items-center gap-2.5 px-2.5 py-2.5 text-left sm:gap-4 sm:px-4 sm:py-4" dir="ltr">
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.95rem] border border-white/10 bg-[#0d1426] text-brandGold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:h-16 sm:w-16 sm:rounded-[1.15rem]">
                            <span className="h-7 w-7 bg-brandGold sm:h-10 sm:w-10" style={minimizedCartIconMaskStyle}></span>
                            <span className="absolute right-0.5 top-0.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#0d1426] bg-[#ff3b30] px-1 text-[10px] font-black leading-none tabular-nums text-white shadow-[0_10px_18px_rgba(255,59,48,0.35)] sm:right-1.5 sm:top-1.5 sm:h-7 sm:min-w-7 sm:px-1.5 sm:text-[12px]">
                                {summary.nextCartCount}
                            </span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="mt-0.5 text-[11px] font-semibold text-white/60 sm:text-sm">Cart Subtotal</p>
                            <p className="mt-1 whitespace-nowrap text-[1.45rem] font-black leading-none tracking-tight text-white sm:text-2xl">{formatPriceLabel(summary.nextCartSubtotal)}</p>
                        </div>
                        <div className="shrink-0 self-end">
                            <span className="inline-flex items-center justify-center rounded-full border border-brandGold/20 bg-brandGold px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-brandBlue shadow-[0_14px_30px_rgba(212,175,55,0.22)] sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.14em]">
                                View Cart
                            </span>
                        </div>
                    </div>
                </button>
            </div>
        );
    }

    return (
        <div key="order-sheet-expanded" className="fixed inset-0 z-[180]" dir="rtl" onClick={(event) => event.stopPropagation()}>
            <button
                type="button"
                aria-label="Minimize order review"
                ref={backdropRef}
                className="absolute inset-0 bg-black/55 backdrop-blur-[3px] animate-[order-sheet-backdrop_180ms_ease-out]"
                onClick={handleMinimizeClick}
            ></button>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-[max(0.45rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
                <div ref={sheetRef} className="pointer-events-auto order-sheet-scroll w-full max-w-lg overflow-y-auto overscroll-contain rounded-[2rem] border border-brandGold/20 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.34)] animate-[order-sheet-rise_260ms_cubic-bezier(0.22,1,0.36,1)] dark:bg-[#11192c] max-h-[78vh] sm:max-h-[74vh] sm:max-w-xl" onClick={(event) => {
                    event.stopPropagation();
                }}>
                    <div className="order-sheet-drag-handle sticky top-0 z-20 border-b border-slate-200/80 bg-slate-50/94 px-4 pb-3 pt-3 backdrop-blur dark:border-white/10 dark:bg-[#11192c]/94 sm:px-5 sm:pb-4">
                        {summary.isCartFallback ? (
                            <div className="pointer-events-none absolute left-4 top-3 text-left sm:left-5">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brandGold sm:text-[11px] sm:tracking-[0.24em]">
                                    Cart Total
                                </p>
                                <p className="mt-1 whitespace-nowrap text-[14px] font-black leading-none text-slate-100 sm:text-[15px]" dir="rtl">
                                    إجمالي العربة
                                </p>
                            </div>
                        ) : null}

                        {summary.isCartFallback ? (
                            <p className="pointer-events-none absolute right-4 top-[0.95rem] text-right text-[1.3rem] font-black leading-none tracking-tight text-white sm:right-5 sm:text-[1.42rem]">
                                {formatPriceLabel(summary.nextCartSubtotal)}
                            </p>
                        ) : null}

                        <div className="flex flex-col items-center gap-2" onPointerDown={handlePointerStart}>
                            <span className="h-1.5 w-20 rounded-full bg-slate-300 dark:bg-white/15"></span>
                            <button
                                type="button"
                                aria-label="Minimize cart summary"
                                onClick={handleMinimizeClick}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-brandGold/15 bg-brandGold/8 text-brandGold transition-colors hover:bg-brandGold/15"
                            >
                                <i className="fa-solid fa-chevron-down text-[11px]"></i>
                            </button>
                        </div>

                    </div>

                    {summary.isCartFallback ? null : (
                        <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-4 dark:border-white/10 dark:bg-white/[0.04] sm:px-5 sm:py-5">
                            <div className="text-right">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brandGold sm:text-[11px] sm:tracking-[0.24em]">Order Review</p>
                                <h3 className="mt-2 text-[1.55rem] font-black text-brandBlue dark:text-white sm:text-2xl">
                                    {summary.wasExisting ? 'Quantity Updated' : 'Pack Added'}
                                </h3>
                                <p className="mt-2 text-[13px] leading-6 text-slate-500 dark:text-slate-300 sm:text-sm" dir="rtl">
                                    {summary.wasExisting
                                        ? 'تم تحديث الكمية داخل طلبك الحالي.'
                                        : 'تمت إضافة العبوة إلى طلبك بنجاح.'}
                                </p>
                            </div>
                            <button type="button" onClick={handleDismissClick} className="mt-4 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:text-red-500 dark:border-white/10 dark:bg-white/10 dark:text-white">
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    )}

                    <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5">
                    {summary.isCartFallback ? null : (
                        <div className="flex items-center gap-3 rounded-[1.35rem] border border-slate-200 bg-white p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[#141d32] sm:rounded-[1.6rem] sm:p-4">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-[#0d1426] sm:h-20 sm:w-20 sm:rounded-[1.2rem]">
                                <img src={summary.image} alt={summary.title} className="h-full w-full object-contain" />
                            </div>
                            <div className="min-w-0 flex-1 text-left" dir="ltr">
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:text-[11px] sm:tracking-[0.18em]">Order Summary</p>
                                <p className="mt-1 text-[13px] font-black leading-snug text-brandBlue dark:text-white sm:text-base">{summary.title}</p>
                                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-300" dir="rtl">
                                    إجمالي الكمية لهذا المنتج داخل العربة: {summary.nextQuantity}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-[0_14px_32px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#141d32]">
                        <div className="border-b border-slate-200 px-3.5 py-3 dark:border-white/10 sm:px-4 sm:py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[13px] font-black text-slate-900 dark:text-white sm:text-sm">{summary.isCartFallback ? 'Cart details' : 'Order details'}</p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-300" dir="rtl">{summary.isCartFallback ? 'تقدر تعدل الكمية أو تحذف أي منتج من هنا قبل إتمام الطلب.' : 'راجع الإضافة الجديدة قبل ما تفتح العربة أو تكمل التسوق.'}</p>
                                </div>
                                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-500/12 px-3 py-1.5 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:gap-2 sm:px-3.5 sm:py-2">
                                    <span className="text-[15px] font-black leading-none sm:text-base">{summary.isCartFallback ? summary.nextCartCount : `+${summary.addedQuantity}`}</span>
                                    <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.1em] leading-none sm:text-[11px] sm:tracking-[0.12em]">{summary.isCartFallback ? 'items' : 'pack'}</span>
                                </span>
                            </div>
                        </div>

                        {summary.isCartFallback ? (
                            <div className="divide-y divide-slate-200 dark:divide-white/10">
                                {summary.cartItems.map((item) => {
                                    const itemCartId = String(item?.cartId || item?.id || '').trim();
                                    const canRemoveItem = Boolean(itemCartId) && typeof onRemoveCartItem === 'function';
                                    const canDecreaseQuantity = Boolean(itemCartId) && typeof onUpdateCartItemQuantity === 'function' && Number(item?.quantity || 0) > 1;
                                    const canIncreaseQuantity = Boolean(itemCartId) && typeof onUpdateCartItemQuantity === 'function';

                                    return (
                                        <div key={itemCartId || item.id} className="px-3.5 py-3.5 text-sm sm:px-4 sm:py-4" dir="ltr">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[13px] font-bold text-slate-900 dark:text-white sm:text-sm" dir="auto">{item.title}</p>
                                                    <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-300 sm:text-[11px]">{formatPriceLabel(item.unitPrice)} / pack</p>

                                                    <div className="mt-3 flex items-end justify-between gap-3">
                                                        <div className="flex items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-white/10 dark:bg-[#0d1426] dark:shadow-none">
                                                            <button
                                                                type="button"
                                                                onClick={() => onUpdateCartItemQuantity(itemCartId, item.quantity - 1)}
                                                                disabled={!canDecreaseQuantity}
                                                                className="flex h-9 w-9 items-center justify-center text-[1rem] font-black text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-white dark:hover:bg-white/10 sm:h-10 sm:w-10 sm:text-lg"
                                                                aria-label={`Decrease quantity for ${item.title}`}
                                                            >
                                                                -
                                                            </button>
                                                            <span className="min-w-9 border-x border-slate-200 px-2.5 text-center text-[13px] font-black text-brandBlue dark:border-white/10 dark:text-white sm:min-w-10 sm:px-3 sm:text-sm">{item.quantity}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => onUpdateCartItemQuantity(itemCartId, item.quantity + 1)}
                                                                disabled={!canIncreaseQuantity}
                                                                className="flex h-9 w-9 items-center justify-center text-[1rem] font-black text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-white dark:hover:bg-white/10 sm:h-10 sm:w-10 sm:text-lg"
                                                                aria-label={`Increase quantity for ${item.title}`}
                                                            >
                                                                +
                                                            </button>
                                                        </div>

                                                        <div className="text-right">
                                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Line total</p>
                                                            <p className="mt-1 text-[13px] font-black text-slate-900 dark:text-white sm:text-sm">{formatPriceLabel(item.lineTotal)}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => onRemoveCartItem(itemCartId)}
                                                    disabled={!canRemoveItem}
                                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-400/25 bg-rose-500/10 text-rose-500 transition-colors hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-35 dark:border-rose-400/20 dark:text-rose-300 sm:h-10 sm:w-10"
                                                    aria-label={`Remove ${item.title} from cart`}
                                                >
                                                    <i className="fa-solid fa-trash-can text-sm"></i>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-200 dark:divide-white/10">
                                <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                                    <span className="text-slate-500 dark:text-slate-300">Pack price</span>
                                    <span className="font-black text-slate-900 dark:text-white">{formatPriceLabel(summary.unitPrice)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                                    <span className="text-slate-500 dark:text-slate-300">Added quantity</span>
                                    <span className="font-black text-slate-900 dark:text-white">{summary.addedQuantity}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                                    <span className="text-slate-500 dark:text-slate-300">Added total</span>
                                    <span className="font-black text-emerald-600 dark:text-emerald-300">{formatPriceLabel(summary.addedSubtotal)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                                    <span className="text-slate-500 dark:text-slate-300">Cart items</span>
                                    <span className="font-black text-slate-900 dark:text-white">{summary.nextCartCount}</span>
                                </div>
                            </div>
                        )}

                        {!summary.isCartFallback ? (
                            <div className="flex items-end justify-between gap-4 bg-slate-50 px-4 py-4 dark:bg-white/[0.04]">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Cart total</p>
                                    <p className="mt-1 text-2xl font-black text-brandBlue dark:text-white">{formatPriceLabel(summary.nextCartSubtotal)}</p>
                                </div>
                                <p className="max-w-[12rem] text-right text-xs leading-5 text-slate-500 dark:text-slate-300" dir="rtl">
                                    تقدر تكمل التسوق أو تفتح العربة علشان تراجع الطلب وتتممه.
                                </p>
                            </div>
                        ) : null}
                    </div>

                        <div className="sticky bottom-0 z-10 -mx-4 mt-1 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-[#11192c]/95 sm:-mx-5 sm:mt-2 sm:px-5 sm:py-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <button type="button" onClick={handleMinimizeClick} className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-black text-slate-700 transition-colors hover:border-brandGold hover:text-brandGold dark:border-white/10 dark:bg-[#141d32] dark:text-white sm:rounded-[1.2rem] sm:py-3 sm:text-sm">
                                Continue Shopping | كمل تسوق
                                </button>
                                <button type="button" onClick={handleCompleteOrderClick} className="rounded-[1.1rem] border border-brandGold bg-brandGold px-4 py-2.5 text-[13px] font-black text-brandBlue transition-colors hover:bg-[#e0bc46] sm:rounded-[1.2rem] sm:py-3 sm:text-sm">
                                Complete Order | اتمام الطلب
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ProductModal() {
    const { selectedProduct, setSelectedProduct, addToCart, addToWholesaleCart, isWholesaleCustomer, userRole, dcLiveUpdateAt, dcSyncedAt, refreshDcCatalog, allProducts, getProductStockLimit, getProductStockStatus, cartItems, cartCount, cartSubtotal, removeFromCart, updateCartQuantity, showToast } = useGallery();
    const { derivedSettings } = useSiteSettings();
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const lastSyncedShareCodeRef = useRef('');
    const dismissedShareCodeRef = useRef('');
    const { isCheckoutRouteLoading, pendingCheckoutHref, navigateToCheckout } = useCheckoutNavigation();
    const [retailOrderSheet, setRetailOrderSheet] = useState(null);
    const [isClientMounted, setIsClientMounted] = useState(false);
    const requestedShareCode = String(searchParams?.get('code') || '').trim();
    const selectedProductShareCode = getProductShareCode(selectedProduct);
    const activeRetailSummary = useMemo(() => {
        if (retailOrderSheet?.isCartFallback) {
            if (cartCount <= 0 && Array.isArray(retailOrderSheet.cartItems) && retailOrderSheet.cartItems.length > 0) {
                return {
                    ...retailOrderSheet,
                    cartItems: retailOrderSheet.cartItems,
                    isCartFallback: true
                };
            }

            return buildRetailCartSummary(cartItems, cartCount, cartSubtotal);
        }

        return buildRetailCartSummary(cartItems, cartCount, cartSubtotal, retailOrderSheet);
    }, [cartCount, cartItems, cartSubtotal, retailOrderSheet]);
    const shouldUseEmbeddedMobileProductBar = Boolean(
        isClientMounted
        &&
        selectedProduct
        && isCompactMobileViewport()
    );
    const isWholesaleCheckoutLoading = pendingCheckoutHref.includes('type=wholesale');

    useEffect(() => {
        setIsClientMounted(true);
    }, []);

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

    const closeModal = () => {
        dismissedShareCodeRef.current = requestedShareCode || selectedProductShareCode || lastSyncedShareCodeRef.current;
        lastSyncedShareCodeRef.current = '';
        replaceProductModalUrl(pathname, searchParams?.toString(), '');
        setSelectedProduct(null);
    };

    const dismissRetailOrderSheet = () => {
        setRetailOrderSheet(null);
    };

    const handleCompleteRetailOrder = () => {
        navigateToCheckout('/checkout');
    };

    if (!selectedProduct && !activeRetailSummary) return null;

    return (
        <>
            {selectedProduct ? (
                <ProductModalContent
                    key={selectedProduct.id || selectedProduct.code || selectedProduct.name}
                    selectedProduct={selectedProduct}
                    allProducts={allProducts}
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
                    updateCartQuantity={updateCartQuantity}
                    onSelectRelatedProduct={setSelectedProduct}
                    showToast={showToast}
                    setRetailOrderSheet={setRetailOrderSheet}
                />
            ) : null}

            {isClientMounted && !shouldUseEmbeddedMobileProductBar ? (
                <ProductOrderDecisionSheet
                    summary={activeRetailSummary}
                    onDismiss={dismissRetailOrderSheet}
                    onCompleteOrder={handleCompleteRetailOrder}
                    onRemoveCartItem={removeFromCart}
                    onUpdateCartItemQuantity={updateCartQuantity}
                    startMinimized={!retailOrderSheet}
                />
            ) : null}

            {isCheckoutRouteLoading ? (
                <BrandLoadingScreen
                    title={isWholesaleCheckoutLoading ? 'Loading wholesale checkout' : 'Loading checkout'}
                    message={isWholesaleCheckoutLoading ? 'جاري تجهيز صفحة مراجعة طلب الجملة قبل فتحها' : 'جاري تجهيز صفحة الـ checkout ومراجعة الطلب قبل فتحها'}
                    showProgressBar={false}
                />
            ) : null}
        </>
    );
}

function ProductModalContent({ selectedProduct, allProducts, closeModal, addToCart, addToWholesaleCart, isWholesaleCustomer, userRole, dcLiveUpdateAt, dcSyncedAt, getProductStockLimit, getProductStockStatus, cartItems, cartCount, cartSubtotal, updateCartQuantity, onSelectRelatedProduct, showToast, setRetailOrderSheet }) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [wholesaleQuantity, setWholesaleQuantity] = useState(1);
    const [showMobileVariantPicker, setShowMobileVariantPicker] = useState(false);
    const [showMobileRetailQuantityBar, setShowMobileRetailQuantityBar] = useState(false);
    const [isMobileRetailAddBarHidden, setIsMobileRetailAddBarHidden] = useState(false);
    const [isAddPackSectionHighlighted, setIsAddPackSectionHighlighted] = useState(false);
    const modalScrollContainerRef = useRef(null);
    const addPackSectionRef = useRef(null);
    const addPackHighlightTimeoutRef = useRef(null);
    const { siteSettings, derivedSettings } = useSiteSettings();
    const [showLiveIndicator, setShowLiveIndicator] = useState(false);
    const [lightboxState, setLightboxState] = useState({ isOpen: false, images: [], index: 0, title: '' });

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

    useEffect(() => {
        return () => {
            if (addPackHighlightTimeoutRef.current) {
                window.clearTimeout(addPackHighlightTimeoutRef.current);
            }
        };
    }, []);
    
    const fallbackDesc = selectedProduct.desc || selectedProduct.description || '';
    const productDisplayName = selectedProduct.title || selectedProduct.name || '';
    const productShareCode = getProductShareCode(selectedProduct);
    const productShareTitle = resolveModalProductTitle(selectedProduct, productDisplayName);

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

    const handleRetailAddWithConfirmation = (product, requestedQuantity, options = {}) => {
        if (!product) {
            return null;
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
            return {
                cartId,
                actualAddedQuantity,
                nextQuantity: existingQuantity,
                nextCartCount: cartCount,
                nextCartSubtotal: cartSubtotal
            };
        }

        const shouldSkipExpandedSummary = isCompactMobileViewport() || cartCount > 0;

        if (shouldSkipExpandedSummary) {
            setRetailOrderSheet(null);
            return {
                cartId,
                actualAddedQuantity,
                nextQuantity,
                nextCartCount,
                nextCartSubtotal
            };
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

        return {
            cartId,
            actualAddedQuantity,
            nextQuantity,
            nextCartCount,
            nextCartSubtotal
        };
    };

    const handleAddToCart = () => {
        handleRetailAddWithConfirmation(selectedProduct, quantity, {
            unitPrice: primaryDisplayPrice,
            image: currentMedia?.url || currentMedia,
            title: selectedProduct.title || selectedProduct.name
        });

        setShowMobileRetailQuantityBar(false);
    };

    const handleAddToWholesaleCart = () => {
        addToWholesaleCart(selectedProduct, wholesaleQuantity);
    };

    const scrollToAddPackSection = () => {
        setShowMobileRetailQuantityBar(false);
        setIsMobileRetailAddBarHidden(true);

        const addPackSection = addPackSectionRef.current;
        if (!addPackSection) {
            return;
        }

        const focusAddPackSection = () => {
            addPackSection.focus({ preventScroll: true });
            setIsAddPackSectionHighlighted(true);

            if (addPackHighlightTimeoutRef.current) {
                window.clearTimeout(addPackHighlightTimeoutRef.current);
            }

            addPackHighlightTimeoutRef.current = window.setTimeout(() => {
                setIsAddPackSectionHighlighted(false);
            }, 1800);
        };

        if (typeof window === 'undefined' || window.innerWidth >= 768) {
            addPackSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.setTimeout(focusAddPackSection, 360);
            return;
        }

        const scrollContainer = modalScrollContainerRef.current;
        if (!scrollContainer) {
            addPackSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.setTimeout(focusAddPackSection, 360);
            return;
        }

        const containerRect = scrollContainer.getBoundingClientRect();
        const sectionRect = addPackSection.getBoundingClientRect();
        const currentScrollTop = scrollContainer.scrollTop;
        const preferredTopOffset = Math.min(Math.max(containerRect.height * 0.24, 190), 240);
        const targetTop = currentScrollTop + (sectionRect.top - containerRect.top) - preferredTopOffset;

        scrollContainer.scrollTo({
            top: Math.max(0, targetTop),
            behavior: 'smooth'
        });

        window.setTimeout(focusAddPackSection, 360);
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
    const productModalRetailIncreasePercentage = parsePercentage(derivedSettings?.priceIncrease);

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
        const variantDisplayPrice = isStrictWholesaleUser
            ? variantNetPrice
            : getGlobalRetailDisplayPrice(variantRetailPrice, productModalRetailIncreasePercentage, userRole);
        
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
    const activeVariantCartId = hasVariants
        ? String(activeVariant?.id || activeVariant?.code || resolveModalProductTitle(activeVariant, activeVariantDisplayName)).trim()
        : '';
    const variantCartIds = hasVariants
        ? selectedProduct.variants.map((variantEntry, idx) => String(variantEntry?.id || variantEntry?.code || resolveModalProductTitle(variantEntry, variantEntry?.name || variantEntry?.label || `موديل ${idx + 1}`)).trim())
        : [];
    const mobileVariantCheckoutItem = hasVariants
        ? cartItems.find((item) => item.cartId === activeVariantCartId) || null
        : null;
    const hasAnyVariantInCart = hasVariants
        ? cartItems.some((item) => variantCartIds.includes(String(item?.cartId || '').trim()))
        : false;
    const activeVariantCode = String(activeVariant?.code || activeVariant?.barcode || '').trim();
    const activeVariantDescription = activeVariant?.desc || activeVariant?.description || fallbackDesc;
    const currentVariantImage = activeVariantImages[safeSubImageIndex] || '';
    const canSwipeMainGallery = images.length > 1 && images.every((entry) => (entry?.type || 'image') !== 'video');
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
    const adjustedRetailPriceValue = getGlobalRetailDisplayPrice(retailPriceValue, productModalRetailIncreasePercentage, userRole);
    const primaryDisplayPrice = isStrictWholesaleUser ? netPriceValue : adjustedRetailPriceValue;
    const canShowWholesaleOrder = isWholesaleCustomer && wholesalePriceValue > 0;

    const resolveStockLimit = (entry, orderType = 'retail') => getProductStockLimit(entry || {}, orderType);
    const resolveStockStatus = (entry, orderType = 'retail') => getProductStockStatus(entry || {}, orderType);

    const retailStockLimit = hasVariants ? resolveStockLimit(activeVariant, 'retail') : resolveStockLimit(selectedProduct, 'retail');
    const wholesaleStockLimit = hasVariants ? resolveStockLimit(activeVariant, 'wholesale') : resolveStockLimit(selectedProduct, 'wholesale');
    const retailStockStatus = hasVariants ? resolveStockStatus(activeVariant, 'retail') : resolveStockStatus(selectedProduct, 'retail');
    const wholesaleStockStatus = hasVariants ? resolveStockStatus(activeVariant, 'wholesale') : resolveStockStatus(selectedProduct, 'wholesale');
    const stockLimit = retailStockLimit;
    const normalizedStockStatus = retailStockStatus;
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
    const stockCaptionContent = buildWholesaleAvailabilityCaption({
        isStrictWholesaleUser,
        retailStockLimit,
        wholesaleStockLimit,
        fallbackCaption: stockCaption
    });
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
    const selectedProductIdentity = resolveRelatedProductIdentity(selectedProduct);
    const normalizedSelectedCategory = resolveNormalizedCategoryName(selectedProduct?.category);
    const { sameCategoryProducts, randomProducts } = useMemo(() => {
        const catalogProducts = Array.isArray(allProducts)
            ? allProducts.filter((product) => product && !product.isHidden)
            : [];
        const filteredCatalog = catalogProducts.filter((product) => {
            const candidateIdentity = resolveRelatedProductIdentity(product);
            return product !== selectedProduct && candidateIdentity && candidateIdentity !== selectedProductIdentity;
        });

        const sameCategoryCandidates = normalizedSelectedCategory
            ? filteredCatalog.filter((product) => resolveNormalizedCategoryName(product?.category) === normalizedSelectedCategory)
            : [];
        const sameCategoryProducts = getSeededProductOrder(
            sameCategoryCandidates,
            `${selectedProductIdentity}-same-category`
        ).slice(0, RELATED_PRODUCTS_LIMIT);
        const excludedProductIds = new Set([
            selectedProductIdentity,
            ...sameCategoryProducts.map((product) => resolveRelatedProductIdentity(product))
        ]);
        const randomProducts = getSeededProductOrder(
            filteredCatalog.filter((product) => !excludedProductIds.has(resolveRelatedProductIdentity(product))),
            `${selectedProductIdentity}-random-products`
        ).slice(0, RELATED_PRODUCTS_LIMIT);

        return {
            sameCategoryProducts,
            randomProducts
        };
    }, [allProducts, normalizedSelectedCategory, selectedProduct, selectedProductIdentity]);

    useEffect(() => {
        if (retailStockLimit !== null) {
            setQuantity((currentValue) => Math.min(Math.max(1, currentValue), retailStockLimit || 1));
        }

        if (wholesaleStockLimit !== null) {
            setWholesaleQuantity((currentValue) => Math.min(Math.max(1, currentValue), wholesaleStockLimit || 1));
        }
    }, [retailStockLimit, wholesaleStockLimit]);

    useEffect(() => {
        setShowMobileVariantPicker(false);
        setShowMobileRetailQuantityBar(false);
    }, [selectedProduct?.id, selectedProduct?.code, selectedProduct?.name]);

    useEffect(() => {
        if (!hasVariants) {
            return;
        }

        if (mobileVariantCheckoutItem) {
            setQuantity(Math.max(1, Number(mobileVariantCheckoutItem.quantity || 1)));
            return;
        }

        setQuantity(1);
    }, [activeVariantIndex, hasVariants, mobileVariantCheckoutItem]);

    const closeLightbox = () => {
        setLightboxState((currentValue) => ({ ...currentValue, isOpen: false }));
    };

    const handleLightboxIndexChange = (nextIndex) => {
        setLightboxState((currentValue) => ({
            ...currentValue,
            index: nextIndex
        }));
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

    const handleVariantGalleryIndexChange = (nextIndex) => {
        if (hasMultipleVariants) {
            handleActiveVariantChange(nextIndex);
            return;
        }

        setSubImageIndex(nextIndex);
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

    const renderMobileAnimatedVariantSelectorSection = (activeIndex, setActiveIndex) => (
        <div className="rounded-[1.7rem] border border-slate-200/70 bg-white/88 p-4 shadow-[0_20px_50px_rgba(148,163,184,0.12)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.04] md:p-5">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/45">Choose Variant | اختر الشكل</p>
            <div className="flex flex-wrap gap-2">
                {selectedProduct.variants.map((variantEntry, idx) => {
                    const availability = resolveStockStatus(variantEntry, 'retail') === 'out_of_stock'
                        || resolveStockLimit(variantEntry, 'retail') === 0
                        ? 'out'
                        : 'available';

                    return (
                        <button
                            key={idx}
                            onClick={() => setActiveIndex(idx)}
                            className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-bold transition-all ${
                                activeIndex === idx
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
    );

    const renderDesktopVariantSelectorSection = () => (
        <div className="rounded-[1.7rem] border border-slate-200/70 bg-white/88 p-4 shadow-[0_20px_50px_rgba(148,163,184,0.12)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.04] md:p-5">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/45">Choose Variant | اختر الشكل</p>
            <div className="flex flex-wrap gap-2">
                {selectedProduct.variants.map((variantEntry, idx) => {
                    const availability = resolveStockStatus(variantEntry, 'retail') === 'out_of_stock'
                        || resolveStockLimit(variantEntry, 'retail') === 0
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
    );

    const handleShareProduct = async () => {
        if (typeof window === 'undefined') {
            return;
        }

        const sharedProductId = String(selectedProduct?.id || '').trim();
        const shareCacheKey = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const sharePath = sharedProductId
            ? `/product/${encodeURIComponent(sharedProductId)}?wa_share=${encodeURIComponent(shareCacheKey)}`
            : buildProductModalUrl(
                window.location.pathname,
                window.location.search,
                productShareCode,
                window.location.hash
            );
        const shareUrl = `${window.location.origin}${sharePath}`;

        try {
            if (navigator.share) {
                await navigator.share({
                    url: shareUrl
                });
                return;
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                showToast?.('تم نسخ رابط المنتج بنجاح.');
                return;
            }

            window.prompt('Copy this product link:', shareUrl);
        } catch (error) {
            if (error?.name === 'AbortError') {
                return;
            }

            console.error('Failed to share product:', error);
            showToast?.('تعذر مشاركة المنتج حالياً.', 'error');
        }
    };

    const renderModalActionButtons = () => (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            <button
                type="button"
                onClick={handleShareProduct}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/55 text-gray-800 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 dark:border-white/10 dark:bg-white/10 dark:text-white"
                aria-label="Share product"
                title="Share product"
            >
                <i className="fa-solid fa-share-nodes"></i>
            </button>
            <button
                type="button"
                onClick={closeModal}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/55 text-gray-800 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 dark:border-white/10 dark:bg-white/10 dark:text-white"
                aria-label="Close product details"
                title="Close"
            >
                <i className="fa-solid fa-xmark"></i>
            </button>
        </div>
    );

    const handleRelatedProductSelect = (product) => {
        const nextIdentity = resolveRelatedProductIdentity(product);
        if (!nextIdentity || nextIdentity === selectedProductIdentity) {
            return;
        }

        setShowMobileVariantPicker(false);
        setShowMobileRetailQuantityBar(false);
        onSelectRelatedProduct?.(product);
    };

    const renderRelatedProductCard = (product, compact = false) => {
        const productTitle = resolveModalProductTitle(product, 'Product');
        const productImage = resolveModalProductImage(product);
        const productCodeLabel = String(getProductShareCode(product) || '').trim();
        const variantsCount = Array.isArray(product?.variants) ? product.variants.length : 0;
        const firstVariant = Array.isArray(product?.variants) && product.variants.length > 0 ? product.variants[0] : null;
        const productRetailPrice = parsePrice(
            product?.price
            || product?.retailPrice
            || product?.retail_price
            || firstVariant?.price
            || firstVariant?.retailPrice
            || firstVariant?.retail_price
        );
        const productWholesalePrice = parsePrice(
            product?.wholesalePrice
            || product?.wholesale_price
            || product?.cartonPrice
            || product?.wholesaleCartonPrice
            || product?.priceWholesale
            || product?.bulkPrice
            || product?.bulk_price
            || firstVariant?.wholesalePrice
            || firstVariant?.wholesale_price
            || firstVariant?.cartonPrice
            || firstVariant?.wholesaleCartonPrice
            || firstVariant?.priceWholesale
            || firstVariant?.bulkPrice
            || firstVariant?.bulk_price
        );
        const productDiscountValue = parsePrice(
            product?.discountAmount
            || product?.discount_amount
            || product?.discount
            || product?.discountValue
            || firstVariant?.discountAmount
            || firstVariant?.discount_amount
            || firstVariant?.discount
            || firstVariant?.discountValue
        );
        const productExplicitNetPrice = parsePrice(
            product?.netPrice
            || product?.net_price
            || product?.net
            || firstVariant?.netPrice
            || firstVariant?.net_price
            || firstVariant?.net
        );
        const productNetPrice = productExplicitNetPrice > 0 ? productExplicitNetPrice : Math.max(0, productRetailPrice - productDiscountValue);
        const productDisplayPrice = isStrictWholesaleUser
            ? productNetPrice
            : getGlobalRetailDisplayPrice(productRetailPrice, productModalRetailIncreasePercentage, userRole);
        const productStockOrderType = isStrictWholesaleUser ? 'wholesale' : 'retail';
        const productStockStatus = resolveStockStatus(product, productStockOrderType);
        const productStockLimit = resolveStockLimit(product, productStockOrderType);
        const isProductOutOfStock = productStockStatus === 'out_of_stock' || productStockLimit === 0;
        const productStatusLabel = isProductOutOfStock
            ? 'Out | غير متوفر'
            : productStockStatus === 'low_stock'
                ? 'Low | محدود'
                : 'In Stock | متوفر';
        const productStatusClasses = isProductOutOfStock
            ? 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-300'
            : productStockStatus === 'low_stock'
                ? 'border-amber-400/25 bg-amber-400/15 text-amber-700 dark:text-amber-200'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
        const cardWidthClass = compact ? 'w-[172px] sm:w-[188px]' : 'w-[210px] md:w-[228px]';
        const cardImageHeightClass = compact ? 'h-32 sm:h-36' : 'h-36 md:h-40';

        return (
            <button
                key={resolveRelatedProductIdentity(product)}
                type="button"
                onClick={() => handleRelatedProductSelect(product)}
                className={`${cardWidthClass} group flex-none rounded-[1.6rem] border border-slate-200/70 bg-white/90 p-3 text-left shadow-[0_18px_45px_rgba(148,163,184,0.14)] transition-all duration-300 hover:-translate-y-1 hover:border-brandGold/45 hover:shadow-[0_24px_55px_rgba(212,175,55,0.18)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_18px_50px_rgba(2,6,23,0.28)]`}
            >
                <div className={`relative mb-3 overflow-hidden rounded-[1.2rem] bg-slate-100 dark:bg-slate-950/70 ${cardImageHeightClass}`}>
                    <img
                        src={productImage}
                        alt={productTitle}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                    />

                    {variantsCount > 1 ? (
                        <span className="absolute left-3 top-3 rounded-full border border-white/60 bg-white/85 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-brandBlue shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/75 dark:text-white">
                            {variantsCount} موديلات
                        </span>
                    ) : null}

                    <span className={`absolute bottom-3 right-3 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] backdrop-blur-sm ${productStatusClasses}`}>
                        {productStatusLabel}
                    </span>
                </div>

                <div className="space-y-2" dir="rtl">
                    <h4 className="line-clamp-2 text-sm font-black leading-6 text-brandBlue dark:text-white" dir="auto">
                        {productTitle}
                    </h4>

                    {product.category ? (
                        <p className="line-clamp-1 text-[11px] font-bold text-slate-500 dark:text-white/55" dir="auto">
                            {product.category}
                        </p>
                    ) : null}

                    <div className="flex items-end justify-between gap-3" dir="ltr">
                        <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/40">Price | السعر</p>
                            <p className="mt-1 line-clamp-1 text-sm font-black text-brandGold dark:text-brandGold">
                                {productDisplayPrice > 0 ? formatPriceLabel(productDisplayPrice) : 'اسألنا'}
                            </p>
                            {isStrictWholesaleUser && productWholesalePrice > 0 ? (
                                <p className="mt-1 text-[10px] font-bold text-slate-500 dark:text-white/55">
                                    Wholesale: {formatPriceLabel(productWholesalePrice)}
                                </p>
                            ) : null}
                        </div>

                        {productCodeLabel ? (
                            <span className="max-w-[6.5rem] truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55">
                                {productCodeLabel}
                            </span>
                        ) : null}
                    </div>
                </div>
            </button>
        );
    };

    const renderRelatedProductsRow = ({ eyebrow, title, badge, products, emptyMessage, compact = false }) => (
        <section className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brandGold/80">{eyebrow}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-brandBlue dark:text-white md:text-[1.35rem]">{title}</h3>
                        {badge ? (
                            <span className="rounded-full border border-brandGold/20 bg-brandGold/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-brandGold">
                                {badge}
                            </span>
                        ) : null}
                    </div>
                </div>

                {products.length > 0 ? (
                    <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/45">
                        {products.length} items
                    </span>
                ) : null}
            </div>

            {products.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto hide-scroll pb-2">
                    {products.map((product) => renderRelatedProductCard(product, compact))}
                </div>
            ) : (
                <div className="rounded-[1.4rem] border border-dashed border-slate-300/80 bg-white/70 p-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
                    {emptyMessage}
                </div>
            )}
        </section>
    );

    const renderRelatedProductsSection = ({ compact = false, className = '' } = {}) => {
        if (sameCategoryProducts.length === 0 && randomProducts.length === 0) {
            return null;
        }

        return (
            <div className={`rounded-[1.9rem] border border-slate-200/70 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4 shadow-[0_22px_60px_rgba(148,163,184,0.12)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.14),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] dark:shadow-[0_22px_60px_rgba(2,6,23,0.34)] md:p-5 ${className}`}>
                <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brandGold/80">More To Explore</p>
                        <h2 className="mt-2 text-[1.2rem] font-black text-brandBlue dark:text-white md:text-[1.45rem]">منتجات ممكن تعجبك</h2>
                    </div>
                    <span className="rounded-full border border-brandGold/20 bg-brandGold/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-brandGold">
                        2 rows
                    </span>
                </div>

                <div className="space-y-6">
                    {renderRelatedProductsRow({
                        eyebrow: 'Same Category',
                        title: 'من نفس التصنيف',
                        badge: selectedProduct.category || null,
                        products: sameCategoryProducts,
                        emptyMessage: 'لا يوجد منتجات إضافية من نفس التصنيف حالياً.',
                        compact
                    })}

                    {renderRelatedProductsRow({
                        eyebrow: 'Random Products',
                        title: 'منتجات عشوائية',
                        badge: null,
                        products: randomProducts,
                        emptyMessage: 'لا يوجد منتجات عشوائية إضافية حالياً.',
                        compact
                    })}
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

    const handleMobileVariantAddToCart = () => {
        if (!activeVariant) {
            return;
        }

        handleRetailAddWithConfirmation(activeVariant, quantity, {
            unitPrice: primaryDisplayPrice,
            image: currentVariantImage,
            title: activeVariantDisplayName
        });

        setShowMobileVariantPicker(false);
    };

    const handleMobileVariantCheckoutQuantityChange = (delta) => {
        if (!mobileVariantCheckoutItem) {
            return;
        }

        const nextQuantity = Math.max(0, Number(mobileVariantCheckoutItem.quantity || 1) + delta);
        updateCartQuantity(mobileVariantCheckoutItem.cartId, nextQuantity);
        setQuantity(nextQuantity > 0 ? nextQuantity : 1);
    };

    const handleMobileVariantViewCart = () => {
        const cartSummary = buildRetailCartSummary(cartItems, cartCount, cartSubtotal);

        if (!cartSummary) {
            return;
        }

        setRetailOrderSheet(cartSummary);
        closeModal();
    };

    const handleMobileVariantPrimaryAction = () => {
        if (hasAnyVariantInCart) {
            handleMobileVariantAddToCart();
            return;
        }

        setShowMobileVariantPicker(true);
    };

    const handleMobileRetailViewCart = () => {
        const confirmation = handleRetailAddWithConfirmation(selectedProduct, quantity, {
            unitPrice: primaryDisplayPrice,
            image: currentMedia?.url || currentMedia,
            title: selectedProduct.title || selectedProduct.name
        });

        if (!confirmation) {
            return;
        }

        const targetCartId = String(
            confirmation.cartId
            || selectedProduct?.id
            || selectedProduct?.code
            || selectedProduct?.title
            || selectedProduct?.name
            || 'cart-item'
        ).trim();
        const resolvedTitle = resolveModalProductTitle(selectedProduct, selectedProduct?.title || selectedProduct?.name);
        const resolvedImage = resolveModalProductImage(selectedProduct, currentMedia?.url || currentMedia);
        const resolvedUnitPrice = parsePrice(primaryDisplayPrice);
        const normalizedCartLines = cartItems.map((item) => {
            const itemCartId = String(item?.cartId || item?.id || item?.code || item?.title || item?.name || '').trim();
            const quantityValue = itemCartId === targetCartId
                ? confirmation.nextQuantity
                : Number(item?.quantity || 0);
            const unitPriceValue = itemCartId === targetCartId
                ? resolvedUnitPrice
                : parsePrice(item?.price);

            return {
                id: String(item?.cartId || item?.id || item?.code || item?.title || item?.name || targetCartId),
                cartId: itemCartId || targetCartId,
                title: itemCartId === targetCartId
                    ? resolvedTitle
                    : String(item?.title || item?.name || 'Cart item').trim() || 'Cart item',
                quantity: quantityValue,
                unitPrice: unitPriceValue,
                lineTotal: quantityValue > 0 ? unitPriceValue * quantityValue : unitPriceValue
            };
        });
        const targetLineExists = normalizedCartLines.some((item) => item.id === targetCartId);

        if (!targetLineExists && confirmation.nextQuantity > 0) {
            normalizedCartLines.push({
                id: targetCartId,
                cartId: targetCartId,
                title: resolvedTitle,
                quantity: confirmation.nextQuantity,
                unitPrice: resolvedUnitPrice,
                lineTotal: resolvedUnitPrice * confirmation.nextQuantity
            });
        }

        setRetailOrderSheet({
            title: resolvedTitle,
            image: resolvedImage,
            addedQuantity: confirmation.actualAddedQuantity || quantity,
            nextQuantity: confirmation.nextQuantity,
            unitPrice: resolvedUnitPrice,
            addedSubtotal: resolvedUnitPrice * Math.max(1, confirmation.actualAddedQuantity || quantity),
            nextCartCount: confirmation.nextCartCount,
            nextCartSubtotal: confirmation.nextCartSubtotal,
            wasExisting: true,
            cartItems: normalizedCartLines,
            isCartFallback: true
        });
        setShowMobileRetailQuantityBar(false);
        closeModal();
    };

    const renderMobileRetailAddBar = () => {
        if (hasVariants) {
            return null;
        }

        if (isMobileRetailAddBarHidden) {
            return null;
        }

        if (showMobileRetailQuantityBar) {
            return (
                <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[140] px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] md:hidden">
                    <div className="mx-auto w-full max-w-3xl">
                        <div className="pointer-events-auto animate-[order-sheet-rise_260ms_cubic-bezier(0.22,1,0.36,1)] rounded-[1.8rem] border border-brandGold/20 bg-[#11192c] px-3 py-3 shadow-[0_26px_70px_rgba(15,23,42,0.42)]">
                            <div className="flex items-center gap-3" dir="ltr">
                                <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-slate-300 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                                    <button
                                        type="button"
                                        onClick={decreaseQuantity}
                                        className="flex h-14 w-12 items-center justify-center text-[1.6rem] font-black leading-none text-slate-900 transition-colors hover:bg-slate-100"
                                        aria-label="Decrease quantity"
                                    >
                                        -
                                    </button>
                                    <span className="flex h-14 min-w-14 items-center justify-center border-x border-slate-200 px-4 text-[1.35rem] font-black leading-none text-slate-900">
                                        {quantity}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={increaseQuantity}
                                        className="flex h-14 w-12 items-center justify-center text-[1.6rem] font-black leading-none text-slate-900 transition-colors hover:bg-slate-100"
                                        aria-label="Increase quantity"
                                    >
                                        +
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleMobileRetailViewCart}
                                    disabled={retailOutOfStock}
                                    className="flex-1 rounded-full bg-[linear-gradient(135deg,#f59e0b,#f97316)] px-5 py-4 text-center text-[1rem] font-black text-white shadow-[0_20px_45px_rgba(249,115,22,0.28)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {retailOutOfStock ? 'غير متوفر حالياً' : 'View cart'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[140] px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] md:hidden">
                <div className="mx-auto w-full max-w-3xl">
                    <button
                        type="button"
                        onClick={scrollToAddPackSection}
                        disabled={retailOutOfStock}
                        className="attention-vibrate pointer-events-auto w-full rounded-full bg-[linear-gradient(135deg,#f59e0b,#f97316)] px-5 py-4 text-sm font-black tracking-[0.04em] text-white shadow-[0_22px_55px_rgba(249,115,22,0.3)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {retailOutOfStock ? 'غير متوفر حالياً' : 'Add to cart | اضف للعربة'}
                    </button>
                </div>
            </div>
        );
    };

    const renderMobileVariantCheckoutBar = () => {
        if (!mobileVariantCheckoutItem || showMobileVariantPicker) {
            return null;
        }

        return (
            <div className="pointer-events-auto animate-[order-sheet-rise_260ms_cubic-bezier(0.22,1,0.36,1)] rounded-[1.8rem] border border-brandGold/20 bg-[#11192c] px-3 py-3 shadow-[0_26px_70px_rgba(15,23,42,0.42)]">
                <div className="flex items-center gap-3" dir="ltr">
                    <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-slate-300 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                        <button
                            type="button"
                            onClick={() => handleMobileVariantCheckoutQuantityChange(-1)}
                            className="flex h-14 w-14 items-center justify-center text-[1.9rem] font-black leading-none text-slate-900 transition-colors hover:bg-slate-100"
                            aria-label="Decrease quantity"
                        >
                            -
                        </button>
                        <span className="flex h-14 min-w-14 items-center justify-center border-x border-slate-200 px-4 text-[1.6rem] font-black leading-none text-slate-900">
                            {mobileVariantCheckoutItem.quantity}
                        </span>
                        <button
                            type="button"
                            onClick={() => handleMobileVariantCheckoutQuantityChange(1)}
                            className="flex h-14 w-14 items-center justify-center text-[1.9rem] font-black leading-none text-slate-900 transition-colors hover:bg-slate-100"
                            aria-label="Increase quantity"
                        >
                            +
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleMobileVariantViewCart}
                        className="flex-1 rounded-full bg-[linear-gradient(135deg,#f59e0b,#f97316)] px-5 py-4 text-center text-[1.05rem] font-black text-white shadow-[0_20px_45px_rgba(249,115,22,0.28)] transition-transform hover:-translate-y-0.5"
                    >
                        View cart
                    </button>
                </div>
            </div>
        );
    };

    const renderMobileVariantPicker = () => {
        if (!hasVariants) {
            return null;
        }

        return (
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[140] px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] md:hidden">
                <div className="mx-auto w-full max-w-3xl space-y-3">
                    <div className={`overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.3)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-white/10 dark:bg-[#0f172a] ${showMobileVariantPicker ? 'pointer-events-auto translate-y-0 opacity-100 animate-[order-sheet-rise_260ms_cubic-bezier(0.22,1,0.36,1)]' : 'pointer-events-none translate-y-[115%] opacity-0'}`}>
                            <div className="flex items-start gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10" dir="ltr">
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1rem] border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-[#0d1426]">
                                    <img src={currentVariantImage || '/logo.png'} alt={activeVariantDisplayName} className="h-full w-full object-contain" />
                                </div>
                                <div className="min-w-0 flex-1 text-left">
                                    <p className="truncate text-[1.05rem] font-black text-slate-900 dark:text-white">{selectedProduct.title || selectedProduct.name}</p>
                                    <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-300">{activeVariantDisplayName}</p>
                                    <p className="mt-2 text-[1.55rem] font-black leading-none text-brandBlue dark:text-white">{formatPriceLabel(primaryDisplayPrice)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowMobileVariantPicker(false)}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:text-red-500 dark:border-white/10 dark:bg-white/10 dark:text-white"
                                    aria-label="Close variant picker"
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>

                            <div className="hide-scroll max-h-[58vh] overflow-y-auto px-4 pb-4 pt-4">
                                <div className="space-y-5">
                                    <div>
                                        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/45">Choose option | اختر الشكل / اللون</p>
                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                            {selectedProduct.variants.map((variantEntry, idx) => {
                                                const variantStatus = resolveStockStatus(variantEntry, 'retail');
                                                const variantLimit = resolveStockLimit(variantEntry, 'retail');
                                                const isAvailable = !(variantStatus === 'out_of_stock' || variantLimit === 0);
                                                const variantImage = getVariantAllImages(variantEntry)[0] || currentVariantImage || '/logo.png';

                                                return (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => handleActiveVariantChange(idx)}
                                                        className={`overflow-hidden rounded-[1.35rem] border-2 text-left transition-all ${activeVariantIndex === idx ? 'border-brandGold bg-brandGold/8 shadow-[0_18px_36px_rgba(212,175,55,0.2)]' : 'border-slate-200 bg-white hover:border-brandGold/45 dark:border-white/10 dark:bg-white/[0.04]'} ${isAvailable ? '' : 'opacity-60'}`}
                                                        dir="ltr"
                                                    >
                                                        <div className="aspect-square w-full overflow-hidden bg-slate-50 dark:bg-[#0d1426]">
                                                            <img src={variantImage} alt={variantEntry.name || variantEntry.label || `Variant ${idx + 1}`} className="h-full w-full object-cover" />
                                                        </div>
                                                        <div className="px-3 py-3">
                                                            <p className="truncate text-sm font-black text-slate-900 dark:text-white">{variantEntry.name || variantEntry.label || `موديل ${idx + 1}`}</p>
                                                            <div className="mt-2 flex items-center gap-2 text-[11px] font-bold">
                                                                <span className={`h-2.5 w-2.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                                <span className={isAvailable ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-500 dark:text-rose-300'}>{isAvailable ? 'Available' : 'Out'}</span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                </div>
                            </div>

                            <div className="border-t border-slate-200/80 p-4 dark:border-white/10">
                                <div className="space-y-3">
                                    {showStockLimitMessage ? (
                                        <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-center text-[11px] font-bold text-amber-600 dark:text-amber-300">
                                            وصلت للكمية المتاحة حالياً: {retailStockLimit}
                                        </p>
                                    ) : null}

                                    <div className="flex items-center gap-3" dir="ltr">
                                        <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-emerald-500/20 bg-emerald-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-emerald-500/10">
                                            <button
                                                type="button"
                                                onClick={decreaseQuantity}
                                                className="flex h-14 w-12 items-center justify-center text-[1.6rem] font-black leading-none text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-300"
                                                aria-label="Decrease quantity"
                                            >
                                                -
                                            </button>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                value={quantity}
                                                onChange={handleQuantityInputChange}
                                                className="h-14 w-16 border-x border-emerald-500/15 bg-transparent px-2 text-center text-lg font-black text-slate-900 outline-none dark:text-white"
                                                aria-label="Unit quantity"
                                            />
                                            <button
                                                type="button"
                                                onClick={increaseQuantity}
                                                className="flex h-14 w-12 items-center justify-center text-[1.6rem] font-black leading-none text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-300"
                                                aria-label="Increase quantity"
                                            >
                                                +
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleMobileVariantAddToCart}
                                            disabled={retailOutOfStock}
                                            className="flex-1 rounded-full bg-[linear-gradient(135deg,#f59e0b,#f97316)] px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_20px_45px_rgba(249,115,22,0.28)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {retailOutOfStock ? 'غير متوفر حالياً' : 'ADD PACK | اضف عبوة'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                    </div>

                    {!showMobileVariantPicker && !mobileVariantCheckoutItem ? (
                        <button
                            type="button"
                            onClick={handleMobileVariantPrimaryAction}
                            className="attention-vibrate pointer-events-auto w-full rounded-full bg-[linear-gradient(135deg,#f59e0b,#f97316)] px-5 py-4 text-sm font-black tracking-[0.04em] text-white shadow-[0_22px_55px_rgba(249,115,22,0.3)] transition-transform hover:-translate-y-0.5"
                        >
                            {hasAnyVariantInCart ? 'Add to cart | اضف للعربة' : 'Select an option | اختر الشكل / اللون'}
                        </button>
                    ) : null}

                    {renderMobileVariantCheckoutBar()}
                </div>
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
        const variantDisplayPrice = isStrictWholesaleUser
            ? variantNetPrice
            : getGlobalRetailDisplayPrice(variantRetailPrice, productModalRetailIncreasePercentage, userRole);
        const getVariantAvailability = (candidateVariant) => {
            const candidateStatus = resolveStockStatus(candidateVariant, 'retail');
            const candidateStockLimit = resolveStockLimit(candidateVariant, 'retail');

            if (candidateStatus === 'out_of_stock') return 'out';
            if (candidateStockLimit === 0) return 'out';
            return 'available';
        };
        const variantRetailStockLimit = resolveStockLimit(variant, 'retail');
        const variantWholesaleStockLimit = resolveStockLimit(variant, 'wholesale');
        const variantRetailStockStatus = resolveStockStatus(variant, 'retail');
        const variantWholesaleStockStatus = resolveStockStatus(variant, 'wholesale');
        const variantStockLimit = variantRetailStockLimit;
        const variantNormalizedStockStatus = variantRetailStockStatus;
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
        const variantStockCaptionContent = buildWholesaleAvailabilityCaption({
            isStrictWholesaleUser,
            retailStockLimit: variantRetailStockLimit,
            wholesaleStockLimit: variantWholesaleStockLimit,
            fallbackCaption: variantStockCaption
        });
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
                        value={variantDisplayPrice > 0 ? `${variantDisplayPrice.toLocaleString()} ج.م` : 'تواصل معنا لمعرفة السعر'}
                        valueClassName={variantDisplayPrice > 0 ? 'text-brandBlue dark:text-white' : 'text-slate-500 dark:text-white/65'}
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
                        caption={variantStockCaptionContent}
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
                                unitPrice: variantDisplayPrice,
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
            <div key={selectedProduct.id || selectedProduct.code || selectedProduct.name} className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6 md:overflow-hidden" dir="rtl">
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                    onClick={closeModal}
                ></div>

                <div className="relative my-auto hidden w-full max-w-5xl flex-col rounded-[2rem] bg-white shadow-2xl transition-all dark:bg-darkCard md:flex md:max-h-[94vh] md:overflow-x-hidden md:overflow-y-auto md:rounded-3xl">
                    {renderModalActionButtons()}

                    <div className="md:flex md:flex-row">
                        <div className="relative flex w-full flex-col border-b border-slate-200/70 bg-gradient-to-b from-slate-100 via-white to-slate-100 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 md:w-3/5 md:border-b-0 md:border-l">
                            <div className="relative flex h-[26rem] shrink-0 items-center justify-center overflow-hidden px-6 pb-24 pt-16 md:h-[31rem] md:min-h-0 md:pb-6 lg:h-[35rem]">
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
                                <div className="relative z-10 h-full w-full">
                                    <SwipeableLoopCarousel
                                        itemCount={hasMultipleVariants ? selectedProduct.variants.length : activeVariantImages.length}
                                        activeIndex={hasMultipleVariants ? activeVariantIndex : safeSubImageIndex}
                                        onIndexChange={handleVariantGalleryIndexChange}
                                        onActiveSlideClick={() => openLightbox(activeVariantImages, safeSubImageIndex, activeVariantDisplayName)}
                                        activeSlideAriaLabel="Open variant image fullscreen"
                                        trackClassName="items-center"
                                        slideClassName="flex items-center justify-center"
                                        renderSlide={(itemIndex, { isActive }) => {
                                            const slideImage = hasMultipleVariants
                                                ? (itemIndex === activeVariantIndex
                                                    ? currentVariantImage
                                                    : (getVariantAllImages(selectedProduct.variants[itemIndex])[0] || currentVariantImage || '/logo.png'))
                                                : (activeVariantImages[itemIndex] || '/logo.png');
                                            const slideTitle = hasMultipleVariants
                                                ? (selectedProduct.variants[itemIndex]?.name || selectedProduct.variants[itemIndex]?.label || `موديل ${itemIndex + 1}`)
                                                : activeVariantDisplayName;

                                            return (
                                                <div className={`flex h-full w-full items-center justify-center rounded-[1.9rem] border border-white/45 bg-white/80 p-3 shadow-[0_24px_80px_rgba(148,163,184,0.16)] backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04] ${isActive ? 'cursor-zoom-in' : 'cursor-grab active:cursor-grabbing'}`}>
                                                    <img
                                                        src={slideImage}
                                                        alt={slideTitle}
                                                        draggable={false}
                                                        className="h-full w-full rounded-[1.45rem] object-contain object-top"
                                                    />
                                                </div>
                                            );
                                        }}
                                    />
                                </div>
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

                            <div className="px-4 pb-4 md:px-6 md:pb-5">
                                {renderDesktopVariantSelectorSection()}
                            </div>
                        </div>

                        <div className="flex w-full flex-col p-6 md:w-2/5 md:p-8">
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
                                caption={stockCaptionContent}
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

                    <div className="hidden shrink-0 border-t border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/45 md:block">
                        {renderRelatedProductsSection()}
                    </div>
                </div>

                <div className="relative my-auto w-full max-w-6xl rounded-[2rem] border border-slate-200/70 bg-white shadow-2xl transition-all dark:border-white/10 dark:bg-darkCard md:hidden sm:max-h-[92vh] sm:overflow-hidden">
                    {renderModalActionButtons()}

                    <div className="hide-scroll flex w-full flex-col pb-28 sm:h-full sm:overflow-y-auto sm:pb-32">
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
                                renderMobileBeforeContent={(idx, setActiveIndex) => (
                                    <div dir="rtl" className="space-y-4">
                                        {renderMobileAnimatedVariantSelectorSection(idx, setActiveIndex)}
                                        {renderVariantGallerySection()}
                                    </div>
                                )}
                                containerClassName="max-w-none px-2 py-4 md:px-8 md:py-8"
                                mediaFrameClassName="rounded-[2.2rem] p-1.5 sm:p-2"
                                mediaViewportClassName="h-[26rem] sm:h-[30rem] md:h-[28rem]"
                                imageButtonClassName="rounded-[1.85rem] p-1 sm:p-1.5"
                                imageClassName="h-full w-full rounded-[1.55rem] object-contain object-center"
                                showCount
                                renderExtra={(idx, setActiveIndex) => (
                                    <div dir="rtl">
                                        {renderVariantsExtra(idx, setActiveIndex)}
                                    </div>
                                )}
                            />
                        </div>

                        <div className="px-4 pb-4 md:px-8">
                            {renderRelatedProductsSection({ compact: true })}
                        </div>
                    </div>
                    {renderMobileVariantPicker()}
                </div>

            </div>
        );
    }

    return (
        <div ref={modalScrollContainerRef} key={selectedProduct.id || selectedProduct.code || selectedProduct.name} className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-6 md:overflow-hidden" dir="rtl">
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={closeModal}
            ></div>
            
            <div className="relative my-auto flex w-full max-w-5xl flex-col rounded-[2rem] bg-white shadow-2xl transition-all dark:bg-darkCard md:max-h-[94vh] md:overflow-x-hidden md:overflow-y-auto md:rounded-3xl">
                {renderModalActionButtons()}

                <div className="flex flex-col md:flex-row">
                {/* Media Section */}
                <div className="relative flex w-full flex-col border-b border-slate-200/70 bg-gradient-to-b from-slate-100 via-white to-slate-100 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 md:w-3/5 md:border-b-0 md:border-l">
                    <div className="relative flex h-[82svh] min-h-[36rem] max-h-[52rem] shrink-0 items-center justify-center overflow-hidden px-1 pb-2 pt-10 sm:h-[84svh] md:h-[31rem] md:min-h-0 md:max-h-none md:px-6 md:pb-6 lg:h-[35rem]">
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
                            canSwipeMainGallery ? (
                                <div className="relative z-10 h-full w-full">
                                    <SwipeableLoopCarousel
                                        itemCount={images.length}
                                        activeIndex={safeImageIndex}
                                        onIndexChange={setCurrentImageIndex}
                                        onActiveSlideClick={(itemIndex) => openLightbox(images, itemIndex, selectedProduct.title || selectedProduct.name || '')}
                                        activeSlideAriaLabel="Open product image fullscreen"
                                        trackClassName="items-center"
                                        slideClassName="flex items-center justify-center"
                                        renderSlide={(itemIndex, { isActive }) => {
                                            const mediaEntry = images[itemIndex];
                                            const mediaUrl = mediaEntry?.url || mediaEntry;

                                            return (
                                                <div className={`flex h-full w-full items-center justify-center rounded-[2.05rem] border border-white/45 bg-white/80 p-1.5 shadow-[0_24px_80px_rgba(148,163,184,0.16)] backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04] md:rounded-[1.9rem] md:p-3 ${isActive ? 'cursor-zoom-in' : 'cursor-grab active:cursor-grabbing'}`}>
                                                    <img
                                                        src={mediaUrl}
                                                        alt={selectedProduct.title || selectedProduct.name}
                                                        draggable={false}
                                                        className="h-full w-full rounded-[1.7rem] object-contain object-center md:rounded-[1.45rem] md:object-top"
                                                    />
                                                </div>
                                            );
                                        }}
                                    />
                                </div>
                            ) : currentMedia.type === 'video' ? (
                                <video 
                                    src={currentMedia.url} 
                                    controls 
                                    autoPlay 
                                    loop 
                                    className="relative z-10 h-full w-full rounded-[1.9rem] border border-white/40 bg-white/75 object-contain p-1.5 shadow-[0_24px_80px_rgba(148,163,184,0.16)] backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04] md:rounded-[1.75rem] md:p-3"
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => openLightbox(images, safeImageIndex, selectedProduct.title || selectedProduct.name || '')}
                                    className="relative z-10 flex h-full w-full items-center justify-center rounded-[2.05rem] border border-white/45 bg-white/80 p-1.5 shadow-[0_24px_80px_rgba(148,163,184,0.16)] backdrop-blur-sm focus:outline-none dark:border-white/10 dark:bg-white/[0.04] md:rounded-[1.9rem] md:p-3"
                                    aria-label="Open product image fullscreen"
                                >
                                    <img 
                                        src={currentMedia.url || currentMedia} 
                                        alt={selectedProduct.title || selectedProduct.name}
                                        className="h-full w-full rounded-[1.7rem] object-contain object-center cursor-zoom-in md:rounded-[1.45rem] md:object-top"
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
                        <div className="relative z-20 px-1 pb-3 pt-3 md:static md:bottom-auto md:left-auto md:right-auto md:bg-slate-100/80 md:p-3 dark:md:bg-slate-950/70">
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
                <div className="flex w-full flex-col p-5 pb-28 md:w-2/5 md:p-8">
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
                                caption={stockCaptionContent}
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

                        <div
                            ref={addPackSectionRef}
                            tabIndex={-1}
                            className={`rounded-[1.4rem] border border-green-500/20 bg-green-500/5 p-4 transition-[box-shadow,border-color,transform,background-color] duration-300 focus:outline-none dark:bg-green-500/10 ${isAddPackSectionHighlighted ? 'relative z-10 border-brandGold/75 bg-[linear-gradient(135deg,rgba(21,128,61,0.2),rgba(5,46,22,0.92))] shadow-[0_0_0_9999px_rgba(2,6,23,0.46),0_0_0_3px_rgba(212,175,55,0.34),0_0_40px_rgba(212,175,55,0.28),0_28px_70px_rgba(15,23,42,0.4)] -translate-y-1' : ''}`}
                        >
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

                        <div className="md:hidden">
                            {renderRelatedProductsSection({ compact: true, className: 'mt-3' })}
                        </div>
                    </div>
                </div>
                </div>

                <div className="hidden shrink-0 border-t border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/45 md:block">
                    {renderRelatedProductsSection()}
                </div>

            </div>
            {!lightboxState.isOpen ? renderMobileRetailAddBar() : null}
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
                            {lightboxState.images.length > 1 ? (
                                <SwipeableLoopCarousel
                                    itemCount={lightboxState.images.length}
                                    activeIndex={lightboxState.index}
                                    onIndexChange={handleLightboxIndexChange}
                                    className="w-full"
                                    viewportClassName="w-full"
                                    trackClassName="items-center"
                                    slideClassName="flex items-center justify-center px-2 md:px-3"
                                    renderSlide={(itemIndex) => (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <img
                                                src={lightboxState.images[itemIndex]}
                                                alt={lightboxState.title || 'Fullscreen product image'}
                                                draggable={false}
                                                className="max-h-[78vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_20px_80px_rgba(0,0,0,0.55)]"
                                            />
                                        </div>
                                    )}
                                />
                            ) : (
                                <img
                                    src={lightboxState.images[lightboxState.index]}
                                    alt={lightboxState.title || 'Fullscreen product image'}
                                    className="max-h-[78vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_20px_80px_rgba(0,0,0,0.55)]"
                                />
                            )}

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