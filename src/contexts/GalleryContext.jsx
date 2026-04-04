'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { CART_STORAGE_KEY, WHOLESALE_CART_STORAGE_KEY } from '@/lib/cart-storage';
import { isWholesaleRole, normalizeUserRole, USER_ROLE_VALUES } from '@/lib/user-roles';
import { buildOrderStatusHistoryEntry } from '@/lib/utils/order-status';

const noop = () => {};
const DC_WATCH_RECONNECT_DELAY_MS = 5000;
const DC_FALLBACK_SYNC_INTERVAL_MS = 60000;

function parsePrice(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return 0;

    const normalized = value.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeInventoryCode(value) {
    return String(value || '').trim().toLowerCase();
}

function getUniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean)));
}

function getProductMatchCodes(product = {}) {
    return getUniqueValues([
        product.code,
        product.barcode,
        product.productCode,
        product.sku,
        product.itemCode
    ].map(normalizeInventoryCode));
}

function getDcItemMatchCodes(item = {}) {
    return getUniqueValues([
        item.barcode,
        item.code,
        item.product_code,
        item.productCode,
        item.sku,
        item.itemCode,
        item.id
    ].map(normalizeInventoryCode));
}

function getDcFeedItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.products)) return payload.products;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

function parseCount(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWarehouseName(value) {
    return String(value || '').replace(/\s+/g, '');
}

function getDcWarehouseBuckets(item = {}) {
    let showroomStock = 0;
    let warehouseStock = 0;

    (item.stock_by_warehouse || item.stockByWarehouse || []).forEach((warehouseEntry) => {
        const warehouseId = Number(warehouseEntry?.warehouse_id || warehouseEntry?.warehouseId || 0);
        const warehouseName = normalizeWarehouseName(warehouseEntry?.warehouse_name || warehouseEntry?.warehouseName);
        const quantity = Number(warehouseEntry?.quantity || 0);

        if (!Number.isFinite(quantity) || quantity <= 0) return;

        if (warehouseId === 1) {
            showroomStock += quantity;
            return;
        }

        if (warehouseId === 2) {
            warehouseStock += quantity;
            return;
        }

        if (!warehouseName) return;

        if (warehouseName.includes('مخزنالمعرض') || warehouseName.includes('showroom')) {
            showroomStock += quantity;
            return;
        }

        if (warehouseName.includes('المخزنالرئيسي') || warehouseName.includes('warehouse')) {
            warehouseStock += quantity;
        }
    });

    if (showroomStock === 0 && warehouseStock === 0) {
        const totalStock = getDcTotalStock(item);
        if (Number.isFinite(totalStock) && totalStock > 0) {
            warehouseStock = totalStock;
        }
    }

    return { showroomStock, warehouseStock };
}

function getWarehouseStockTotal(stockByWarehouse) {
    if (!Array.isArray(stockByWarehouse)) return null;

    const total = stockByWarehouse.reduce((sum, warehouseEntry) => {
        const quantity = Number(warehouseEntry?.quantity);
        return sum + (Number.isFinite(quantity) ? quantity : 0);
    }, 0);

    return Number.isFinite(total) ? total : null;
}

function getDcTotalStock(item = {}) {
    return parseCount(item.total_stock)
        ?? parseCount(item.totalStock)
        ?? parseCount(item.quantity)
        ?? getWarehouseStockTotal(item.stock_by_warehouse)
        ?? getWarehouseStockTotal(item.stockByWarehouse);
}

function getProductLowStockThreshold(product = {}) {
    const threshold = Number(product.lowStockThreshold || product.low_stock_threshold || 5);
    return Number.isFinite(threshold) && threshold > 0 ? threshold : 5;
}

function buildDcLookupMap(items) {
    const nextMap = {};

    items.forEach((item) => {
        getDcItemMatchCodes(item).forEach((code) => {
            if (!nextMap[code]) {
                nextMap[code] = item;
            }
        });
    });

    return nextMap;
}

function mergeProductWithDcData(product, dcProduct, dcStock) {
    const liveEntry = dcStock || dcProduct;
    if (!dcProduct && !dcStock) return product;

    const retailPrice = getProductPrice({ ...product, ...dcProduct, ...dcStock });
    const wholesalePrice = getProductWholesalePrice({ ...product, ...dcProduct, ...dcStock });
    const warehouseBuckets = getDcWarehouseBuckets(liveEntry || {});
    const discountAmount = parsePrice(
        dcProduct?.discount_amount
        || dcProduct?.discountAmount
        || dcProduct?.discount
        || dcStock?.discount_amount
        || dcStock?.discountAmount
        || dcStock?.discount
        || product?.discount_amount
        || product?.discountAmount
        || product?.discount
    );
    const totalStock = getDcTotalStock(liveEntry);
    const threshold = getProductLowStockThreshold(product);
    const manufacturer = normalizeFilterValue(dcStock?.manufacturer || dcProduct?.manufacturer);

    const mergedProduct = {
        ...product,
        ...(manufacturer && !product.brand ? { brand: manufacturer } : {}),
        ...(manufacturer && !product.manufacturer ? { manufacturer } : {}),
        ...(retailPrice > 0 ? {
            price: retailPrice,
            retailPrice,
            retail_price: retailPrice
        } : {}),
        ...(wholesalePrice > 0 ? {
            wholesalePrice,
            wholesale_price: wholesalePrice,
            cartonPrice: wholesalePrice
        } : {}),
        ...(discountAmount > 0 ? {
            discountAmount,
            discount_amount: discountAmount,
            discount: discountAmount
        } : {})
    };

    if (totalStock === null) {
        return mergedProduct;
    }

    return {
        ...mergedProduct,
        remainingQuantity: totalStock,
        totalStock,
        total_stock: totalStock,
        showroomStock: warehouseBuckets.showroomStock,
        retailStock: warehouseBuckets.showroomStock,
        warehouseStock: warehouseBuckets.warehouseStock,
        wholesaleStock: warehouseBuckets.warehouseStock,
        stock_by_warehouse: liveEntry?.stock_by_warehouse || liveEntry?.stockByWarehouse || product?.stock_by_warehouse,
        stockByWarehouse: liveEntry?.stockByWarehouse || liveEntry?.stock_by_warehouse || product?.stockByWarehouse,
        stockStatus: totalStock <= 0
            ? 'out_of_stock'
            : totalStock <= threshold
                ? 'low_stock'
                : 'in_stock'
    };
}

function enrichProductVariantsWithDcData(product, dcProductsMap, dcStockMap) {
    const variants = Array.isArray(product?.variants) ? product.variants : null;
    if (!variants || variants.length === 0) return product;

    return {
        ...product,
        variants: variants.map((variant) => {
            const variantCodes = getProductMatchCodes(variant);
            const dcVariantProduct = variantCodes.map((code) => dcProductsMap[code]).find(Boolean) || null;
            const dcVariantStock = variantCodes.map((code) => dcStockMap[code]).find(Boolean) || null;
            const liveEntry = dcVariantStock || dcVariantProduct;
            const stockBuckets = getDcWarehouseBuckets(liveEntry || {});
            const totalStock = getDcTotalStock(liveEntry || {});
            const hasLiveStock = Number.isFinite(totalStock);

            const variantRetailPrice = getProductPrice({ ...variant, ...dcVariantProduct, ...dcVariantStock });
            const variantWholesalePrice = getProductWholesalePrice({ ...variant, ...dcVariantProduct, ...dcVariantStock });
            const variantDiscountAmount = parsePrice(
                dcVariantProduct?.discount_amount || dcVariantProduct?.discountAmount || dcVariantProduct?.discount ||
                dcVariantStock?.discount_amount || dcVariantStock?.discountAmount || dcVariantStock?.discount ||
                variant?.discount_amount || variant?.discountAmount || variant?.discount
            );

            return {
                ...variant,
                ...(variantRetailPrice > 0 ? { price: variantRetailPrice, retailPrice: variantRetailPrice, retail_price: variantRetailPrice } : {}),
                ...(variantWholesalePrice > 0 ? { wholesalePrice: variantWholesalePrice, wholesale_price: variantWholesalePrice, cartonPrice: variantWholesalePrice } : {}),
                ...(variantDiscountAmount > 0 ? { discountAmount: variantDiscountAmount, discount_amount: variantDiscountAmount, discount: variantDiscountAmount, discountValue: variantDiscountAmount } : {}),
                ...(dcVariantStock?.barcode || dcVariantProduct?.barcode ? {
                    matchedBarcode: dcVariantStock?.barcode || dcVariantProduct?.barcode || '-'
                } : {}),
                ...(hasLiveStock ? {
                    remainingQuantity: totalStock,
                    showroomStock: stockBuckets.showroomStock,
                    retailStock: stockBuckets.showroomStock,
                    warehouseStock: stockBuckets.warehouseStock,
                    wholesaleStock: stockBuckets.warehouseStock,
                    totalStock,
                    total_stock: totalStock,
                    stock_by_warehouse: liveEntry?.stock_by_warehouse || liveEntry?.stockByWarehouse || variant?.stock_by_warehouse,
                    stockByWarehouse: liveEntry?.stockByWarehouse || liveEntry?.stock_by_warehouse || variant?.stockByWarehouse,
                    stockStatus: totalStock <= 0 ? 'out_of_stock' : 'in_stock'
                } : {}),
                isLinked: !!liveEntry
            };
        })
    };
}

function findMatchingProduct(products, targetProduct) {
    if (!targetProduct) return null;

    if (targetProduct.id) {
        const matchedById = products.find((product) => product.id === targetProduct.id);
        if (matchedById) return matchedById;
    }

    const targetCodes = getProductMatchCodes(targetProduct);
    if (targetCodes.length === 0) return null;

    return products.find((product) => getProductMatchCodes(product).some((code) => targetCodes.includes(code))) || null;
}

function getProductTitle(product) {
    return product.title || product.name || 'Unnamed Product';
}

function getProductPrimaryCode(product = {}) {
    return product.code || product.barcode || product.productCode || product.sku || product.itemCode || product.id || '';
}

function normalizeLookupText(value) {
    return String(value || '').trim().toLowerCase();
}

function getCartItemMatchCodes(item = {}) {
    return getUniqueValues([
        item.productId,
        item.productCode,
        item.cartId
    ].map(normalizeInventoryCode));
}

function matchesCartItemToProduct(product = {}, item = {}) {
    const itemCodes = getCartItemMatchCodes(item);
    const productCodes = getProductMatchCodes(product);

    if (itemCodes.length > 0) {
        const normalizedProductId = normalizeInventoryCode(product.id);
        if (normalizedProductId && itemCodes.includes(normalizedProductId)) {
            return true;
        }

        if (productCodes.some((code) => itemCodes.includes(code))) {
            return true;
        }
    }

    const itemTitle = normalizeLookupText(item.title || item.name || item.cartId);
    return Boolean(itemTitle) && itemTitle === normalizeLookupText(getProductTitle(product));
}

function findCatalogProductForCartItem(products = [], item = {}) {
    for (const product of products) {
        if (matchesCartItemToProduct(product, item)) {
            return product;
        }

        if (Array.isArray(product?.variants)) {
            const matchedVariant = product.variants.find((variant) => matchesCartItemToProduct(variant, item));
            if (matchedVariant) {
                return matchedVariant;
            }
        }
    }

    return null;
}

function getProductImage(product) {
    if (product.url) return product.url;

    if (Array.isArray(product.media) && product.media.length > 0) {
        const firstMedia = product.media[0];
        return firstMedia.url || firstMedia.primaryUrl || firstMedia;
    }

    if (Array.isArray(product.images) && product.images.length > 0) {
        const firstImage = product.images[0];
        return firstImage.url || firstImage.primaryUrl || firstImage;
    }

    return '/logo.png';
}

function getProductPrice(product) {
    return parsePrice(
        product.price
        || product.retailPrice
        || product.retail_price
        || product.salePrice
        || product.sellingPrice
    );
}

function getProductDiscountAmount(product) {
    return parsePrice(
        product.discountAmount
        || product.discount_amount
        || product.discount
        || product.discountValue
    );
}

function getProductNetPrice(product) {
    const explicitNetPrice = parsePrice(
        product.netPrice
        || product.net_price
        || product.net
    );

    if (explicitNetPrice > 0) {
        return explicitNetPrice;
    }

    return Math.max(0, getProductPrice(product) - getProductDiscountAmount(product));
}

function getProductUnitOrderPrice(product, userRole = '') {
    return normalizeUserRole(userRole) === USER_ROLE_VALUES.CST_WHOLESALE
        ? getProductNetPrice(product)
        : getProductPrice(product);
}

function getProductWholesalePrice(product) {
    return parsePrice(
        product.wholesalePrice
        || product.wholesale_price
        || product.cartonPrice
        || product.wholesaleCartonPrice
        || product.priceWholesale
        || product.bulkPrice
        || product.bulk_price
        || product.price
        || product.retailPrice
        || product.retail_price
    );
}

function getFirstAvailableStockCount(values = []) {
    for (const value of values) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) {
            return parsed;
        }
    }

    return null;
}

function getProductStockLimit(product, orderType = 'retail') {
    if (product.stockStatus === 'out_of_stock') return 0;

    const dedicatedStockLimit = orderType === 'wholesale'
        ? getFirstAvailableStockCount([
            product.wholesaleStock,
            product.warehouseStock
        ])
        : getFirstAvailableStockCount([
            product.retailStock,
            product.showroomStock
        ]);

    if (dedicatedStockLimit !== null) {
        return dedicatedStockLimit;
    }

    return orderType === 'wholesale'
        ? getFirstAvailableStockCount([
            product.remainingQuantity,
            product.totalStock,
            product.total_stock,
            product.quantity
        ])
        : getFirstAvailableStockCount([
            product.remainingQuantity,
            product.totalStock,
            product.total_stock,
            product.quantity
        ]);
}

function getProductStockStatus(product, orderType = 'retail') {
    const stockLimit = getProductStockLimit(product, orderType);
    const fallbackStatus = String(product?.stockStatus || 'in_stock').toLowerCase();

    if (stockLimit === 0) {
        return 'out_of_stock';
    }

    if (stockLimit !== null) {
        return stockLimit <= getProductLowStockThreshold(product) ? 'low_stock' : 'in_stock';
    }

    return fallbackStatus === 'out_of_stock' || fallbackStatus === 'low_stock'
        ? fallbackStatus
        : 'in_stock';
}

function normalizeFilterValue(value) {
    return String(value || '').trim();
}

function getProductSortOrder(product = {}) {
    const numericOrder = Number(product.order);
    return Number.isFinite(numericOrder) ? numericOrder : Number.MAX_SAFE_INTEGER;
}

function getProductBrandLabel(product = {}) {
    return [
        product.brand,
        product.brand_name,
        product.manufacturer,
        product.factory,
        product.company,
        product.supplier
    ].map(normalizeFilterValue).find(Boolean) || 'Generic';
}

function getProductOriginLabel(product = {}) {
    return [
        product.origin,
        product.country,
        product.countryOfOrigin
    ].map(normalizeFilterValue).find(Boolean) || 'Unknown';
}

function matchesProductSearch(product, queryText) {
    const query = normalizeFilterValue(queryText).toLowerCase();
    if (!query) return true;

    return [
        product.name,
        product.title,
        product.description,
        product.desc,
        product.category,
        product.code,
        getProductBrandLabel(product),
        getProductOriginLabel(product)
    ].some((value) => String(value || '').toLowerCase().includes(query));
}

const GalleryContext = createContext({
    filteredProducts: [],
    allProducts: [],
    categories: [],
    isLoading: true,
    userRole: '',
    isWholesaleCustomer: false,
    searchQuery: '',
    setSearchQuery: noop,
    activeCategory: 'All',
    setActiveCategory: noop,
    selectedCategories: [],
    selectedBrands: [],
    selectedOrigins: [],
    hideOutOfStockProducts: false,
    toggleCategoryFilter: noop,
    toggleBrandFilter: noop,
    toggleOriginFilter: noop,
    toggleStockFilter: noop,
    clearAllFilters: noop,
    removeFilterChip: noop,
    categoryFacetEntries: [],
    brandFacetEntries: [],
    originFacetEntries: [],
    activeFilterChips: [],
    primaryFilterDisplayLabel: 'Category: All',
    selectedProduct: null,
    setSelectedProduct: noop,
    dcLiveUpdateAt: 0,
    dcSyncedAt: 0,
    refreshDcCatalog: async () => {},
    cartItems: [],
    cartCount: 0,
    cartSubtotal: 0,
    isCartOpen: false,
    openCart: noop,
    closeCart: noop,
    addToCart: noop,
    removeFromCart: noop,
    updateCartQuantity: noop,
    clearCart: noop,
    checkoutCart: async () => ({ ok: false }),
    wholesaleCartItems: [],
    wholesaleCartCount: 0,
    wholesaleCartSubtotal: 0,
    isWholesaleCartOpen: false,
    openWholesaleCart: noop,
    closeWholesaleCart: noop,
    addToWholesaleCart: noop,
    removeFromWholesaleCart: noop,
    updateWholesaleCartQuantity: noop,
    getCartItemStockLimit: () => null,
    getProductStockLimit: () => null,
    getProductStockStatus: () => 'in_stock',
    clearWholesaleCart: noop,
    checkoutWholesaleCart: async () => ({ ok: false }),
    isCheckingOut: false,
    isCheckingOutWholesale: false,
    toast: null,
    showToast: noop,
    dismissToast: noop
});

export function GalleryProvider({ children }) {
    const [products, setProducts] = useState([]);
    const [dcProductsMap, setDcProductsMap] = useState({});
    const [dcStockMap, setDcStockMap] = useState({});
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userRole, setUserRole] = useState('');
    
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [selectedBrands, setSelectedBrands] = useState([]);
    const [selectedOrigins, setSelectedOrigins] = useState([]);
    const [hideOutOfStockProducts, setHideOutOfStockProducts] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [cartItems, setCartItems] = useState([]);
    const [wholesaleCartItems, setWholesaleCartItems] = useState([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isWholesaleCartOpen, setIsWholesaleCartOpen] = useState(false);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [isCheckingOutWholesale, setIsCheckingOutWholesale] = useState(false);
    const [toast, setToast] = useState(null);
    const [isCartHydrated, setIsCartHydrated] = useState(false);
    const [isWholesaleCartHydrated, setIsWholesaleCartHydrated] = useState(false);
    const [dcLiveUpdateAt, setDcLiveUpdateAt] = useState(0);
    const [dcSyncedAt, setDcSyncedAt] = useState(0);

    const buildDcRequestUrl = (path, options = {}) => {
        const query = new URLSearchParams({
            live: '1',
            ts: String(Date.now())
        });

        if (options.markLiveUpdate) {
            query.set('watch', '1');
        }

        if (options.forceRefresh) {
            query.set('refresh', '1');
        }

        return `${path}?${query.toString()}`;
    };

    const syncDcCatalog = async ({ markLiveUpdate = false, forceRefresh = false } = {}) => {
        try {
            const [productsResponse, stockResponse] = await Promise.allSettled([
                fetch(buildDcRequestUrl('/api/dc/products', { markLiveUpdate, forceRefresh }), {
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache, no-store, max-age=0',
                        Pragma: 'no-cache'
                    }
                }),
                fetch(buildDcRequestUrl('/api/dc/stock', { markLiveUpdate, forceRefresh }), {
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache, no-store, max-age=0',
                        Pragma: 'no-cache'
                    }
                })
            ]);

            let didUpdate = false;

            if (productsResponse.status === 'fulfilled' && productsResponse.value.ok) {
                const payload = await productsResponse.value.json();
                setDcProductsMap(buildDcLookupMap(getDcFeedItems(payload)));
                didUpdate = true;
            }

            if (stockResponse.status === 'fulfilled' && stockResponse.value.ok) {
                const payload = await stockResponse.value.json();
                setDcStockMap(buildDcLookupMap(getDcFeedItems(payload)));
                didUpdate = true;
            }

            if (markLiveUpdate && didUpdate) {
                setDcLiveUpdateAt(Date.now());
            }

            if (didUpdate) {
                setDcSyncedAt(Date.now());
            }
        } catch (error) {
            console.error('Failed to sync live DC catalog:', error);
        }
    };

    const refreshDcCatalog = async ({ forceRefresh = false, markLiveUpdate = false } = {}) => {
        await syncDcCatalog({ forceRefresh, markLiveUpdate });
    };

    useEffect(() => {
        // Fetch Categories
        const unsubscribeCategories = onSnapshot(collection(db, 'productCategories'), (snapshot) => {
            const fetchedCats = snapshot.docs.map((doc, idx) => {
                const data = doc.data();
                return { id: doc.id, name: data.name, order: data.order !== undefined ? data.order : idx };
            }).sort((a, b) => a.order - b.order);
            setCategories(fetchedCats);
        });

        // Fetch Brands
        const unsubscribeBrands = onSnapshot(collection(db, 'categories'), (snapshot) => {
            const fetchedBrands = snapshot.docs.map((doc, idx) => {
                const data = doc.data();
                return { id: doc.id, name: data.name, order: data.order !== undefined ? data.order : idx };
            }).sort((a, b) => a.order - b.order);
            setBrands(fetchedBrands);
        });

        // Fetch Products
        const q = query(collection(db, 'products'));
        const unsubscribeProducts = onSnapshot(q, (snapshot) => {
            const fetchedProducts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setProducts(fetchedProducts);
            setIsLoading(false);
        });

        return () => {
            unsubscribeCategories();
            unsubscribeBrands();
            unsubscribeProducts();
        };
    }, []);

    useEffect(() => {
        let isDisposed = false;
        let isSyncing = false;
        let watchSource = null;
        let reconnectTimeoutId = null;
        let fallbackIntervalId = null;

        const runSync = async (reason = 'manual') => {
            if (isDisposed || isSyncing) return;
            isSyncing = true;
            try {
                await syncDcCatalog({ markLiveUpdate: reason === 'watch-event' });
            } finally {
                isSyncing = false;
            }
        };

        const startFallbackPolling = () => {
            if (fallbackIntervalId) return;
            fallbackIntervalId = window.setInterval(runSync, DC_FALLBACK_SYNC_INTERVAL_MS);
        };

        const stopFallbackPolling = () => {
            if (!fallbackIntervalId) return;
            window.clearInterval(fallbackIntervalId);
            fallbackIntervalId = null;
        };

        const scheduleReconnect = () => {
            if (isDisposed || reconnectTimeoutId) return;
            reconnectTimeoutId = window.setTimeout(() => {
                reconnectTimeoutId = null;
                connectWatch();
            }, DC_WATCH_RECONNECT_DELAY_MS);
        };

        const connectWatch = () => {
            if (isDisposed || typeof window === 'undefined' || typeof EventSource === 'undefined') {
                startFallbackPolling();
                return;
            }

            if (watchSource) {
                watchSource.close();
            }

            watchSource = new EventSource('/api/dc/watch');

            watchSource.addEventListener('open', () => {
                stopFallbackPolling();
            });

            watchSource.addEventListener('catalog-change', () => {
                runSync('watch-event');
            });

            watchSource.addEventListener('watch-error', () => {
                startFallbackPolling();
            });

            watchSource.onerror = () => {
                startFallbackPolling();

                if (watchSource) {
                    watchSource.close();
                    watchSource = null;
                }

                scheduleReconnect();
            };
        };

        const handleWindowFocus = () => {
            runSync();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                runSync();
            }
        };

        runSync();
        connectWatch();
        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isDisposed = true;
            stopFallbackPolling();
            if (reconnectTimeoutId) {
                window.clearTimeout(reconnectTimeoutId);
            }
            if (watchSource) {
                watchSource.close();
            }
            window.removeEventListener('focus', handleWindowFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
            if (!currentUser) {
                setUserRole('');
                return;
            }

            try {
                const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                if (userDoc.exists()) {
                    setUserRole(normalizeUserRole(userDoc.data().role));
                } else {
                    setUserRole(USER_ROLE_VALUES.CST_RETAIL);
                }
            } catch (error) {
                console.error('Failed to resolve user role:', error);
                setUserRole(USER_ROLE_VALUES.CST_RETAIL);
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);
        const categoryParam = params.get('category') || 'All';
        const categoriesParam = params.getAll('categories').map(normalizeFilterValue).filter(Boolean);
        const brandsParam = params.getAll('brands').map(normalizeFilterValue).filter(Boolean);
        const originsParam = params.getAll('origins').map(normalizeFilterValue).filter(Boolean);
        const searchParam = normalizeFilterValue(params.get('search'));
        const stockParam = params.get('stock') === 'in-stock';

        if (searchParam) setSearchQuery(searchParam);
        if (stockParam) setHideOutOfStockProducts(true);

        if (categoriesParam.length > 0) {
            setSelectedCategories(categoriesParam);
            setActiveCategory('All');
        } else if (categoryParam && categoryParam !== 'All') {
            setSelectedCategories([categoryParam]);
            setActiveCategory(categoryParam);
        }

        if (brandsParam.length > 0) setSelectedBrands(brandsParam);
        if (originsParam.length > 0) setSelectedOrigins(originsParam);

        try {
            const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
            if (!storedCart) {
                setIsCartHydrated(true);
                return;
            }

            const parsedCart = JSON.parse(storedCart);
            if (Array.isArray(parsedCart)) {
                setCartItems(parsedCart);
            }
        } catch (error) {
            console.error('Failed to restore cart from storage:', error);
        } finally {
            setIsCartHydrated(true);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        try {
            const storedCart = window.localStorage.getItem(WHOLESALE_CART_STORAGE_KEY);
            if (!storedCart) {
                setIsWholesaleCartHydrated(true);
                return;
            }

            const parsedCart = JSON.parse(storedCart);
            if (Array.isArray(parsedCart)) {
                setWholesaleCartItems(parsedCart);
            }
        } catch (error) {
            console.error('Failed to restore wholesale cart from storage:', error);
        } finally {
            setIsWholesaleCartHydrated(true);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !isCartHydrated) return;
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    }, [cartItems, isCartHydrated]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const url = new URL(window.location.href);
        url.searchParams.delete('category');
        url.searchParams.delete('categories');
        url.searchParams.delete('brands');
        url.searchParams.delete('origins');
        url.searchParams.delete('search');
        url.searchParams.delete('stock');

        if (searchQuery.trim()) {
            url.searchParams.set('search', searchQuery.trim());
        }

        if (selectedCategories.length === 1 && selectedBrands.length === 0 && selectedOrigins.length === 0 && !hideOutOfStockProducts) {
            url.searchParams.set('category', selectedCategories[0]);
        } else {
            selectedCategories.forEach((value) => url.searchParams.append('categories', value));
            selectedBrands.forEach((value) => url.searchParams.append('brands', value));
            selectedOrigins.forEach((value) => url.searchParams.append('origins', value));
            if (hideOutOfStockProducts) {
                url.searchParams.set('stock', 'in-stock');
            }
        }

        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }, [searchQuery, selectedCategories, selectedBrands, selectedOrigins, hideOutOfStockProducts]);

    useEffect(() => {
        if (typeof window === 'undefined' || !isWholesaleCartHydrated) return;
        window.localStorage.setItem(WHOLESALE_CART_STORAGE_KEY, JSON.stringify(wholesaleCartItems));
    }, [wholesaleCartItems, isWholesaleCartHydrated]);

    useEffect(() => {
        if (!toast) return undefined;

        const timeoutId = window.setTimeout(() => {
            setToast(null);
        }, 3200);

        return () => window.clearTimeout(timeoutId);
    }, [toast]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);
        const cartParam = params.get('cart');

        if (cartParam === 'wholesale') {
            setIsWholesaleCartOpen(true);
        } else if (cartParam === 'retail') {
            setIsCartOpen(true);
        } else {
            return;
        }

        params.delete('cart');
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
    }, []);

    const catalogProducts = products
        .map((product) => {
            const productCodes = getProductMatchCodes(product);
            const dcProduct = productCodes.map((code) => dcProductsMap[code]).find(Boolean);
            const dcStock = productCodes.map((code) => dcStockMap[code]).find(Boolean);
            const mergedProduct = mergeProductWithDcData(product, dcProduct, dcStock);
            return enrichProductVariantsWithDcData(mergedProduct, dcProductsMap, dcStockMap);
        })
        .sort((leftProduct, rightProduct) => {
            const leftOrder = getProductSortOrder(leftProduct);
            const rightOrder = getProductSortOrder(rightProduct);

            if (leftOrder !== rightOrder) return leftOrder - rightOrder;

            const leftUpdatedAt = leftProduct?.updatedAt?.seconds || 0;
            const rightUpdatedAt = rightProduct?.updatedAt?.seconds || 0;
            if (rightUpdatedAt !== leftUpdatedAt) return rightUpdatedAt - leftUpdatedAt;

            return String(leftProduct.title || leftProduct.name || '').localeCompare(String(rightProduct.title || rightProduct.name || ''));
        });

    const resolvedSelectedProduct = findMatchingProduct(catalogProducts, selectedProduct) || selectedProduct;

    useEffect(() => {
        if (!isCartHydrated || catalogProducts.length === 0) return;

        setCartItems((currentCart) => {
            let didChange = false;

            const nextCart = currentCart.map((item) => {
                const linkedProduct = findCatalogProductForCartItem(catalogProducts, item);
                if (!linkedProduct) {
                    return item;
                }

                const nextPrice = getProductUnitOrderPrice(linkedProduct, userRole);
                if (Math.abs((Number(item.price) || 0) - nextPrice) < 0.0001) {
                    return item;
                }

                didChange = true;
                return {
                    ...item,
                    price: nextPrice
                };
            });

            return didChange ? nextCart : currentCart;
        });
    }, [catalogProducts, isCartHydrated, userRole]);

    const filteredProducts = catalogProducts.filter((product) => {
        const normalizedCategory = normalizeFilterValue(product.category);
        const productBrand = getProductBrandLabel(product);
        const productOrigin = getProductOriginLabel(product);
        const stockOrderType = normalizeUserRole(userRole) === USER_ROLE_VALUES.CST_WHOLESALE ? 'wholesale' : 'retail';
        const stockLimit = getProductStockLimit(product, stockOrderType);
        const stockStatus = getProductStockStatus(product, stockOrderType);
        const hasStock = stockLimit === null ? stockStatus !== 'out_of_stock' : stockLimit > 0;

        if (selectedCategories.length > 0 && !selectedCategories.includes(normalizedCategory)) return false;
        if (selectedBrands.length > 0 && !selectedBrands.includes(productBrand)) return false;
        if (selectedOrigins.length > 0 && !selectedOrigins.includes(productOrigin)) return false;
        if (hideOutOfStockProducts && !hasStock) return false;
        if (!matchesProductSearch(product, searchQuery)) return false;

        return true;
    });

    const categoryFacetEntries = categories
        .map((category) => category.name)
        .filter((name) => name !== 'All')
        .map((name) => ({
            label: name,
            count: catalogProducts.filter((product) => normalizeFilterValue(product.category) === name).length,
            selected: selectedCategories.includes(name)
        }))
        .filter((entry) => entry.count > 0 || entry.selected);

    const brandFacetEntries = Array.from(new Map(
        catalogProducts.map((product) => [getProductBrandLabel(product), getProductBrandLabel(product)])
    ).values())
        .map((label) => ({
            label,
            count: catalogProducts.filter((product) => getProductBrandLabel(product) === label).length,
            selected: selectedBrands.includes(label)
        }))
        .sort((leftEntry, rightEntry) => rightEntry.count - leftEntry.count || leftEntry.label.localeCompare(rightEntry.label));

    const originFacetEntries = Array.from(new Map(
        catalogProducts.map((product) => [getProductOriginLabel(product), getProductOriginLabel(product)])
    ).values())
        .map((label) => ({
            label,
            count: catalogProducts.filter((product) => getProductOriginLabel(product) === label).length,
            selected: selectedOrigins.includes(label)
        }))
        .sort((leftEntry, rightEntry) => rightEntry.count - leftEntry.count || leftEntry.label.localeCompare(rightEntry.label));

    const activeFilterChips = [
        ...(searchQuery.trim() ? [{ type: 'search', value: searchQuery.trim(), label: `Search: ${searchQuery.trim()}` }] : []),
        ...selectedCategories.map((value) => ({ type: 'category', value, label: value })),
        ...selectedBrands.map((value) => ({ type: 'brand', value, label: `Brand: ${value}` })),
        ...selectedOrigins.map((value) => ({ type: 'origin', value, label: `Origin: ${value}` })),
        ...(hideOutOfStockProducts ? [{ type: 'stock', value: 'in-stock', label: 'In Stock Only | المتاح فقط' }] : [])
    ];

    const primaryFilterDisplayLabel = activeFilterChips.length === 0
        ? 'Category: All'
        : (selectedCategories.length === 1 && selectedBrands.length === 0 && selectedOrigins.length === 0 && !searchQuery.trim() && !hideOutOfStockProducts
            ? `Category: ${selectedCategories[0]}`
            : `Filters: ${activeFilterChips.length}`);

    const showToast = (message, type = 'success') => {
        setToast({ id: Date.now(), message, type });
    };

    const dismissToast = () => setToast(null);

    const openCart = () => setIsCartOpen(true);
    const closeCart = () => setIsCartOpen(false);
    const openWholesaleCart = () => setIsWholesaleCartOpen(true);
    const closeWholesaleCart = () => setIsWholesaleCartOpen(false);

    const isWholesaleCustomer = isWholesaleRole(userRole);

    const setActiveCategoryFilter = (categoryName) => {
        if (categoryName === 'All') {
            setActiveCategory('All');
            setSelectedCategories([]);
            return;
        }

        setActiveCategory(categoryName);
        setSelectedCategories([categoryName]);
    };

    const toggleCategoryFilter = (categoryName) => {
        const normalizedValue = normalizeFilterValue(categoryName);
        if (!normalizedValue || normalizedValue === 'All') {
            setActiveCategory('All');
            setSelectedCategories([]);
            return;
        }

        setActiveCategory('All');
        setSelectedCategories((currentValues) => {
            if (currentValues.includes(normalizedValue)) {
                return currentValues.filter((value) => value !== normalizedValue);
            }
            return [...currentValues, normalizedValue];
        });
    };

    const toggleBrandFilter = (brandName) => {
        const normalizedValue = normalizeFilterValue(brandName);
        if (!normalizedValue) return;

        setSelectedBrands((currentValues) => {
            if (currentValues.includes(normalizedValue)) {
                return currentValues.filter((value) => value !== normalizedValue);
            }
            return [...currentValues, normalizedValue];
        });
    };

    const toggleOriginFilter = (originName) => {
        const normalizedValue = normalizeFilterValue(originName);
        if (!normalizedValue) return;

        setSelectedOrigins((currentValues) => {
            if (currentValues.includes(normalizedValue)) {
                return currentValues.filter((value) => value !== normalizedValue);
            }
            return [...currentValues, normalizedValue];
        });
    };

    const toggleStockFilter = () => {
        setHideOutOfStockProducts((currentValue) => !currentValue);
    };

    const clearAllFilters = () => {
        setSearchQuery('');
        setActiveCategory('All');
        setSelectedCategories([]);
        setSelectedBrands([]);
        setSelectedOrigins([]);
        setHideOutOfStockProducts(false);
    };

    const removeFilterChip = (type, value) => {
        if (type === 'search') {
            setSearchQuery('');
            return;
        }
        if (type === 'category') {
            setSelectedCategories((currentValues) => currentValues.filter((entry) => entry !== value));
            return;
        }
        if (type === 'brand') {
            setSelectedBrands((currentValues) => currentValues.filter((entry) => entry !== value));
            return;
        }
        if (type === 'origin') {
            setSelectedOrigins((currentValues) => currentValues.filter((entry) => entry !== value));
            return;
        }
        if (type === 'stock') {
            setHideOutOfStockProducts(false);
        }
    };

    const addToCart = (product, quantity = 1) => {
        if (!product) return;

        const normalizedQuantity = Math.max(1, Number(quantity) || 1);
        const stockLimit = getProductStockLimit(product, 'retail');
        const unitOrderPrice = getProductUnitOrderPrice(product, userRole);

        if (stockLimit === 0) {
            showToast('هذا المنتج غير متوفر حالياً.', 'error');
            return;
        }

        setCartItems((currentCart) => {
            const cartId = product.id || product.code || getProductTitle(product);
            const existingItem = currentCart.find((item) => item.cartId === cartId);

            if (existingItem) {
                const requestedQuantity = existingItem.quantity + normalizedQuantity;
                const nextQuantity = stockLimit === null ? requestedQuantity : Math.min(requestedQuantity, stockLimit);

                if (stockLimit !== null && requestedQuantity > stockLimit) {
                    showToast(`تم تحديد الكمية القصوى المتاحة: ${stockLimit}`, 'error');
                } else {
                    showToast(normalizedQuantity > 1 ? `تمت إضافة ${normalizedQuantity} قطع إلى العربة.` : 'تم تحديث كمية المنتج داخل العربة.');
                }

                return currentCart.map((item) => {
                    if (item.cartId !== cartId) return item;
                    return {
                        ...item,
                        quantity: nextQuantity,
                        price: unitOrderPrice
                    };
                });
            }

            const nextQuantity = stockLimit === null ? normalizedQuantity : Math.min(normalizedQuantity, stockLimit);
            if (stockLimit !== null && normalizedQuantity > stockLimit) {
                showToast(`تم تحديد الكمية القصوى المتاحة: ${stockLimit}`, 'error');
            } else {
                showToast(normalizedQuantity > 1 ? `تمت إضافة ${normalizedQuantity} قطع إلى العربة.` : 'تمت إضافة المنتج إلى العربة.');
            }

            return [
                ...currentCart,
                {
                    cartId,
                    productId: product.id,
                    productCode: getProductPrimaryCode(product),
                    name: getProductTitle(product),
                    title: getProductTitle(product),
                    category: product.category || '',
                    image: getProductImage(product),
                    price: unitOrderPrice,
                    quantity: nextQuantity,
                    addedAt: Date.now()
                }
            ];
        });
    };

    const addToWholesaleCart = (product, quantity = 1) => {
        if (!product) return;

        const normalizedQuantity = Math.max(1, Number(quantity) || 1);
        const stockLimit = getProductStockLimit(product, 'wholesale');

        if (stockLimit === 0) {
            showToast('هذا المنتج غير متوفر حالياً.', 'error');
            return;
        }

        setWholesaleCartItems((currentCart) => {
            const cartId = product.id || product.code || getProductTitle(product);
            const existingItem = currentCart.find((item) => item.cartId === cartId);

            if (existingItem) {
                const requestedQuantity = existingItem.quantity + normalizedQuantity;
                const nextQuantity = stockLimit === null ? requestedQuantity : Math.min(requestedQuantity, stockLimit);

                if (stockLimit !== null && requestedQuantity > stockLimit) {
                    showToast(`تم تحديد الكمية القصوى المتاحة: ${stockLimit}`, 'error');
                } else {
                    showToast(normalizedQuantity > 1 ? `تمت إضافة ${normalizedQuantity} كراتين إلى طلب الجملة.` : 'تم تحديث كمية المنتج داخل طلب الجملة.');
                }

                return currentCart.map((item) => {
                    if (item.cartId !== cartId) return item;
                    return { ...item, quantity: nextQuantity };
                });
            }

            const nextQuantity = stockLimit === null ? normalizedQuantity : Math.min(normalizedQuantity, stockLimit);
            if (stockLimit !== null && normalizedQuantity > stockLimit) {
                showToast(`تم تحديد الكمية القصوى المتاحة: ${stockLimit}`, 'error');
            } else {
                showToast(normalizedQuantity > 1 ? `تمت إضافة ${normalizedQuantity} كراتين لطلب الجملة.` : 'تمت إضافة المنتج إلى طلب الجملة.');
            }

            return [
                ...currentCart,
                {
                    cartId,
                    productId: product.id,
                    productCode: getProductPrimaryCode(product),
                    name: getProductTitle(product),
                    title: getProductTitle(product),
                    category: product.category || '',
                    image: getProductImage(product),
                    price: getProductWholesalePrice(product),
                    quantity: nextQuantity,
                    addedAt: Date.now()
                }
            ];
        });
    };

    const removeFromCart = (cartId) => {
        setCartItems((currentCart) => currentCart.filter((item) => item.cartId !== cartId));
        showToast('تم حذف المنتج من العربة.');
    };

    const removeFromWholesaleCart = (cartId) => {
        setWholesaleCartItems((currentCart) => currentCart.filter((item) => item.cartId !== cartId));
        showToast('تم حذف المنتج من طلب الجملة.');
    };

    const updateCartQuantity = (cartId, quantity) => {
        setCartItems((currentCart) => {
            const targetItem = currentCart.find((item) => item.cartId === cartId);
            if (!targetItem) return currentCart;

            const linkedProduct = findCatalogProductForCartItem(catalogProducts, targetItem);
            const stockLimit = linkedProduct ? getProductStockLimit(linkedProduct, 'retail') : null;
            const nextQuantity = Math.max(0, Number(quantity) || 0);

            if (nextQuantity === 0) {
                return currentCart.filter((item) => item.cartId !== cartId);
            }

            const boundedQuantity = stockLimit === null ? nextQuantity : Math.min(nextQuantity, stockLimit);
            if (stockLimit !== null && nextQuantity > stockLimit) {
                showToast(`تم تحديد الكمية القصوى المتاحة: ${stockLimit}`, 'error');
            }

            return currentCart.map((item) => {
                if (item.cartId !== cartId) return item;
                return { ...item, quantity: boundedQuantity };
            });
        });
    };

    const updateWholesaleCartQuantity = (cartId, quantity) => {
        setWholesaleCartItems((currentCart) => {
            const targetItem = currentCart.find((item) => item.cartId === cartId);
            if (!targetItem) return currentCart;

            const linkedProduct = findCatalogProductForCartItem(catalogProducts, targetItem);
            const stockLimit = linkedProduct ? getProductStockLimit(linkedProduct, 'wholesale') : null;
            const nextQuantity = Math.max(0, Number(quantity) || 0);

            if (nextQuantity === 0) {
                return currentCart.filter((item) => item.cartId !== cartId);
            }

            const boundedQuantity = stockLimit === null ? nextQuantity : Math.min(nextQuantity, stockLimit);
            if (stockLimit !== null && nextQuantity > stockLimit) {
                showToast(`تم تحديد الكمية القصوى المتاحة: ${stockLimit}`, 'error');
            }

            return currentCart.map((item) => {
                if (item.cartId !== cartId) return item;
                return { ...item, quantity: boundedQuantity };
            });
        });
    };

    const getCartItemStockLimit = (item, orderType = 'retail') => {
        const linkedProduct = findCatalogProductForCartItem(catalogProducts, item);
        return linkedProduct ? getProductStockLimit(linkedProduct, orderType) : null;
    };

    const clearCart = () => setCartItems([]);
    const clearWholesaleCart = () => setWholesaleCartItems([]);

    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const cartSubtotal = cartItems.reduce((sum, item) => sum + ((Number(item.price) || 0) * item.quantity), 0);
    const wholesaleCartCount = wholesaleCartItems.reduce((sum, item) => sum + item.quantity, 0);
    const wholesaleCartSubtotal = wholesaleCartItems.reduce((sum, item) => sum + ((Number(item.price) || 0) * item.quantity), 0);

    const allocateWebsiteOrderRef = async () => {
        const counterRef = doc(db, 'settings', 'orderCounter');

        try {
            const nextNumber = await runTransaction(db, async (transaction) => {
                const counterSnap = await transaction.get(counterRef);
                const currentNumber = Number(counterSnap.data()?.lastWebsiteOrderNumber || 1000);
                const safeCurrentNumber = Number.isFinite(currentNumber) && currentNumber >= 1000 ? currentNumber : 1000;
                const nextValue = safeCurrentNumber + 1;

                transaction.set(counterRef, {
                    lastWebsiteOrderNumber: nextValue,
                    updatedAt: serverTimestamp()
                }, { merge: true });

                return nextValue;
            });

            return `WEB-${nextNumber}`;
        } catch (error) {
            console.warn('Falling back to timestamp-based website order ref', error);
            return `WEB-${Date.now()}`;
        }
    };

    const buildOrderPayload = ({ currentUser, profileData, items, totalPrice, itemCount, orderType }) => {
        const customerName = profileData.name
            || [profileData.firstName, profileData.lastName].filter(Boolean).join(' ')
            || currentUser.displayName
            || currentUser.email?.split('@')[0]
            || 'Guest User';
        const customerEmail = profileData.email || profileData.authEmail || currentUser.email || '';
        const customerPhone = profileData.phone || '';
        const createdAt = new Date().toISOString();

        return {
            customer: {
                uid: currentUser.uid,
                name: customerName,
                email: customerEmail,
                phone: customerPhone,
                role: normalizeUserRole(profileData.role || USER_ROLE_VALUES.CST_RETAIL)
            },
            customerInfo: {
                uid: currentUser.uid,
                fullName: customerName,
                email: customerEmail,
                phone: customerPhone,
                role: normalizeUserRole(profileData.role || USER_ROLE_VALUES.CST_RETAIL)
            },
            items,
            totalPrice,
            itemCount,
            createdAt,
            orderDate: createdAt,
            source: 'Gallery NextJS',
            orderType,
            status: 'pending',
            statusUpdatedAt: createdAt,
            statusHistory: [buildOrderStatusHistoryEntry('pending', { at: createdAt })]
        };
    };

    const notifyPrivilegedUsersAboutOrder = async (currentUser, orderId) => {
        if (!currentUser || !orderId) {
            return;
        }

        const idToken = await currentUser.getIdToken();
        const response = await fetch('/api/notifications/order-created', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`
            },
            body: JSON.stringify({ orderId })
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(errorPayload?.error || 'Failed to create admin notifications');
        }
    };

    const checkoutCart = async () => {
        if (cartItems.length === 0) {
            showToast('العربة فارغة حالياً.', 'error');
            return { ok: false, error: 'empty-cart' };
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            return { ok: false, error: 'auth-required', requiresAuth: true };
        }

        setIsCheckingOut(true);

        try {
            let profileData = {};
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
                profileData = userDoc.data();
            }

            const orderData = buildOrderPayload({
                currentUser,
                profileData,
                items: cartItems.map((item) => ({
                    productId: item.productId || item.cartId,
                    productCode: item.productCode || '',
                    name: item.name,
                    title: item.title || item.name,
                    quantity: item.quantity,
                    price: Number(item.price) || 0,
                    image: item.image || '/logo.png',
                    category: item.category || ''
                })),
                totalPrice: cartSubtotal,
                itemCount: cartCount,
                orderType: 'retail'
            });

            orderData.websiteOrderRef = await allocateWebsiteOrderRef();

            const orderRef = await addDoc(collection(db, 'orders'), orderData);

            try {
                await notifyPrivilegedUsersAboutOrder(currentUser, orderRef.id);
            } catch (notificationError) {
                console.error('Admin order notification failed:', notificationError);
            }

            clearCart();
            closeCart();
            showToast('تم إرسال طلبك بنجاح.');
            return { ok: true };
        } catch (error) {
            console.error('Checkout failed:', error);
            showToast('تعذر إرسال الطلب حالياً. حاول مرة أخرى.', 'error');
            return { ok: false, error: 'checkout-failed' };
        } finally {
            setIsCheckingOut(false);
        }
    };

    const checkoutWholesaleCart = async () => {
        if (wholesaleCartItems.length === 0) {
            showToast('طلب الجملة فارغ حالياً.', 'error');
            return { ok: false, error: 'empty-cart' };
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            return { ok: false, error: 'auth-required', requiresAuth: true };
        }

        if (!isWholesaleCustomer) {
            showToast('هذا الطلب متاح فقط لحسابات الجملة والإدارة.', 'error');
            return { ok: false, error: 'role-required' };
        }

        setIsCheckingOutWholesale(true);

        try {
            let profileData = {};
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
                profileData = userDoc.data();
            }

            const orderData = buildOrderPayload({
                currentUser,
                profileData,
                items: wholesaleCartItems.map((item) => ({
                    productId: item.productId || item.cartId,
                    productCode: item.productCode || '',
                    name: item.name,
                    title: item.title || item.name,
                    quantity: item.quantity,
                    wholesalePrice: Number(item.price) || 0,
                    price: Number(item.price) || 0,
                    image: item.image || '/logo.png',
                    category: item.category || ''
                })),
                totalPrice: wholesaleCartSubtotal,
                itemCount: wholesaleCartCount,
                orderType: 'wholesale'
            });

            orderData.websiteOrderRef = await allocateWebsiteOrderRef();

            const orderRef = await addDoc(collection(db, 'orders'), orderData);

            try {
                await notifyPrivilegedUsersAboutOrder(currentUser, orderRef.id);
            } catch (notificationError) {
                console.error('Admin wholesale order notification failed:', notificationError);
            }

            clearWholesaleCart();
            closeWholesaleCart();
            showToast('تم إرسال طلب الجملة بنجاح.');
            return { ok: true };
        } catch (error) {
            console.error('Wholesale checkout failed:', error);
            showToast('تعذر إرسال طلب الجملة حالياً. حاول مرة أخرى.', 'error');
            return { ok: false, error: 'checkout-failed' };
        } finally {
            setIsCheckingOutWholesale(false);
        }
    };

    return (
        <GalleryContext.Provider value={{
            dcProductsMap,
            dcStockMap,
            filteredProducts,
            allProducts: catalogProducts,
            categories,
            brands,
            isLoading,
            userRole,
            isWholesaleCustomer,
            searchQuery,
            setSearchQuery,
            activeCategory,
            setActiveCategory: setActiveCategoryFilter,
            selectedCategories,
            selectedBrands,
            selectedOrigins,
            hideOutOfStockProducts,
            toggleCategoryFilter,
            toggleBrandFilter,
            toggleOriginFilter,
            toggleStockFilter,
            clearAllFilters,
            removeFilterChip,
            categoryFacetEntries,
            brandFacetEntries,
            originFacetEntries,
            activeFilterChips,
            primaryFilterDisplayLabel,
            selectedProduct: resolvedSelectedProduct,
            setSelectedProduct,
            dcLiveUpdateAt,
            dcSyncedAt,
            refreshDcCatalog,
            cartItems,
            cartCount,
            cartSubtotal,
            isCartOpen,
            openCart,
            closeCart,
            addToCart,
            removeFromCart,
            updateCartQuantity,
            clearCart,
            checkoutCart,
            wholesaleCartItems,
            wholesaleCartCount,
            wholesaleCartSubtotal,
            isWholesaleCartOpen,
            openWholesaleCart,
            closeWholesaleCart,
            addToWholesaleCart,
            removeFromWholesaleCart,
            updateWholesaleCartQuantity,
            getCartItemStockLimit,
            getProductStockLimit,
            getProductStockStatus,
            clearWholesaleCart,
            checkoutWholesaleCart,
            isCheckingOut,
            isCheckingOutWholesale,
            toast,
            showToast,
            dismissToast
        }}>
            {children}
        </GalleryContext.Provider>
    );
}

export const useGallery = () => useContext(GalleryContext);