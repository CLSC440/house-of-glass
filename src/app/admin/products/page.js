'use client';
import { useEffect, useMemo, useState } from 'react';
import { useGallery } from '@/contexts/GalleryContext';
import AdminProductModal from '@/components/admin/AdminProductModal';
import { parseTimestamp } from '@/lib/utils/format';
import { db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

function parseNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeLabel(value, fallback) {
    const normalized = String(value || '').trim();
    return normalized || fallback;
}

function normalizeStockKey(value) {
    return String(value || '').trim().toLowerCase();
}

function getProductTitle(product) {
    return normalizeLabel(product?.name || product?.title, 'Unnamed Product');
}

function getProductImage(product) {
    const firstMedia = Array.isArray(product?.images) && product.images.length > 0
        ? product.images[0]
        : Array.isArray(product?.media) && product.media.length > 0
            ? product.media[0]
            : null;

    if (!firstMedia) return '/logo.png';
    return firstMedia?.url || firstMedia?.primaryUrl || firstMedia || '/logo.png';
}

function getProductBrand(product) {
    return normalizeLabel(
        product?.brand || product?.brand_name || product?.manufacturer || product?.company,
        'Generic'
    );
}

function getProductOrigin(product) {
    return normalizeLabel(product?.origin || product?.country || product?.countryOfOrigin, 'Unknown');
}

function getRetailPrice(product) {
    return parseNumber(
        product?.retailPrice
        || product?.retail_price
        || product?.salePrice
        || product?.sellingPrice
        || product?.price
    );
}

function getWholesalePrice(product) {
    return parseNumber(
        product?.wholesalePrice
        || product?.wholesale_price
        || product?.cartonPrice
        || product?.bulkPrice
        || product?.priceWholesale
    );
}

function getDiscountValue(product, retailPrice) {
    const explicitDiscount = parseNumber(
        product?.discount_amount
        || product?.discountAmount
        || product?.discount
        || product?.discountValue
        || product?.retailDiscount
    );

    if (explicitDiscount > 0) return explicitDiscount;

    const netPrice = parseNumber(product?.netPrice || product?.net_price || product?.net);
    if (netPrice > 0 && retailPrice > netPrice) {
        return retailPrice - netPrice;
    }

    return 0;
}

function getNetPrice(product, retailPrice) {
    const explicitNet = parseNumber(product?.netPrice || product?.net_price || product?.net);
    if (explicitNet > 0) return explicitNet;

    const discountValue = getDiscountValue(product, retailPrice);
    if (discountValue > 0 && retailPrice > discountValue) {
        return retailPrice - discountValue;
    }

    return retailPrice;
}

function getViewsCount(product) {
    return parseNumber(product?.viewCount || product?.views || product?.productViews || product?.hits);
}

function getStockValue(product) {
    const stockValue = Number(product?.remainingQuantity ?? product?.totalStock ?? product?.total_stock ?? product?.quantity);
    return Number.isFinite(stockValue) ? stockValue : null;
}

function getStockTone(product) {
    const stockStatus = String(product?.stockStatus || '').toLowerCase();
    const stockDetails = getDetailedStock(product);
    const stockValue = stockDetails.totalStock;
    const variants = getVariants(product);

    if (variants.length > 0) {
        const uniqueVariantStates = [];
        const seenVariantKeys = new Set();

        variants.forEach((variant, variantIndex) => {
            const variantKey = normalizeStockKey(
                variant?.code
                || variant?.barcode
                || variant?.matchedBarcode
                || `${product?.id || 'product'}-variant-${variantIndex}`
            );

            if (seenVariantKeys.has(variantKey)) return;
            seenVariantKeys.add(variantKey);

            const variantTotal = parseNumber(variant?.showroomStock ?? variant?.retailStock) + parseNumber(variant?.warehouseStock ?? variant?.wholesaleStock);
            uniqueVariantStates.push(variantTotal > 0);
        });

        const hasInStockVariants = uniqueVariantStates.some(Boolean);
        const hasOutOfStockVariants = uniqueVariantStates.some((state) => !state);

        if (hasInStockVariants && hasOutOfStockVariants) {
            return {
                label: 'Partial stock',
                className: 'border-amber-400/25 bg-amber-400/10 text-amber-200'
            };
        }

        if (!hasInStockVariants && uniqueVariantStates.length > 0) {
            return {
                label: 'Out of stock',
                className: 'border-rose-500/25 bg-rose-500/10 text-rose-300'
            };
        }
    }

    if (stockStatus === 'out_of_stock' || stockValue === 0) {
        return {
            label: 'Out of stock',
            className: 'border-rose-500/25 bg-rose-500/10 text-rose-300'
        };
    }

    if (stockStatus === 'low_stock' || (stockValue !== null && stockValue > 0 && stockValue <= 5)) {
        return {
            label: stockValue !== null ? `Low stock: ${stockValue}` : 'Low stock',
            className: 'border-amber-400/25 bg-amber-400/10 text-amber-200'
        };
    }

    if (stockValue !== null) {
        return {
            label: 'In stock',
            className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
        };
    }

    return {
        label: 'Stock not synced',
        className: 'border-white/10 bg-white/[0.05] text-slate-300'
    };
}

function getDetailedStock(product) {
    const variants = getVariants(product);

    let showroomStock = Number(product?.showroomStock ?? product?.retailStock);
    let warehouseStock = Number(product?.warehouseStock ?? product?.wholesaleStock);
    let totalStock = getStockValue(product);

    if (variants.length > 0) {
        const seenVariantKeys = new Set();
        let summedShowroomStock = 0;
        let summedWarehouseStock = 0;

        variants.forEach((variant, variantIndex) => {
            const variantKey = normalizeStockKey(
                variant?.code
                || variant?.barcode
                || variant?.matchedBarcode
                || `${product?.id || 'product'}-variant-${variantIndex}`
            );

            if (seenVariantKeys.has(variantKey)) return;
            seenVariantKeys.add(variantKey);

            summedShowroomStock += parseNumber(variant?.showroomStock ?? variant?.retailStock);
            summedWarehouseStock += parseNumber(variant?.warehouseStock ?? variant?.wholesaleStock);
        });

        showroomStock = summedShowroomStock;
        warehouseStock = summedWarehouseStock;
        totalStock = summedShowroomStock + summedWarehouseStock;
    }

    const normalizedShowroomStock = Number.isFinite(showroomStock) ? showroomStock : null;
    const normalizedWarehouseStock = Number.isFinite(warehouseStock) ? warehouseStock : null;
    const normalizedTotalStock = Number.isFinite(totalStock) ? totalStock : null;
    const hasDetailedBuckets = normalizedShowroomStock !== null || normalizedWarehouseStock !== null;

    return {
        showroomStock: normalizedShowroomStock,
        warehouseStock: normalizedWarehouseStock,
        totalStock: normalizedTotalStock,
        hasDetailedBuckets,
        hasAnyStockData: hasDetailedBuckets || normalizedTotalStock !== null || String(product?.stockStatus || '').trim() !== ''
    };
}

function getVariants(product) {
    return Array.isArray(product?.variants) ? product.variants : [];
}

function getMediaCount(product) {
    const imagesCount = Array.isArray(product?.images) ? product.images.length : 0;
    const mediaCount = Array.isArray(product?.media) ? product.media.length : 0;
    return Math.max(imagesCount, mediaCount);
}

function getImageKitMediaCount(product) {
    const images = Array.isArray(product?.images) ? product.images : [];
    const media = Array.isArray(product?.media) ? product.media : [];

    return [...images, ...media].filter((entry) => {
        if (typeof entry === 'string') {
            return entry.includes('ik.imagekit.io');
        }

        const url = entry?.url || entry?.primaryUrl || '';
        const provider = String(entry?.provider || '').toLowerCase();
        return provider === 'imagekit' || url.includes('ik.imagekit.io');
    }).length;
}

function shouldShowStockBadge(product) {
    return getStockValue(product) !== null || String(product?.stockStatus || '').trim() !== '';
}

function getDisplayBrandTag(product) {
    const brand = getProductBrand(product);
    return brand === 'Generic' ? '' : brand;
}

function formatCurrency(value) {
    return parseNumber(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatProductDate(value) {
    if (!value) return 'Not available';

    if (typeof value === 'string') {
        return parseTimestamp(value);
    }

    if (typeof value?.toDate === 'function') {
        return parseTimestamp(value.toDate().toISOString());
    }

    if (value?.seconds) {
        return parseTimestamp(new Date(value.seconds * 1000).toISOString());
    }

    return 'Not available';
}

function getProductHistoryEntries(product) {
    const rawHistory = product?.editHistory || product?.history || product?.changeLog || product?.auditLog;
    return Array.isArray(rawHistory) ? rawHistory : [];
}

function ProductHistoryModal({ product, onClose, onDelete }) {
    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    if (!product) return null;

    const historyEntries = getProductHistoryEntries(product);

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-6">
            <div className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#1c2438_0%,#131b2e_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 md:px-7">
                    <div>
                        <h2 className="text-2xl font-black text-brandGold">Edit History</h2>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{getProductTitle(product)}</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-2 text-slate-400 transition-colors hover:text-white">
                        <i className="fa-solid fa-xmark text-2xl"></i>
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 md:px-6">
                    {historyEntries.length > 0 ? historyEntries.map((entry, index) => {
                        const actor = normalizeLabel(entry?.email || entry?.userEmail || entry?.updatedBy || entry?.actor, 'System');
                        const changes = Array.isArray(entry?.changes)
                            ? entry.changes
                            : Array.isArray(entry?.items)
                                ? entry.items
                                : [];

                        return (
                            <div key={`${actor}-${index}`} className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brandGold/14 text-lg font-black text-brandGold">
                                            {actor.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-lg font-black text-white">{actor}</p>
                                            <p className="mt-1 text-sm text-slate-400">{formatProductDate(entry?.updatedAt || entry?.createdAt || entry?.date)}</p>
                                        </div>
                                    </div>
                                    <span className="rounded-xl bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#5f84ff]">Update</span>
                                </div>

                                {changes.length > 0 ? (
                                    <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-[#20293d] px-4 py-3">
                                        <p className="text-sm font-bold text-slate-200">Changes:</p>
                                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                                            {changes.map((change, changeIndex) => (
                                                <li key={changeIndex} className="flex gap-3">
                                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                                                    <span>{typeof change === 'string' ? change : JSON.stringify(change)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                            </div>
                        );
                    }) : (
                        <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-5 text-slate-300">
                            <p className="text-lg font-black text-white">No stored edit history yet</p>
                            <p className="mt-2 text-sm leading-7 text-slate-400">This product can still be edited from the products dashboard. The current data available now is the latest saved state with timestamps only.</p>
                            <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                                <div className="rounded-2xl border border-white/8 bg-[#20293d] px-4 py-3">
                                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Created</p>
                                    <p className="mt-2 font-semibold text-white">{formatProductDate(product?.createdAt)}</p>
                                </div>
                                <div className="rounded-2xl border border-white/8 bg-[#20293d] px-4 py-3">
                                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Last Update</p>
                                    <p className="mt-2 font-semibold text-white">{formatProductDate(product?.updatedAt)}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3 border-t border-white/10 bg-[#141c2f] px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Code: {normalizeLabel(product?.code || product?.barcode, 'N/A')}</div>
                    <button
                        type="button"
                        onClick={() => onDelete(product.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-rose-300 transition-colors hover:bg-rose-500/18"
                    >
                        <i className="fa-solid fa-trash"></i>
                        Delete Product
                    </button>
                </div>
            </div>
        </div>
    );
}

const MEDIA_FILTERS = [
    { value: 'all', label: 'All Media' },
    { value: 'with-media', label: 'Has Media' },
    { value: 'with-variants', label: 'Has Variants' },
    { value: 'without-media', label: 'No Media' }
];

const VIEWS_FILTERS = [
    { value: 'all', label: 'All Views' },
    { value: 'high', label: 'High Views' },
    { value: 'low', label: 'Low Views' },
    { value: 'none', label: 'No Views' }
];

const SORT_OPTIONS = [
    { value: 'highest-views', label: 'Sort: Highest Views' },
    { value: 'lowest-views', label: 'Sort: Lowest Views' },
    { value: 'name-asc', label: 'Sort: Name A-Z' },
    { value: 'name-desc', label: 'Sort: Name Z-A' },
    { value: 'retail-high', label: 'Sort: Highest Retail' },
    { value: 'stock-low', label: 'Sort: Lowest Stock' },
    { value: 'recent', label: 'Sort: Newest' }
];

export default function AdminProducts() {
    const { allProducts, categories, brands, isLoading } = useGallery();
    const [search, setSearch] = useState('');
    const [mediaFilter, setMediaFilter] = useState('all');
    const [viewsFilter, setViewsFilter] = useState('all');
    const [brandFilter, setBrandFilter] = useState('all');
    const [originFilter, setOriginFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [sortBy, setSortBy] = useState('recent');
    const [viewMode, setViewMode] = useState('list');
    const [expandedProductIds, setExpandedProductIds] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [historyProduct, setHistoryProduct] = useState(null);

    const categoryOptions = [
        'all',
        ...Array.from(new Set([
            ...categories.map((category) => normalizeLabel(category?.name || category?.id, '')),
            ...allProducts.map((product) => normalizeLabel(product?.category, ''))
        ].filter(Boolean)))
    ];

    const brandOptions = [
        'all',
        ...Array.from(new Set(allProducts.map((product) => getProductBrand(product)))).sort((left, right) => left.localeCompare(right))
    ];

    const originOptions = [
        'all',
        ...Array.from(new Set(allProducts.map((product) => getProductOrigin(product)))).sort((left, right) => left.localeCompare(right))
    ];

    const filteredProducts = useMemo(() => {
        return allProducts
            .filter((product) => {
                const searchValue = search.trim().toLowerCase();
                const variants = getVariants(product);
                const searchMatches = !searchValue || [
                    getProductTitle(product),
                    product?.code,
        product?.category,
        getProductBrand(product),
        getProductOrigin(product),
        ...variants.flatMap((variant) => [variant?.name, variant?.label, variant?.code])
    ].some((value) => String(value || '').toLowerCase().includes(searchValue));

    if (!searchMatches) return false;
                const mediaCount = getMediaCount(product);
                if (mediaFilter === 'with-media' && mediaCount <= 0) return false;
                if (mediaFilter === 'without-media' && mediaCount > 0) return false;
                if (mediaFilter === 'with-variants' && variants.length <= 0) return false;

                const viewsCount = getViewsCount(product);
                if (viewsFilter === 'high' && viewsCount < 20) return false;
                if (viewsFilter === 'low' && (viewsCount === 0 || viewsCount >= 20)) return false;
                if (viewsFilter === 'none' && viewsCount > 0) return false;

                if (brandFilter !== 'all' && getProductBrand(product) !== brandFilter) return false;
                if (originFilter !== 'all' && getProductOrigin(product) !== originFilter) return false;
                if (categoryFilter !== 'all' && normalizeLabel(product?.category, 'General') !== categoryFilter) return false;

                return true;
            })
            .sort((leftProduct, rightProduct) => {
                if (sortBy === 'highest-views') return getViewsCount(rightProduct) - getViewsCount(leftProduct);
                if (sortBy === 'lowest-views') return getViewsCount(leftProduct) - getViewsCount(rightProduct);
                if (sortBy === 'name-asc') return getProductTitle(leftProduct).localeCompare(getProductTitle(rightProduct));
                if (sortBy === 'name-desc') return getProductTitle(rightProduct).localeCompare(getProductTitle(leftProduct));
                if (sortBy === 'retail-high') return getRetailPrice(rightProduct) - getRetailPrice(leftProduct);
                if (sortBy === 'stock-low') return parseNumber(getStockValue(leftProduct) ?? Number.MAX_SAFE_INTEGER) - parseNumber(getStockValue(rightProduct) ?? Number.MAX_SAFE_INTEGER);

                const rightUpdatedAt = rightProduct?.updatedAt?.seconds || 0;
                const leftUpdatedAt = leftProduct?.updatedAt?.seconds || 0;
                return rightUpdatedAt - leftUpdatedAt;
            });
}, [allProducts, search, mediaFilter, viewsFilter, brandFilter, originFilter, categoryFilter, sortBy]);

    const handleEdit = (product) => {
        setEditingProduct(product);
        setModalOpen(true);
    };

    const handleAdd = () => {
        setEditingProduct(null);
        setModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this product?')) return;

        try {
            await deleteDoc(doc(db, 'products', id));
            setHistoryProduct(null);
        } catch (err) {
            console.error(err);
            alert('Failed to delete product');
        }
    };

    const toggleVariants = (productId) => {
        setExpandedProductIds((currentValue) => currentValue.includes(productId)
            ? currentValue.filter((entry) => entry !== productId)
            : [...currentValue, productId]);
    };

    useEffect(() => {
        setExpandedProductIds((currentValue) => {
            const nextValue = currentValue.filter((id) => filteredProducts.some((product) => product.id === id));
            if (nextValue.length === currentValue.length && nextValue.every((id, index) => id === currentValue[index])) {
                return currentValue;
            }
            return nextValue;
        });
    }, [filteredProducts]);

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <header className="flex flex-col gap-3 rounded-[1.45rem] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(193,155,78,0.14),transparent_34%),linear-gradient(180deg,rgba(22,31,53,0.98),rgba(13,19,34,0.98))] px-5 py-5 shadow-[0_18px_40px_rgba(4,8,20,0.24)] lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Products Control</p>
                    <h1 className="mt-1.5 text-[1.7rem] font-black text-brandGold">Products Data</h1>
                    <p className="mt-1.5 text-sm text-slate-400">Manage your gallery products directly</p>
                </div>
                <div className="inline-flex items-center gap-3 self-start rounded-full border border-brandGold/15 bg-brandGold/8 px-4 py-2 text-sm font-black text-slate-200">
                    <span className="uppercase tracking-[0.2em] text-brandGold">Quick Tools</span>
                    <span className="text-slate-300">Use dashboard shortcuts for navigation, then manage product data here</span>
                </div>
            </header>

            <section className="rounded-[1.7rem] border border-white/8 bg-[linear-gradient(180deg,#182238_0%,#141d31_100%)] p-4 shadow-[0_18px_40px_rgba(4,8,20,0.24)] md:p-4.5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Product Filters</p>
                        <h2 className="mt-1.5 text-[2.2rem] font-black text-brandGold">Find products faster</h2>
                    </div>
                    <div className="inline-flex items-center gap-3 self-start rounded-full border border-brandGold/15 bg-brandGold/8 px-4 py-2 text-sm font-black text-slate-200">
                        <span className="uppercase tracking-[0.2em] text-brandGold">Products</span>
                        <span className="text-slate-300">Showing {filteredProducts.length} of {allProducts.length} products</span>
                    </div>
                </div>

                <div className="mt-4 grid gap-2.5 xl:grid-cols-[minmax(0,1.2fr)_repeat(6,minmax(0,0.52fr))_auto]">
                    <label className="relative block xl:col-span-1">
                        <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                        <input
                            type="text"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search products..."
                            className="h-12 w-full rounded-[0.95rem] border border-white/6 bg-[#222b41] pl-12 pr-4 text-base text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/35"
                        />
                    </label>

                    <select value={mediaFilter} onChange={(event) => setMediaFilter(event.target.value)} className="h-12 rounded-[0.95rem] border border-white/6 bg-[#222b41] px-4 text-sm font-semibold text-white outline-none transition-colors focus:border-brandGold/35">
                        {MEDIA_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>

                    <select value={viewsFilter} onChange={(event) => setViewsFilter(event.target.value)} className="h-12 rounded-[0.95rem] border border-white/6 bg-[#222b41] px-4 text-sm font-semibold text-white outline-none transition-colors focus:border-brandGold/35">
                        {VIEWS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>

                    <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} className="h-12 rounded-[0.95rem] border border-white/6 bg-[#222b41] px-4 text-sm font-semibold text-white outline-none transition-colors focus:border-brandGold/35">
                        {brandOptions.map((option) => <option key={option} value={option}>{option === 'all' ? 'All Brand' : option}</option>)}
                    </select>

                    <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)} className="h-12 rounded-[0.95rem] border border-white/6 bg-[#222b41] px-4 text-sm font-semibold text-white outline-none transition-colors focus:border-brandGold/35">
                        {originOptions.map((option) => <option key={option} value={option}>{option === 'all' ? 'All Origin' : option}</option>)}
                    </select>

                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-12 rounded-[0.95rem] border border-white/6 bg-[#222b41] px-4 text-sm font-semibold text-white outline-none transition-colors focus:border-brandGold/35">
                        {categoryOptions.map((option) => <option key={option} value={option}>{option === 'all' ? 'All Category' : option}</option>)}
                    </select>

                    <div className="flex items-center gap-2 rounded-[0.95rem] border border-white/6 bg-[#222b41] p-1.5">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${viewMode === 'grid' ? 'bg-white/[0.08] text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
                            aria-label="Grid view"
                        >
                            <i className="fa-solid fa-grip"></i>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${viewMode === 'list' ? 'bg-brandGold/16 text-brandGold' : 'text-slate-500 hover:text-slate-300'}`}
                            aria-label="List view"
                        >
                            <i className="fa-solid fa-bars"></i>
                        </button>
                    </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 xl:items-end">
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-12 w-full rounded-[0.95rem] border border-white/6 bg-[#222b41] px-4 text-sm font-semibold text-white outline-none transition-colors focus:border-brandGold/35 md:max-w-xs">
                        {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </div>
            </section>

            {isLoading ? (
                <div className="rounded-[1.7rem] border border-white/8 bg-[#161f35] p-8 text-center text-slate-400">Loading products...</div>
            ) : filteredProducts.length === 0 ? (
                <div className="rounded-[1.7rem] border border-white/8 bg-[#161f35] p-8 text-center text-slate-400">No products matched the current filters.</div>
            ) : (
                <div className={`grid gap-3 ${viewMode === 'grid' ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
                    {filteredProducts.map((product, index) => {
                        const variants = getVariants(product);
                        const retailPrice = getRetailPrice(product);
                        const wholesalePrice = getWholesalePrice(product);
                        const discountValue = getDiscountValue(product, retailPrice);
                        const netPrice = getNetPrice(product, retailPrice);
                        const stockTone = getStockTone(product);
                        const stockDetails = getDetailedStock(product);
                        const brandTag = getDisplayBrandTag(product);
                        const totalMedia = getMediaCount(product);
                        const imageKitMediaCount = getImageKitMediaCount(product);
                        const isExpanded = expandedProductIds.includes(product.id);

                        return (
                            <article key={product.id} className="rounded-[1.2rem] border border-white/8 bg-[linear-gradient(180deg,#182238_0%,#141d31_100%)] px-4 py-3.5 shadow-[0_18px_40px_rgba(4,8,20,0.2)] md:px-4 md:py-3.5">
                                <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="flex min-w-0 flex-1 gap-3">
                                        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[1rem] border border-white/8 bg-[#242d41] p-2">
                                            <img src={getProductImage(product)} alt={getProductTitle(product)} className="h-full w-full object-cover" />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-[1.05rem] font-black uppercase leading-tight tracking-[-0.03em] text-brandGold md:text-[1.15rem]">{getProductTitle(product)}</h3>
                                                <span className="rounded-lg bg-brandGold/15 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-brandGold">{normalizeLabel(product?.category, 'General')}</span>
                                                {brandTag ? (
                                                    <span className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-300">{brandTag}</span>
                                                ) : null}
                                            </div>

                                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.84rem] text-slate-400">
                                                <span>Order: <strong className="text-slate-200">{parseNumber(product?.sortOrder || product?.order || index + 1)}</strong></span>
                                                <span>Variants: <strong className="text-slate-200">{variants.length}</strong></span>
                                                <span>Images: <strong className="text-slate-200">{Array.isArray(product?.images) ? product.images.length : 0}</strong></span>
                                                <span>Code: <strong className="font-mono text-brandGold">{normalizeLabel(product?.code || product?.barcode, 'N/A')}</strong></span>
                                                <span>Views: <strong className="text-slate-200">{getViewsCount(product)}</strong></span>
                                                <span>Media: <strong className="text-emerald-400">{`${imageKitMediaCount}/${totalMedia} IK`}</strong></span>
                                            </div>

                                            <div className="mt-2.5 border-t border-dashed border-white/10 pt-2.5">
                                                {shouldShowStockBadge(product) ? (
                                                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${stockTone.className}`}>
                                                        {stockTone.label}
                                                    </div>
                                                ) : null}

                                                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Net | Disc.</p>
                                                        <div className="mt-1 flex items-baseline gap-2">
                                                            <span className="text-[1rem] font-black text-emerald-400 md:text-[1.05rem]">{formatCurrency(netPrice)}</span>
                                                            <span className="text-[0.92rem] font-black text-rose-400">{discountValue > 0 ? formatCurrency(discountValue).replace('.00', '') : '0'}</span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Retail</p>
                                                        <p className="mt-1 text-[1rem] font-black text-white md:text-[1.05rem]">{formatCurrency(retailPrice)}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Wholesale</p>
                                                        <p className="mt-1 text-[1rem] font-black text-brandGold md:text-[1.05rem]">{formatCurrency(wholesalePrice)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 flex-col gap-2 lg:w-[220px] lg:pl-3">
                                        <div className="flex items-start justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleEdit(product)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-brandGold/20 bg-brandGold/12 px-3 py-1.5 text-[0.95rem] font-black text-brandGold transition-colors hover:bg-brandGold/20"
                                            >
                                                <i className="fa-solid fa-pen-to-square"></i>
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setHistoryProduct(product)}
                                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:border-brandGold/25 hover:text-brandGold"
                                                aria-label="View product history"
                                            >
                                                <i className="fa-solid fa-circle-info"></i>
                                            </button>
                                        </div>

                                        {stockDetails.hasAnyStockData ? (
                                            <div className="rounded-[1rem] border border-white/8 bg-[#1a2337] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Stock</p>
                                                </div>

                                                <div className="mt-2 grid grid-cols-2 gap-3">
                                                    <div className="rounded-[0.9rem] border border-blue-500/15 bg-blue-500/8 px-3 py-2.5 text-center">
                                                        <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-500">Showroom</p>
                                                        <p className="mt-1 text-[0.95rem] font-black text-blue-300">{stockDetails.showroomStock ?? 0}</p>
                                                    </div>
                                                    <div className="rounded-[0.9rem] border border-amber-400/15 bg-amber-400/8 px-3 py-2.5 text-center">
                                                        <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-500">Warehouse</p>
                                                        <p className="mt-1 text-[0.95rem] font-black text-amber-300">{stockDetails.warehouseStock ?? 0}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                {variants.length > 0 ? (
                                    <div className="mt-2.5">
                                        <button
                                            type="button"
                                            onClick={() => toggleVariants(product.id)}
                                            className="inline-flex items-center gap-2 rounded-xl bg-brandGold/14 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-brandGold transition-colors hover:bg-brandGold/20"
                                        >
                                            <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]`}></i>
                                            Variants Pricing
                                        </button>

                                        {isExpanded ? (
                                            <div className="mt-2.5 overflow-hidden rounded-[1rem] border border-white/10 bg-[#20293d]">
                                                <div className="grid grid-cols-[minmax(0,1.3fr)_88px_70px_88px_110px_136px] gap-3 border-b border-white/8 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                                    <span>Variant</span>
                                                    <span>Net</span>
                                                    <span>Disc</span>
                                                    <span>Retail</span>
                                                    <span>Wholesale</span>
                                                    <span className="text-right">Stock</span>
                                                </div>

                                                {variants.map((variant, variantIndex) => {
                                                    const variantRetail = parseNumber(variant?.price || variant?.retailPrice || variant?.retail_price || retailPrice);
                                                    const variantWholesale = parseNumber(variant?.wholesalePrice || variant?.wholesale_price || variant?.cartonPrice || wholesalePrice);
                                                    const variantDiscount = parseNumber(
                                                        variant?.discount_amount
                                                        || variant?.discountAmount
                                                        || variant?.discount
                                                        || variant?.discountValue
                                                        || discountValue
                                                    );
                                                    const variantNet = parseNumber(
                                                        variant?.netPrice
                                                        || variant?.net_price
                                                        || variant?.net
                                                        || (variantRetail - variantDiscount)
                                                    ) || Math.max(0, variantRetail - variantDiscount);

                                                    return (
                                                        <div key={`${product.id}-variant-${variantIndex}`} className="grid grid-cols-[minmax(0,1.3fr)_88px_70px_88px_110px_136px] gap-3 border-b border-white/8 px-4 py-2.5 text-[0.85rem] text-slate-300 last:border-b-0">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-bold text-white">{normalizeLabel(variant?.name || variant?.label, `Variant ${variantIndex + 1}`)}</p>
                                                                <p className="mt-0.5 truncate text-[11px] text-slate-500">Barcode: {normalizeLabel(variant?.barcode || variant?.code, 'N/A')}</p>
                                                            </div>
                                                            <span className="font-black text-emerald-400">{formatCurrency(variantNet)}</span>
                                                            <span className="font-black text-rose-400">{variantDiscount > 0 ? formatCurrency(variantDiscount) : '0.00'}</span>
                                                            <span className="font-black text-white">{formatCurrency(variantRetail)}</span>
                                                            <span className="font-black text-brandGold">{formatCurrency(variantWholesale)}</span>
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <span className="inline-flex min-w-[58px] items-center justify-center rounded-full border border-blue-500/15 bg-blue-500/8 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-300">
                                                                    {parseNumber(variant?.showroomStock ?? variant?.retailStock)}
                                                                </span>
                                                                <span className="inline-flex min-w-[58px] items-center justify-center rounded-full border border-amber-400/15 bg-amber-400/8 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-300">
                                                                    {parseNumber(variant?.warehouseStock ?? variant?.wholesaleStock)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            )}

            <AdminProductModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                product={editingProduct}
                categories={categories}
                brands={brands}
            />

            <ProductHistoryModal
                product={historyProduct}
                onClose={() => setHistoryProduct(null)}
                onDelete={handleDelete}
            />
        </div>
    );
}
