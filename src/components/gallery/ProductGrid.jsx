'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGallery } from '@/contexts/GalleryContext';
import AdminProductModal from '@/components/admin/AdminProductModal';
import { isAdminRole, normalizeUserRole, USER_ROLE_VALUES } from '@/lib/user-roles';

const ARABIC_TEXT_PATTERN = /[\u0600-\u06FF]/;
const LATIN_TEXT_PATTERN = /[A-Za-z]/;
const LIVE_INDICATOR_DURATION_MS = 8000;
const INITIAL_CATEGORY_ROWS = 3;
const CATEGORY_ROWS_STORAGE_KEY = 'gallery-visible-category-rows';
const EDIT_SCROLL_POSITION_STORAGE_KEY = 'gallery-edit-scroll-position';
const EDIT_SCROLL_RESTORE_STORAGE_KEY = 'gallery-edit-restore-scroll';
const SHOW_MORE_ARABIC_LINES = [
    'لسه في مفاجأت',
    'خبينا الباقي هنا',
    'لسه في احلى',
    'اكتشف الباقي',
    'لسه في اكتر'
];

function splitBilingualLabel(value) {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
        return { english: '', arabic: '', fallback: '' };
    }

    const segments = normalizedValue.split('|').map((segment) => segment.trim()).filter(Boolean);
    const searchPool = segments.length > 0 ? segments : [normalizedValue];
    const arabic = searchPool.find((segment) => ARABIC_TEXT_PATTERN.test(segment)) || '';
    const english = searchPool.find((segment) => LATIN_TEXT_PATTERN.test(segment)) || '';

    if (english || arabic) {
        return {
            english,
            arabic,
            fallback: searchPool.find((segment) => segment !== english && segment !== arabic) || ''
        };
    }

    return { english: '', arabic: '', fallback: normalizedValue };
}

function parsePrice(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
}

function getRetailPrice(product) {
    return parsePrice(product?.price || product?.retailPrice || product?.retail_price);
}

function getWholesalePrice(product) {
    return parsePrice(
        product?.wholesalePrice
        || product?.wholesale_price
        || product?.cartonPrice
        || product?.wholesaleCartonPrice
        || product?.priceWholesale
        || product?.bulkPrice
        || product?.bulk_price
    );
}

function getDiscountValue(product) {
    return parsePrice(
        product?.discountAmount
        || product?.discount_amount
        || product?.discount
        || product?.discountValue
    );
}

function getNetPrice(product) {
    const explicitNet = parsePrice(product?.netPrice || product?.net_price || product?.net);
    if (explicitNet > 0) return explicitNet;
    return Math.max(0, getRetailPrice(product) - getDiscountValue(product));
}

function getQuickAddEntry(product, variants = []) {
    return variants.length === 1 ? variants[0] : product;
}

function getQuickAddCartId(entry) {
    return entry?.id || entry?.code || entry?.title || entry?.name || 'Unnamed Product';
}

export default function ProductGrid() {
    const {
        filteredProducts,
        categories,
        brands,
        isLoading,
        setSelectedProduct,
        activeCategory,
        activeFilterChips,
        userRole,
        dcLiveUpdateAt,
        getProductStockLimit,
        getProductStockStatus,
        addToCart,
        addToWholesaleCart,
        cartItems,
        wholesaleCartItems,
        updateCartQuantity,
        updateWholesaleCartQuantity,
        removeFromCart,
        removeFromWholesaleCart
    } = useGallery();
    const [flippedCards, setFlippedCards] = useState({});
    const [showLiveIndicator, setShowLiveIndicator] = useState(false);
    const [visibleCategoryRows, setVisibleCategoryRows] = useState(INITIAL_CATEGORY_ROWS);
    const [productRowScrollState, setProductRowScrollState] = useState({});
    const [selectedShowMoreArabicLine] = useState(() => SHOW_MORE_ARABIC_LINES[
        Math.floor(Math.random() * SHOW_MORE_ARABIC_LINES.length)
    ]);
    const [editingProduct, setEditingProduct] = useState(null);
    const savedScrollPositionRef = useRef(0);
    const shouldRestoreScrollRef = useRef(false);
    const productRowRefs = useRef({});

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
    }, [userRole, dcLiveUpdateAt]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const shouldUseStoredRows = activeCategory === 'All' && activeFilterChips.length === 0;
        if (!shouldUseStoredRows) {
            window.sessionStorage.removeItem(CATEGORY_ROWS_STORAGE_KEY);
            setVisibleCategoryRows(INITIAL_CATEGORY_ROWS);
            return;
        }

        const storedRows = Number(window.sessionStorage.getItem(CATEGORY_ROWS_STORAGE_KEY));
        if (Number.isFinite(storedRows) && storedRows >= INITIAL_CATEGORY_ROWS) {
            setVisibleCategoryRows(storedRows);
            return;
        }

        setVisibleCategoryRows(INITIAL_CATEGORY_ROWS);
    }, [activeCategory, activeFilterChips]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (activeCategory === 'All' && activeFilterChips.length === 0) {
            window.sessionStorage.setItem(CATEGORY_ROWS_STORAGE_KEY, String(visibleCategoryRows));
            return;
        }

        window.sessionStorage.removeItem(CATEGORY_ROWS_STORAGE_KEY);
    }, [activeCategory, activeFilterChips, visibleCategoryRows]);

    useEffect(() => {
        if (editingProduct) {
            return undefined;
        }

        const shouldRestoreFromSession = typeof window !== 'undefined'
            && window.sessionStorage.getItem(EDIT_SCROLL_RESTORE_STORAGE_KEY) === 'true';

        if (!shouldRestoreScrollRef.current && !shouldRestoreFromSession) {
            return undefined;
        }

        shouldRestoreScrollRef.current = false;
        if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(EDIT_SCROLL_RESTORE_STORAGE_KEY);
        }

        const storedScrollY = typeof window !== 'undefined'
            ? Number(window.sessionStorage.getItem(EDIT_SCROLL_POSITION_STORAGE_KEY))
            : NaN;
        const targetScrollY = Number.isFinite(storedScrollY) ? storedScrollY : savedScrollPositionRef.current;

        const restoreScroll = () => window.scrollTo({ top: targetScrollY, left: 0, behavior: 'auto' });
        const animationFrameId = window.requestAnimationFrame(() => {
            restoreScroll();
            window.requestAnimationFrame(restoreScroll);
        });
        const timeoutId = window.setTimeout(restoreScroll, 180);
        const timeoutIdLate = window.setTimeout(restoreScroll, 420);

        return () => {
            window.cancelAnimationFrame(animationFrameId);
            window.clearTimeout(timeoutId);
            window.clearTimeout(timeoutIdLate);
        };
    }, [editingProduct, filteredProducts]);

    const getImageUrl = (product) => {
        const firstImage = Array.isArray(product.images) ? product.images[0] : null;
        if (!firstImage) return '';
        return firstImage.url || firstImage.primaryUrl || firstImage;
    };

    const getMetaParts = (product) => {
        return [product.brand].filter(Boolean);
    };

    const getVariantEntries = (product) => {
        return Array.isArray(product.variants) ? product.variants.filter(Boolean) : [];
    };

    const getVariantLabel = (variant, index) => {
        return variant?.name || variant?.label || variant?.title || `Variant ${index + 1}`;
    };

    const getVariantImageUrl = (variant) => {
        if (variant?.image) return variant.image;

        if (Array.isArray(variant?.images) && variant.images.length > 0) {
            const firstImage = variant.images[0];
            return firstImage?.url || firstImage?.primaryUrl || firstImage;
        }

        if (Array.isArray(variant?.media) && variant.media.length > 0) {
            const firstMedia = variant.media[0];
            return firstMedia?.url || firstMedia?.primaryUrl || firstMedia;
        }

        return '';
    };

    const toggleCardFlip = (productId, event) => {
        event.stopPropagation();
        setFlippedCards((currentState) => ({
            ...currentState,
            [productId]: !currentState[productId]
        }));
    };

    const openProductDetails = (product, event) => {
        if (event) event.stopPropagation();
        setSelectedProduct(product);
    };

    const openProductEditor = (product, event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        savedScrollPositionRef.current = window.scrollY || window.pageYOffset || 0;
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(EDIT_SCROLL_POSITION_STORAGE_KEY, String(savedScrollPositionRef.current));
            window.sessionStorage.setItem(CATEGORY_ROWS_STORAGE_KEY, String(visibleCategoryRows));
            window.sessionStorage.removeItem(EDIT_SCROLL_RESTORE_STORAGE_KEY);
        }
        shouldRestoreScrollRef.current = false;
        setSelectedProduct(null);
        setEditingProduct(product || null);
    };

    const closeProductEditor = () => {
        shouldRestoreScrollRef.current = true;
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(EDIT_SCROLL_RESTORE_STORAGE_KEY, 'true');
            window.sessionStorage.setItem(EDIT_SCROLL_POSITION_STORAGE_KEY, String(savedScrollPositionRef.current));
            window.sessionStorage.setItem(CATEGORY_ROWS_STORAGE_KEY, String(visibleCategoryRows));
        }
        setEditingProduct(null);
    };

    const renderQuickAddControl = ({
        label,
        quantity = 0,
        stockLimit = null,
        onAdd,
        onIncrease,
        onDecrease,
        onRemove,
        tone = 'retail',
        pinLayout = false
    }) => {
        const isAtStockLimit = stockLimit !== null && quantity >= stockLimit;
        const toneClasses = tone === 'wholesale'
            ? {
                shell: 'border-brandGold bg-white dark:bg-gray-900',
                action: 'text-brandBlue dark:text-white hover:bg-brandGold/10',
                iconButton: 'text-brandGold hover:text-brandGold/80',
                icon: 'box'
            }
            : {
                shell: 'border-emerald-500 bg-white dark:bg-gray-900',
                action: 'text-brandBlue dark:text-white hover:bg-emerald-500/10',
                iconButton: 'text-emerald-400 hover:text-emerald-300',
                icon: 'cart'
            };

        const handleAction = (event, callback) => {
            event.preventDefault();
            event.stopPropagation();
            callback();
        };

        return (
            <div dir="ltr" className={`flex flex-col gap-1.5 ${pinLayout ? 'w-[9.75rem] items-start' : 'min-w-[3rem] items-stretch'}`}>
                {quantity > 0 ? (
                    <div
                        dir="ltr"
                        className={`flex h-10 items-center overflow-hidden rounded-full border shadow-sm md:h-11 ${pinLayout ? 'w-full' : ''} ${toneClasses.shell}`}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                    >
                        <button
                            type="button"
                            onClick={(event) => handleAction(event, onIncrease)}
                            disabled={isAtStockLimit}
                            aria-label="Increase quantity"
                            className={`flex h-full w-12 items-center justify-center text-lg font-black transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${toneClasses.action}`}
                        >
                            <i className="fa-solid fa-plus"></i>
                        </button>
                        <span className="flex h-full min-w-12 items-center justify-center border-x border-slate-200 px-3 text-lg font-black text-brandBlue dark:border-white/10 dark:text-white">
                            {quantity}
                        </span>
                        {quantity <= 1 ? (
                            <button
                                type="button"
                                onClick={(event) => handleAction(event, onRemove)}
                                aria-label="Remove from cart"
                                className="flex h-full w-12 items-center justify-center text-xl font-black text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                            >
                                <i className="fa-solid fa-trash-can"></i>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={(event) => handleAction(event, onDecrease)}
                                aria-label="Decrease quantity"
                                className={`flex h-full w-12 items-center justify-center text-xl font-black transition-colors ${toneClasses.action}`}
                            >
                                <i className="fa-solid fa-minus"></i>
                            </button>
                        )}
                    </div>
                ) : label ? (
                    <button
                        type="button"
                        onClick={(event) => handleAction(event, onAdd)}
                        title={label}
                        aria-label={label}
                        className={`relative flex h-11 w-11 items-center justify-center text-sm font-black transition-all duration-300 hover:scale-[1.06] md:h-12 md:w-12 ${pinLayout ? 'self-start' : ''} ${toneClasses.iconButton}`}
                    >
                        {toneClasses.icon === 'box' ? (
                            <img src="/icons/add-to-cart-wholesale.svg" alt="Add wholesale" className="h-7 w-7 object-contain md:h-8 md:w-8" />
                        ) : (
                            <img src="/icons/add-to-cart-retail.svg" alt="Add to cart" className="h-7 w-7 object-contain md:h-8 md:w-8" />
                        )}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={(event) => handleAction(event, onAdd)}
                        title="Quick add to cart"
                        aria-label="Quick add to cart"
                        className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gray-50 dark:bg-gray-800/50 hover:bg-brandGold hover:text-white text-gray-400 flex items-center justify-center transition-all duration-300 shadow-sm border border-gray-100 dark:border-gray-800 focus:scale-95 group/btn self-end"
                    >
                        <i className="fa-solid fa-plus text-base md:text-lg group-hover/btn:scale-110 transition-transform duration-300"></i>
                    </button>
                )}
            </div>
        );
    };

    const handleProductCardClick = (product, event) => {
        const target = event?.target;
        if (target instanceof HTMLElement && target.closest('button')) {
            return;
        }

        openProductDetails(product, event);
    };

    const handleQuickAdd = (product, variants, event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const selectedEntry = variants.length === 1 ? variants[0] : product;

        if (isStrictWholesaleUser) {
            addToWholesaleCart(selectedEntry, 1);
            return;
        }

        addToCart(selectedEntry, 1);
    };

    const productSections = useMemo(() => {
        const availableCategoryNames = Array.from(new Set(
            filteredProducts
                .map((product) => String(product.category || '').trim() || 'Uncategorized')
                .filter(Boolean)
        ));

        const orderedCategoryNames = [
            ...categories
                .map((category) => String(category?.name || '').trim())
                .filter((name) => name && availableCategoryNames.includes(name)),
            ...availableCategoryNames.filter((name) => !categories.some((category) => String(category?.name || '').trim() === name))
        ];

        return orderedCategoryNames
            .map((categoryName) => ({
                categoryName,
                products: filteredProducts.filter((product) => (String(product.category || '').trim() || 'Uncategorized') === categoryName)
            }))
            .filter((section) => section.products.length > 0);
    }, [categories, filteredProducts]);

    const shouldUseCategoryRows = activeCategory === 'All' && activeFilterChips.length === 0;
    const visibleSections = shouldUseCategoryRows
        ? productSections.slice(0, visibleCategoryRows)
        : productSections;
    const trackedProductRowNames = useMemo(
        () => (shouldUseCategoryRows ? productSections.slice(0, visibleCategoryRows) : productSections)
            .map((section) => section.categoryName),
        [shouldUseCategoryRows, productSections, visibleCategoryRows]
    );
    const hasMoreCategoryRows = shouldUseCategoryRows && productSections.length > visibleCategoryRows;
    const isAdminUser = isAdminRole(userRole);
    const isStrictWholesaleUser = normalizeUserRole(userRole) === USER_ROLE_VALUES.CST_WHOLESALE;
    const shouldShowWholesaleSummary = isStrictWholesaleUser || isAdminUser;

    useEffect(() => {
        if (!shouldUseCategoryRows || typeof window === 'undefined') {
            return undefined;
        }

        const updateRowScrollState = (categoryName) => {
            const container = productRowRefs.current[categoryName];
            if (!container) {
                return;
            }

            const nextCanScrollLeft = container.scrollLeft > 10;
            const nextCanScrollRight = container.scrollLeft + container.clientWidth < container.scrollWidth - 10;

            setProductRowScrollState((currentState) => {
                const previousState = currentState[categoryName];
                if (
                    previousState
                    && previousState.canScrollLeft === nextCanScrollLeft
                    && previousState.canScrollRight === nextCanScrollRight
                ) {
                    return currentState;
                }

                return {
                    ...currentState,
                    [categoryName]: {
                        canScrollLeft: nextCanScrollLeft,
                        canScrollRight: nextCanScrollRight
                    }
                };
            });
        };

        const handleResize = () => {
            trackedProductRowNames.forEach((categoryName) => updateRowScrollState(categoryName));
        };

        const cleanupCallbacks = trackedProductRowNames.flatMap((categoryName) => {
            const container = productRowRefs.current[categoryName];
            if (!container) {
                return [];
            }

            const handleScroll = () => updateRowScrollState(categoryName);
            handleScroll();
            container.addEventListener('scroll', handleScroll, { passive: true });

            return [() => container.removeEventListener('scroll', handleScroll)];
        });

        handleResize();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cleanupCallbacks.forEach((cleanup) => cleanup());
        };
    }, [shouldUseCategoryRows, trackedProductRowNames]);

    const setProductRowRef = (categoryName, node) => {
        if (node) {
            productRowRefs.current[categoryName] = node;
            return;
        }

        delete productRowRefs.current[categoryName];
    };

    const scrollProductRow = (categoryName, direction) => {
        const container = productRowRefs.current[categoryName];
        if (!container) {
            return;
        }

        container.scrollBy({ left: direction * 340, behavior: 'smooth' });
    };

    const getStockBadge = (stockStatus, isHidden, remainingQuantity) => {
        if (isHidden) return null;
        if (stockStatus === 'in_stock') {
            return (
                <div className="absolute top-4 right-4 z-20 px-3 py-1 text-xs font-bold text-white bg-[#0f9d58] rounded-full shadow-sm flex items-center gap-1.5" dir="rtl">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                    متوفر
                </div>
            );
        } else if (stockStatus === 'low_stock') {
            return (
                <div className="absolute top-4 right-4 z-20 px-3 py-1 text-xs font-bold text-[#856404] bg-[#fff3cd] border border-[#ffeeba] rounded-full shadow-sm flex items-center gap-1.5" dir="rtl">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    آخر {remainingQuantity} قطع!
                </div>
            );
        } else if (stockStatus === 'out_of_stock') {
            return (
                <div className="absolute top-4 right-4 z-20 px-3 py-1 text-xs font-bold text-white bg-[#dc3545] rounded-full shadow-sm flex items-center gap-1.5" dir="rtl">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    نفدت الكمية
                </div>
            );
        }
        return null;
    };

    if (isLoading) {
        return (
            <div className="space-y-10 md:space-y-12">
                {[1, 2, 3].map((sectionIndex) => (
                    <div key={sectionIndex} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="h-7 w-40 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                            <div className="h-6 w-14 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                        </div>
                        <div className="flex gap-6 overflow-x-auto hide-scroll pb-2">
                            {[1, 2, 3, 4].map((cardIndex) => (
                                <div key={`${sectionIndex}-${cardIndex}`} className="w-[240px] md:w-[270px] flex-none">
                                    <div className="group relative bg-white dark:bg-darkCard rounded-[2rem] p-4 flex flex-col justify-between border border-gray-100 dark:border-gray-800 animate-pulse min-h-[28rem]">
                                        <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 rounded-[1.5rem] mb-4"></div>
                                        <div className="space-y-3">
                                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (filteredProducts.length === 0) {
        return (
            <div className="text-center py-20 opacity-60">
                <i className="fa-solid fa-box-open text-6xl mb-4 text-gray-400 dark:text-gray-500"></i>
                <h3 className="text-2xl font-bold font-mona mb-2 text-gray-700 dark:text-gray-300">لا توجد منتجات</h3>
                <p className="text-gray-500 dark:text-gray-400">لم يتم العثور على منتجات تطابق بحثك أو ضمن هذا التصنيف.</p>
            </div>
        );
    }

    const renderProductCard = (product) => {
        const productId = product.id || product.code || product.name;
        const stockOrderType = isStrictWholesaleUser ? 'wholesale' : 'retail';
        const stockStatus = getProductStockStatus(product, stockOrderType);
        const topBadgeStockStatus = isStrictWholesaleUser
            ? getProductStockStatus(product, 'retail')
            : stockStatus;
        const isHidden = product.isHidden || false;
        const remainingQuantity = getProductStockLimit(product, stockOrderType) || 0;
        const topBadgeRemainingQuantity = isStrictWholesaleUser
            ? (getProductStockLimit(product, 'retail') || 0)
            : remainingQuantity;
        const imageUrl = getImageUrl(product);
        const metaParts = getMetaParts(product);
        const variants = getVariantEntries(product);
        const quickAddEntry = getQuickAddEntry(product, variants);
        const quickAddCartId = getQuickAddCartId(quickAddEntry);
        const retailQuickAddItem = cartItems.find((item) => item.cartId === quickAddCartId) || null;
        const wholesaleQuickAddItem = wholesaleCartItems.find((item) => item.cartId === quickAddCartId) || null;
        const retailQuickAddQuantity = Number(retailQuickAddItem?.quantity || 0);
        const wholesaleQuickAddQuantity = Number(wholesaleQuickAddItem?.quantity || 0);
        const retailQuickAddStockLimit = getProductStockLimit(quickAddEntry, 'retail');
        const wholesaleQuickAddStockLimit = getProductStockLimit(quickAddEntry, 'wholesale');
        const showRetailQuickAddControl = retailQuickAddQuantity > 0 || retailQuickAddStockLimit !== 0;
        const showWholesaleQuickAddControl = wholesaleQuickAddQuantity > 0 || wholesaleQuickAddStockLimit !== 0;
        const hasVariants = variants.length > 0;
        const isFlipped = Boolean(flippedCards[productId]);
        const retailPrice = getRetailPrice(product);
        const wholesalePrice = getWholesalePrice(product);
        const discountValue = getDiscountValue(product);
        const netPrice = getNetPrice(product);
        const primaryDisplayPrice = isStrictWholesaleUser ? netPrice : retailPrice;

        return (
            <div 
                key={productId}
                className="group relative mb-4 [perspective:1800px]"
            >
                {hasVariants && (
                    <>
                        <div className="absolute inset-0 top-3 left-3 bg-white/50 dark:bg-darkCard/50 border border-gray-100 dark:border-gray-800 rounded-[2rem] shadow-sm transform -rotate-3 -z-10 transition-transform duration-500 group-hover:-rotate-6"></div>
                        <div className="absolute inset-0 top-6 left-6 bg-white/30 dark:bg-darkCard/30 border border-gray-100 dark:border-gray-800 rounded-[2rem] shadow-sm transform -rotate-6 -z-20 transition-transform duration-500 group-hover:-rotate-12"></div>
                    </>
                )}
                <div className={`relative min-h-[28rem] sm:min-h-[30rem] md:min-h-[32rem] transition-transform duration-700 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
                    <div 
                        onClick={(event) => handleProductCardClick(product, event)}
                        className={`absolute inset-0 rounded-[2rem] bg-white dark:bg-darkCard p-4 flex flex-col justify-between shadow-sm hover:shadow-2xl hover:shadow-brandGold/10 transition-all duration-500 border border-gray-100 hover:border-brandGold/30 dark:border-gray-800/80 hover:-translate-y-2 cursor-pointer [backface-visibility:hidden]
                        ${topBadgeStockStatus === 'out_of_stock' ? 'opacity-80 grayscale-[20%]' : ''}`}
                    >
                        {getStockBadge(topBadgeStockStatus, isHidden, topBadgeRemainingQuantity)}

                        {isAdminUser ? (
                            <button
                                type="button"
                                onClick={(event) => openProductEditor(product, event)}
                                onTouchEnd={(event) => openProductEditor(product, event)}
                                title="Edit product"
                                aria-label="Edit product"
                                className="absolute right-4 top-16 z-30 inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-full border border-brandGold/35 bg-white/90 text-brandBlue shadow-lg backdrop-blur-md transition-all hover:border-brandGold hover:bg-brandGold hover:text-white dark:bg-black/70 dark:text-white"
                            >
                                <i className="fa-solid fa-pen-to-square text-[11px]"></i>
                            </button>
                        ) : null}

                        {hasVariants && (
                            <button
                                type="button"
                                onClick={(event) => toggleCardFlip(productId, event)}
                                title={`${variants.length} variants`}
                                aria-label={`Show ${variants.length} variants`}
                                className="absolute top-4 left-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-brandGold/30 bg-white/90 text-brandBlue shadow-lg backdrop-blur-md transition-all hover:border-brandGold hover:bg-brandGold hover:text-white dark:bg-black/70 dark:text-white"
                            >
                                <i className="fa-solid fa-arrows-rotate text-[10px]"></i>
                            </button>
                        )}

                        <div className="relative w-full aspect-[2/3] rounded-[1.5rem] overflow-hidden mb-6 bg-gray-50 dark:bg-gray-800/50">
                            {imageUrl ? (
                                <img 
                                    src={imageUrl}
                                    alt={product.title || product.name} 
                                    className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-110"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400">
                                    <i className="fa-regular fa-image text-4xl hidden sm:block"></i>
                                </div>
                            )}

                            {product.images && product.images.length > 1 && (
                                <div className="absolute bottom-4 right-4 bg-white/90 dark:bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg">
                                    <i className="fa-solid fa-images text-gray-600 dark:text-gray-300"></i>
                                    <span className="text-gray-900 dark:text-white">+{product.images.length - 1}</span>
                                </div>
                            )}
                            
                            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden md:block"></div>
                            
                            <div className="absolute bottom-6 left-0 right-0 px-6 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 hidden md:block">
                                <button className="w-full bg-white text-gray-900 font-bold py-3.5 rounded-xl shadow-xl flex items-center justify-center gap-2 hover:bg-brandGold hover:text-white transition-colors">
                                    <i className="fa-regular fa-eye"></i>
                                    عرض التفاصيل
                                </button>
                            </div>
                        </div>

                        <div>
                            <div className="title-container">
                                <h3 className="title-slide font-bold text-gray-900 dark:text-white text-lg md:text-xl mb-2 leading-tight group-hover:text-brandGold transition-colors" dir="rtl">
                                    {product.title || product.name}
                                </h3>
                            </div>

                            {metaParts.length > 0 && (
                                <div className="product-card-meta-row justify-center -mx-1 px-0" dir="rtl">
                                    <div className="product-card-label w-full max-w-none justify-center px-1 text-center">
                                        <div className="product-card-label-content justify-center">
                                            {metaParts.map((part, index) => (
                                                <span key={`${productId}-${part}`} className={`product-card-label-part ${index === 0 ? 'is-primary' : ''}`}>
                                                    {index > 0 && <span className="product-card-label-separator">•</span>}
                                                    {(() => {
                                                        const labelParts = splitBilingualLabel(part);

                                                        return (
                                                            <span className="product-card-label-text">
                                                                {labelParts.english ? (
                                                                    <bdi className="product-card-label-token is-latin" dir="ltr">{labelParts.english}</bdi>
                                                                ) : null}
                                                                {labelParts.english && labelParts.arabic ? (
                                                                    <span className="product-card-label-inline-separator" aria-hidden="true">|</span>
                                                                ) : null}
                                                                {labelParts.arabic ? (
                                                                    <bdi className="product-card-label-token is-arabic" dir="rtl">{labelParts.arabic}</bdi>
                                                                ) : null}
                                                                {labelParts.fallback && !labelParts.english && !labelParts.arabic ? (
                                                                    <bdi className="product-card-label-token" dir="auto">{labelParts.fallback}</bdi>
                                                                ) : null}
                                                            </span>
                                                        );
                                                    })()}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex items-center justify-between mt-4" dir="rtl">
                                <div>
                                    <span className="text-gray-400 text-[10px] md:text-xs font-medium mb-1 uppercase tracking-widest block hidden md:block">السعر</span>
                                    {showLiveIndicator ? (
                                        <span className="mb-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">
                                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"></span>
                                            DC Live Update
                                        </span>
                                    ) : null}
                                    {primaryDisplayPrice > 0 ? (
                                        <div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="font-black text-gray-900 dark:text-white text-xl md:text-2xl tracking-tight">{primaryDisplayPrice.toLocaleString()}</span>
                                                <span className="text-brandGold font-bold text-xs md:text-sm">ج.م</span>
                                                {isAdminUser ? (
                                                    <span className="ml-2 text-lg font-black text-red-500 md:text-xl">
                                                        {discountValue > 0 ? discountValue.toLocaleString() : '0'}
                                                    </span>
                                                ) : null}
                                            </div>
                                            {shouldShowWholesaleSummary ? (
                                                <div className="mt-1">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brandGold">Wholesale | سعر الكرتونة</p>
                                                    <p className="mt-1 text-sm font-black text-brandGold">
                                                        {wholesalePrice > 0 ? `${wholesalePrice.toLocaleString()} ج.م` : 'غير متاح'}
                                                    </p>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <span className="font-bold text-brandGold text-sm">تواصل معنا</span>
                                    )}
                                </div>
                                
                                {isStrictWholesaleUser ? (
                                    <div className="flex flex-col items-stretch gap-2">
                                        {showRetailQuickAddControl ? renderQuickAddControl({
                                            label: 'Retail | قطاعي',
                                            quantity: retailQuickAddQuantity,
                                            stockLimit: retailQuickAddStockLimit,
                                            onAdd: () => addToCart(quickAddEntry, 1),
                                            onIncrease: () => updateCartQuantity(quickAddCartId, retailQuickAddQuantity + 1),
                                            onDecrease: () => updateCartQuantity(quickAddCartId, retailQuickAddQuantity - 1),
                                            onRemove: () => removeFromCart(quickAddCartId),
                                            tone: 'retail',
                                            pinLayout: true
                                        }) : null}
                                        {showWholesaleQuickAddControl ? renderQuickAddControl({
                                            label: 'Wholesale | كرتونة',
                                            quantity: wholesaleQuickAddQuantity,
                                            stockLimit: wholesaleQuickAddStockLimit,
                                            onAdd: () => addToWholesaleCart(quickAddEntry, 1),
                                            onIncrease: () => updateWholesaleCartQuantity(quickAddCartId, wholesaleQuickAddQuantity + 1),
                                            onDecrease: () => updateWholesaleCartQuantity(quickAddCartId, wholesaleQuickAddQuantity - 1),
                                            onRemove: () => removeFromWholesaleCart(quickAddCartId),
                                            tone: 'wholesale',
                                            pinLayout: true
                                        }) : null}
                                    </div>
                                ) : (
                                    showRetailQuickAddControl ? renderQuickAddControl({
                                        label: 'Retail | قطاعي',
                                        quantity: retailQuickAddQuantity,
                                        stockLimit: retailQuickAddStockLimit,
                                        onAdd: () => handleQuickAdd(product, variants),
                                        onIncrease: () => updateCartQuantity(quickAddCartId, retailQuickAddQuantity + 1),
                                        onDecrease: () => updateCartQuantity(quickAddCartId, retailQuickAddQuantity - 1),
                                        onRemove: () => removeFromCart(quickAddCartId),
                                        tone: 'retail'
                                    }) : null
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="absolute inset-0 rounded-[2rem] bg-[#121926] p-4 text-white shadow-2xl border border-brandGold/25 [transform:rotateY(180deg)] [backface-visibility:hidden]">
                        <div className="relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_42%),linear-gradient(160deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-5">
                            <button
                                type="button"
                                onClick={(event) => toggleCardFlip(productId, event)}
                                className="absolute top-4 left-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:border-brandGold hover:bg-brandGold hover:text-brandBlue"
                            >
                                <i className="fa-solid fa-rotate-left"></i>
                            </button>

                            <div className="pr-10 text-right" dir="rtl">
                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-brandGold">Variant Stack</p>
                                <h3 className="mt-2 text-xl font-black leading-tight text-white">{product.title || product.name}</h3>
                                <p className="mt-2 text-sm text-white/70">هذا المنتج متوفر بعدة اختيارات. اقلب الكارت لاستعراض سريع قبل فتح التفاصيل.</p>
                            </div>

                            <div className="variant-stack-scroll mt-5 min-h-0 flex-1 overflow-y-auto pr-1.5">
                                <div className="grid grid-cols-2 gap-3">
                                    {variants.map((variant, index) => {
                                        const variantLabel = getVariantLabel(variant, index);
                                        const variantImageUrl = getVariantImageUrl(variant);
                                        const variantCode = variant?.barcode || variant?.code || '';

                                        return (
                                            <div key={`${productId}-variant-${index}`} className="rounded-2xl border border-white/10 bg-white/6 p-2.5 backdrop-blur-sm">
                                                <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-[1rem] bg-white/8">
                                                    {variantImageUrl ? (
                                                        <img src={variantImageUrl} alt={variantLabel} className="h-full w-full object-cover" loading="lazy" />
                                                    ) : (
                                                        <i className="fa-regular fa-image text-lg text-white/40"></i>
                                                    )}
                                                </div>
                                                <p className="line-clamp-2 text-xs font-bold leading-5 text-white" dir="rtl">{variantLabel}</p>
                                                {variantCode ? (
                                                    <p className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.14em] text-white/45">{variantCode}</p>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="space-y-3 pt-5">
                                    <button
                                        type="button"
                                        onClick={(event) => openProductDetails(product, event)}
                                        className="w-full rounded-2xl border border-brandGold/40 bg-brandGold px-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-brandBlue transition-all hover:bg-white hover:text-brandBlue"
                                    >
                                        Open Variants | عرض الاختيارات
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (!shouldUseCategoryRows) {
        return (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-10">
                {filteredProducts.map((product) => renderProductCard(product))}
            </div>
        );
    }

    return (
        <div className="space-y-10 md:space-y-12">
            {visibleSections.map((section) => (
                <section key={section.categoryName} className="space-y-4">
                    <div className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-white/8 pb-2">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold/75">Category Row</p>
                            <h2 className="mt-1 text-2xl font-black text-brandBlue dark:text-white">{section.categoryName}</h2>
                        </div>
                        <span className="rounded-full border border-brandGold/20 bg-brandGold/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-brandGold">
                            {section.products.length} items
                        </span>
                    </div>

                    <div className="category-row-wrapper" style={{ marginBottom: 0 }}>
                        <button
                            type="button"
                            onClick={() => scrollProductRow(section.categoryName, -1)}
                            className={`scroll-arrow scroll-arrow-left ${!productRowScrollState[section.categoryName]?.canScrollLeft ? 'is-hidden' : ''}`}
                            aria-label={`Scroll ${section.categoryName} products left`}
                        >
                            <i className="fa-solid fa-chevron-left"></i>
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollProductRow(section.categoryName, 1)}
                            className={`scroll-arrow scroll-arrow-right ${!productRowScrollState[section.categoryName]?.canScrollRight ? 'is-hidden' : ''}`}
                            aria-label={`Scroll ${section.categoryName} products right`}
                        >
                            <i className="fa-solid fa-chevron-right"></i>
                        </button>

                        <div
                            ref={(node) => setProductRowRef(section.categoryName, node)}
                            className="category-row-container pb-4"
                        >
                            {section.products.map((product) => (
                                <div key={product.id || product.code || product.name} className="w-[240px] flex-none sm:w-[255px] md:w-[270px]">
                                    {renderProductCard(product)}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            ))}

            {hasMoreCategoryRows ? (
                <div className="flex justify-center px-4 md:px-0">
                    <button
                        type="button"
                        onClick={() => setVisibleCategoryRows(productSections.length)}
                        className="group inline-flex w-fit max-w-full items-center gap-3 rounded-[2rem] border border-brandGold/35 bg-gradient-to-r from-brandGold/12 via-white to-brandGold/8 px-4 py-3 text-brandBlue shadow-[0_18px_45px_rgba(212,175,55,0.12)] transition-all hover:-translate-y-0.5 hover:border-brandGold hover:shadow-[0_24px_60px_rgba(212,175,55,0.2)] dark:from-brandGold/15 dark:via-darkCard dark:to-brandGold/10 dark:text-brandGold md:gap-4 md:rounded-full md:px-6 md:py-3.5"
                    >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brandGold text-brandBlue shadow-lg shadow-brandGold/30 transition-transform group-hover:scale-110 group-hover:rotate-[-8deg] md:h-10 md:w-10">
                            <svg className="h-4 w-4 md:h-5 md:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                        </span>
                        <span className="min-w-0 inline-flex flex-col items-start text-left leading-none">
                            <span className="font-arabic text-[1.05rem] font-black leading-tight tracking-tight text-brandGold md:text-xl">{selectedShowMoreArabicLine}</span>
                            <span className="mt-1 text-[9px] font-black uppercase tracking-[0.2em] text-brandBlue/70 dark:text-brandGold/70 md:text-xs md:tracking-[0.28em]">Discover More Pieces</span>
                        </span>
                    </button>
                </div>
            ) : null}

            <AdminProductModal
                isOpen={Boolean(editingProduct)}
                onClose={closeProductEditor}
                product={editingProduct}
                categories={categories}
                brands={brands}
            />
        </div>
    );
}