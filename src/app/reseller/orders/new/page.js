/* eslint-disable @next/next/no-img-element */
'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const INITIAL_CUSTOMER_FORM = Object.freeze({
    name: '',
    phone: '',
    notes: ''
});

function formatCurrency(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return 'Hidden';
    }

    return `${numericValue.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`;
}

function roundCurrency(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return Math.round((numericValue + Number.EPSILON) * 100) / 100;
}

function getSafeAmount(value, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : fallback;
}

function buildCatalogSearchIndex(entry = {}) {
    return [
        entry.title,
        entry.productName,
        entry.variantLabel,
        entry.productCode,
        entry.category,
        entry.productId,
        entry.searchIndex
    ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');
}

function PricingValue({ label, value, accent = 'text-white' }) {
    return (
        <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={`mt-2 text-sm font-black ${accent}`}>{value === null || value < 0 ? 'Hidden' : formatCurrency(value)}</p>
        </div>
    );
}

function DraftMetric({ label, value, accent = 'text-white', isCurrency = true }) {
    return (
        <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={`mt-2 text-sm font-black ${accent}`}>{value < 0 ? 'Hidden' : isCurrency ? formatCurrency(value) : Number(value || 0).toLocaleString('en-US')}</p>
        </div>
    );
}

function StepChip({ label, isActive = false, isComplete = false }) {
    const className = isComplete
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
        : isActive
            ? 'border-brandGold/25 bg-brandGold/10 text-brandGold'
            : 'border-white/10 bg-white/[0.04] text-slate-400';

    return (
        <span className={`inline-flex items-center justify-center rounded-full border px-3.5 py-2 text-xs font-black uppercase tracking-[0.16em] ${className}`}>
            {label}
        </span>
    );
}

function buildDraftItem(entry = {}) {
    const wholesaleUnit = getSafeAmount(entry?.pricing?.wholesaleUnit, 0);
    const publicUnit = getSafeAmount(entry?.pricing?.publicUnit, 0);
    const retailBaseUnit = getSafeAmount(entry?.pricing?.retailBaseUnit, 0);
    const packUnit = getSafeAmount(entry?.pricing?.packUnit, 0);
    const defaultSellUnit = publicUnit || retailBaseUnit || packUnit || wholesaleUnit;

    return {
        key: entry.key,
        productId: entry.productId,
        title: entry.title,
        productCode: entry.productCode,
        category: entry.category,
        image: entry.image,
        isVariant: entry.isVariant === true,
        wholesaleUnit,
        publicUnit,
        retailBaseUnit,
        packUnit,
        quantity: 1,
        sellUnit: defaultSellUnit
    };
}

function buildDuplicatedDraftItem(item = {}) {
    const productTitle = String(item.productTitle || 'Unnamed product').trim() || 'Unnamed product';
    const variantLabel = String(item.variantLabel || '').trim();
    const title = variantLabel ? `${productTitle} / ${variantLabel}` : productTitle;

    return {
        key: String(item.selectionKey || item.variantKey || `product:${item.productId || item.lineId || Date.now()}`),
        productId: String(item.productId || '').trim(),
        title,
        productCode: String(item.code || '').trim(),
        category: String(item.category || '').trim(),
        image: item.image || '/logo.png',
        isVariant: Boolean(item.variantKey),
        wholesaleUnit: getSafeAmount(item.pricingSnapshot?.wholesaleUnit, 0),
        publicUnit: getSafeAmount(item.pricingSnapshot?.publicUnit, 0),
        retailBaseUnit: getSafeAmount(item.pricingSnapshot?.publicUnit, 0),
        packUnit: 0,
        quantity: Math.max(1, Math.floor(getSafeAmount(item.quantity, 1))),
        sellUnit: getSafeAmount(item.pricingSnapshot?.sellUnit, 0)
    };
}

function calculateDraftItem(item = {}) {
    const quantity = Math.max(1, Math.floor(getSafeAmount(item.quantity, 1)));
    const wholesaleUnit = roundCurrency(getSafeAmount(item.wholesaleUnit, 0));
    const publicUnit = roundCurrency(getSafeAmount(item.publicUnit, 0));
    const retailBaseUnit = roundCurrency(getSafeAmount(item.retailBaseUnit, 0));
    const packUnit = roundCurrency(getSafeAmount(item.packUnit, 0));
    const sellUnit = roundCurrency(getSafeAmount(item.sellUnit, 0));
    const unitProfit = roundCurrency(sellUnit - wholesaleUnit);
    const wholesaleTotal = roundCurrency(wholesaleUnit * quantity);
    const sellTotal = roundCurrency(sellUnit * quantity);
    const profitTotal = roundCurrency(unitProfit * quantity);

    return {
        ...item,
        quantity,
        wholesaleUnit,
        publicUnit,
        retailBaseUnit,
        packUnit,
        sellUnit,
        unitProfit,
        wholesaleTotal,
        sellTotal,
        profitTotal
    };
}

function calculateDraftSummary(items = []) {
    return items.reduce((summary, item) => ({
        itemsCount: summary.itemsCount + 1,
        quantity: summary.quantity + item.quantity,
        wholesaleTotal: roundCurrency(summary.wholesaleTotal + item.wholesaleTotal),
        sellTotal: roundCurrency(summary.sellTotal + item.sellTotal),
        profitTotal: roundCurrency(summary.profitTotal + item.profitTotal)
    }), {
        itemsCount: 0,
        quantity: 0,
        wholesaleTotal: 0,
        sellTotal: 0,
        profitTotal: 0
    });
}

export default function NewResellerOrderPage() {
    const searchParams = useSearchParams();
    const duplicateOrderId = String(searchParams?.get('duplicateOrderId') || '').trim();

    const [catalogState, setCatalogState] = useState({
        loading: true,
        error: '',
        items: [],
        meta: {
            count: 0,
            priceIncreasePercentage: 0,
            branchPickupOnly: true
        }
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEntryKey, setSelectedEntryKey] = useState('');
    const [draftItems, setDraftItems] = useState([]);
    const [currentStep, setCurrentStep] = useState('catalog');
    const [currentUser, setCurrentUser] = useState(null);
    const [customerForm, setCustomerForm] = useState(() => ({ ...INITIAL_CUSTOMER_FORM }));
    const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [savedOrder, setSavedOrder] = useState(null);
    const [duplicateSource, setDuplicateSource] = useState(null);
    const [duplicateHydratedFor, setDuplicateHydratedFor] = useState('');
    const [isHydratingDuplicate, setIsHydratingDuplicate] = useState(false);
    const deferredSearchQuery = useDeferredValue(searchQuery);

    useEffect(() => {
        let isDisposed = false;

        const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
            if (!nextUser) {
                if (!isDisposed) {
                    setCurrentUser(null);
                    setCatalogState({
                        loading: false,
                        error: 'Login required to load the reseller catalog.',
                        items: [],
                        meta: {
                            count: 0,
                            priceIncreasePercentage: 0,
                            branchPickupOnly: true
                        }
                    });
                }
                return;
            }

            try {
                if (!isDisposed) {
                    setCurrentUser(nextUser);
                    setCatalogState((currentValue) => ({
                        ...currentValue,
                        loading: true,
                        error: ''
                    }));
                }

                const idToken = await nextUser.getIdToken();
                const response = await fetch('/api/reseller/catalog', {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${idToken}`
                    },
                    cache: 'no-store'
                });

                const responseData = await response.json().catch(() => ({}));
                if (!response.ok || responseData?.success === false) {
                    throw new Error(responseData?.error || `Request failed (${response.status})`);
                }

                if (isDisposed) {
                    return;
                }

                setCatalogState({
                    loading: false,
                    error: '',
                    items: Array.isArray(responseData.items) ? responseData.items : [],
                    meta: {
                        count: Number(responseData?.meta?.count || 0),
                        priceIncreasePercentage: Number(responseData?.meta?.priceIncreasePercentage || 0),
                        branchPickupOnly: responseData?.meta?.branchPickupOnly !== false
                    }
                });
            } catch (error) {
                if (!isDisposed) {
                    setCatalogState({
                        loading: false,
                        error: error?.message || 'Failed to load reseller catalog.',
                        items: [],
                        meta: {
                            count: 0,
                            priceIncreasePercentage: 0,
                            branchPickupOnly: true
                        }
                    });
                }
            }
        });

        return () => {
            isDisposed = true;
            unsubscribe();
        };
    }, []);

    const filteredEntries = useMemo(() => {
        const normalizedQuery = String(deferredSearchQuery || '').trim().toLowerCase();
        if (!normalizedQuery) {
            return catalogState.items;
        }

        return catalogState.items.filter((entry) => buildCatalogSearchIndex(entry).includes(normalizedQuery));
    }, [catalogState.items, deferredSearchQuery]);

    useEffect(() => {
        if (filteredEntries.length === 0) {
            if (selectedEntryKey) {
                setSelectedEntryKey('');
            }
            return;
        }

        const hasSelectedEntry = filteredEntries.some((entry) => entry.key === selectedEntryKey);
        if (!hasSelectedEntry) {
            setSelectedEntryKey(filteredEntries[0].key);
        }
    }, [filteredEntries, selectedEntryKey]);

    const selectedEntry = useMemo(() => {
        return filteredEntries.find((entry) => entry.key === selectedEntryKey)
            || catalogState.items.find((entry) => entry.key === selectedEntryKey)
            || null;
    }, [catalogState.items, filteredEntries, selectedEntryKey]);

    const normalizedDraftItems = useMemo(() => draftItems.map((item) => calculateDraftItem(item)), [draftItems]);
    const draftSummary = useMemo(() => calculateDraftSummary(normalizedDraftItems), [normalizedDraftItems]);
    const canContinueToCustomer = normalizedDraftItems.length > 0;
    const canContinueToReview = canContinueToCustomer
        && customerForm.name.trim().length > 0
        && customerForm.phone.trim().length > 0;

    useEffect(() => {
        if (normalizedDraftItems.length === 0 && currentStep !== 'catalog') {
            setCurrentStep('catalog');
        }
    }, [currentStep, normalizedDraftItems.length]);

    useEffect(() => {
        if (!duplicateOrderId || !currentUser || duplicateHydratedFor === duplicateOrderId) {
            return;
        }

        let isDisposed = false;

        const hydrateDuplicateOrder = async () => {
            try {
                setIsHydratingDuplicate(true);
                setSubmitError('');

                const idToken = await currentUser.getIdToken();
                const response = await fetch(`/api/reseller/orders/${duplicateOrderId}`, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${idToken}`
                    },
                    cache: 'no-store'
                });

                const responseData = await response.json().catch(() => ({}));
                if (!response.ok || responseData?.success === false) {
                    throw new Error(responseData?.error || `Request failed (${response.status})`);
                }

                const sourceOrder = responseData.order || null;
                const duplicatedItems = Array.isArray(sourceOrder?.items)
                    ? sourceOrder.items.map((item) => buildDuplicatedDraftItem(item))
                    : [];

                if (isDisposed) {
                    return;
                }

                setDraftItems(duplicatedItems);
                setCustomerForm({
                    name: String(sourceOrder?.customerSnapshot?.name || '').trim(),
                    phone: String(sourceOrder?.customerSnapshot?.phone || '').trim(),
                    notes: String(sourceOrder?.customerSnapshot?.notes || '').trim()
                });
                setCurrentStep(duplicatedItems.length > 0 ? 'customer' : 'catalog');
                setDuplicateSource(sourceOrder ? {
                    id: sourceOrder.id,
                    orderNumber: sourceOrder.orderNumber || 'Pending Ref',
                    createdAtIso: sourceOrder.createdAtIso || ''
                } : null);
                setSavedOrder(null);
                setDuplicateHydratedFor(duplicateOrderId);

                if (duplicatedItems[0]?.key) {
                    setSelectedEntryKey(duplicatedItems[0].key);
                }
            } catch (error) {
                if (!isDisposed) {
                    setSubmitError(error?.message || 'Failed to duplicate this reseller order.');
                    setDuplicateHydratedFor(duplicateOrderId);
                }
            } finally {
                if (!isDisposed) {
                    setIsHydratingDuplicate(false);
                }
            }
        };

        hydrateDuplicateOrder();

        return () => {
            isDisposed = true;
        };
    }, [currentUser, duplicateHydratedFor, duplicateOrderId]);

    const handleAddToDraft = (entry) => {
        if (!entry?.key) {
            return;
        }

        setSavedOrder(null);

        setDraftItems((currentItems) => {
            const existingItem = currentItems.find((item) => item.key === entry.key);
            if (existingItem) {
                return currentItems.map((item) => item.key === entry.key
                    ? { ...item, quantity: Math.max(1, getSafeAmount(item.quantity, 1) + 1) }
                    : item);
            }

            return [...currentItems, buildDraftItem(entry)];
        });
    };

    const handleRemoveDraftItem = (entryKey) => {
        setDraftItems((currentItems) => currentItems.filter((item) => item.key !== entryKey));
    };

    const handleDraftQuantityChange = (entryKey, nextQuantity) => {
        setDraftItems((currentItems) => currentItems.map((item) => item.key === entryKey
            ? { ...item, quantity: Math.max(1, Math.floor(getSafeAmount(nextQuantity, 1))) }
            : item));
    };

    const handleDraftSellPriceChange = (entryKey, nextSellPrice) => {
        setDraftItems((currentItems) => currentItems.map((item) => item.key === entryKey
            ? { ...item, sellUnit: getSafeAmount(nextSellPrice, 0) }
            : item));
    };

    const handleCustomerFieldChange = (field, value) => {
        setCustomerForm((currentValue) => ({
            ...currentValue,
            [field]: value
        }));
    };

    const handleResetBuilder = () => {
        setDraftItems([]);
        setCustomerForm({ ...INITIAL_CUSTOMER_FORM });
        setCurrentStep('catalog');
        setSubmitError('');
        setSavedOrder(null);
        setDuplicateSource(null);
    };

    const handleSaveOrder = async () => {
        if (!currentUser) {
            setSubmitError('Authentication is required before saving the reseller order.');
            return;
        }

        if (!canContinueToReview) {
            setSubmitError('Complete the customer details before confirming the order.');
            return;
        }

        try {
            setIsSubmittingOrder(true);
            setSubmitError('');

            const idToken = await currentUser.getIdToken();
            const response = await fetch('/api/reseller/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    customer: {
                        name: customerForm.name,
                        phone: customerForm.phone,
                        notes: customerForm.notes
                    },
                    items: normalizedDraftItems.map((item) => ({
                        key: item.key,
                        productId: item.productId,
                        quantity: item.quantity,
                        sellUnit: item.sellUnit
                    }))
                })
            });

            const responseData = await response.json().catch(() => ({}));
            if (!response.ok || responseData?.success === false) {
                throw new Error(responseData?.error || `Request failed (${response.status})`);
            }

            setSavedOrder(responseData.order || null);
            setDraftItems([]);
            setCustomerForm({ ...INITIAL_CUSTOMER_FORM });
            setCurrentStep('catalog');
            setDuplicateSource(null);
        } catch (error) {
            setSubmitError(error?.message || 'Failed to save reseller order.');
        } finally {
            setIsSubmittingOrder(false);
        }
    };

    return (
        <div className="space-y-6">
            {savedOrder ? (
                <section className="rounded-[1.8rem] border border-emerald-500/20 bg-emerald-500/10 px-6 py-5 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">Order Saved</p>
                            <h2 className="mt-2 text-2xl font-black text-white">Reseller order {savedOrder.orderNumber} was created.</h2>
                            <p className="mt-2 text-sm leading-7 text-emerald-100/90">The order was saved into the isolated reseller module only. The main website orders collection was not touched.</p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white">
                                {formatCurrency(savedOrder?.totals?.sold)} sold
                            </span>
                            <button
                                type="button"
                                onClick={handleResetBuilder}
                                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white transition-colors hover:border-brandGold/20 hover:text-brandGold"
                            >
                                Start Another Order
                            </button>
                        </div>
                    </div>
                </section>
            ) : null}

            {!savedOrder && duplicateSource ? (
                <section className="rounded-[1.6rem] border border-sky-500/20 bg-sky-500/10 px-6 py-4 shadow-[0_20px_44px_rgba(4,8,20,0.22)] md:px-7">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">Duplicate Draft</p>
                    <p className="mt-2 text-sm leading-7 text-sky-100/90">Loaded {duplicateSource.orderNumber} into a new draft. You can adjust customer data, quantities, and sell prices before saving a new reseller order.</p>
                </section>
            ) : null}

            {isHydratingDuplicate ? (
                <section className="rounded-[1.6rem] border border-brandGold/20 bg-brandGold/10 px-6 py-4 shadow-[0_20px_44px_rgba(4,8,20,0.22)] md:px-7">
                    <p className="text-sm font-black text-brandGold">Preparing duplicated reseller order...</p>
                </section>
            ) : null}

            <section className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-5 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">New Reseller Order Flow</p>
                        <h2 className="mt-2 text-2xl font-black text-white">Draft, customer details, review, and first save flow are all connected.</h2>
                        <p className="mt-2 text-sm leading-7 text-slate-400">This page stays isolated inside the reseller workspace and never writes into the public website order flow.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <StepChip label="1. Catalog" isActive={currentStep === 'catalog'} isComplete={normalizedDraftItems.length > 0 && currentStep !== 'catalog'} />
                        <StepChip label="2. Customer" isActive={currentStep === 'customer'} isComplete={currentStep === 'review'} />
                        <StepChip label="3. Review" isActive={currentStep === 'review'} />
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)] xl:items-start">
                <section className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Catalog</p>
                            <h2 className="mt-2 text-2xl font-black text-white">Reseller Product Picker</h2>
                            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">Choose products, build the customer draft, then move through customer details and review before saving.</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full border border-brandGold/20 bg-brandGold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-brandGold">
                                <i className="fa-solid fa-store"></i>
                                {catalogState.meta.count} entries
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-300">
                                <i className="fa-solid fa-percent"></i>
                                Final markup {catalogState.meta.priceIncreasePercentage}%
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <label className="relative block w-full lg:max-w-xl">
                            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search by product name, code, category, or variant..."
                                className="h-12 w-full rounded-[1rem] border border-white/8 bg-[#18223a] pl-12 pr-4 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/35"
                            />
                        </label>

                        <div className="inline-flex items-center gap-3 self-start rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-slate-200">
                            <span className="uppercase tracking-[0.2em] text-brandGold">Results</span>
                            <span className="text-slate-300">{filteredEntries.length}</span>
                        </div>
                    </div>

                    {catalogState.error ? (
                        <div className="mt-6 rounded-[1.45rem] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200">
                            {catalogState.error}
                        </div>
                    ) : null}

                    {catalogState.loading ? (
                        <div className="mt-6 rounded-[1.45rem] border border-white/8 bg-white/[0.03] px-5 py-16 text-center text-slate-400">
                            <i className="fa-solid fa-spinner fa-spin text-3xl text-brandGold"></i>
                            <p className="mt-4 text-sm font-bold">Loading reseller-safe catalog entries...</p>
                        </div>
                    ) : filteredEntries.length === 0 ? (
                        <div className="mt-6 rounded-[1.45rem] border border-white/8 bg-white/[0.03] px-5 py-16 text-center text-slate-400">
                            <p className="text-lg font-black text-white">No catalog entries matched this search.</p>
                            <p className="mt-2 text-sm">Try another product name, code, or category.</p>
                        </div>
                    ) : (
                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            {filteredEntries.map((entry) => {
                                const isSelected = entry.key === selectedEntryKey;
                                return (
                                    <article
                                        key={entry.key}
                                        className={isSelected
                                            ? 'rounded-[1.55rem] border border-brandGold/25 bg-brandGold/10 p-4 text-left shadow-[0_18px_40px_rgba(212,175,55,0.08)]'
                                            : 'rounded-[1.55rem] border border-white/8 bg-[#151e34] p-4 text-left transition-colors hover:border-brandGold/15 hover:bg-[#18223a]'}
                                    >
                                        <div className="flex gap-4">
                                            <img
                                                src={entry.image || '/logo.png'}
                                                alt={entry.title}
                                                className="h-20 w-20 rounded-[1.15rem] border border-white/8 bg-[#0f1729] object-cover"
                                            />

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                                                        {entry.isVariant ? 'Variant' : 'Product'}
                                                    </span>
                                                    {entry.category ? (
                                                        <span className="rounded-full border border-brandGold/15 bg-brandGold/8 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-brandGold">
                                                            {entry.category}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <p className="mt-3 line-clamp-2 text-base font-black text-white">{entry.title}</p>
                                                <p className="mt-1 text-xs text-slate-500">{entry.productCode || 'No code'}{entry.stockStatus && entry.stockStatus !== 'unknown' ? ` • ${entry.stockStatus.replace(/_/g, ' ')}` : ''}</p>

                                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                                    <PricingValue label="Your Cost" value={entry.pricing.wholesaleUnit} accent="text-brandGold" />
                                                    <PricingValue label="Public Price" value={entry.pricing.publicUnit} accent="text-emerald-300" />
                                                    <PricingValue label="Base Retail" value={entry.pricing.retailBaseUnit} accent="text-slate-200" />
                                                    <PricingValue label="Profit @ Public" value={entry.pricing.profitAtPublicUnit} accent="text-sky-300" />
                                                </div>

                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedEntryKey(entry.key)}
                                                        className={isSelected
                                                            ? 'inline-flex items-center justify-center rounded-full border border-brandGold/30 bg-brandGold/10 px-3.5 py-2 text-xs font-black uppercase tracking-[0.16em] text-brandGold'
                                                            : 'inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:border-brandGold/20 hover:text-brandGold'}
                                                    >
                                                        {isSelected ? 'Previewing' : 'Preview'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddToDraft(entry)}
                                                        className="inline-flex items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-300 transition-colors hover:bg-emerald-500/18"
                                                    >
                                                        Add To Draft
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}

                    {currentStep === 'customer' ? (
                        <div className="mt-6 rounded-[1.45rem] border border-white/8 bg-[#151e34] p-5">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Step 2</p>
                            <h3 className="mt-2 text-xl font-black text-white">Customer Details</h3>
                            <p className="mt-2 text-sm leading-7 text-slate-400">Add the customer identity that will appear on the reseller order and the customer invoice summary.</p>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <label className="block rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-3">
                                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Customer Name</span>
                                    <input
                                        type="text"
                                        value={customerForm.name}
                                        onChange={(event) => handleCustomerFieldChange('name', event.target.value)}
                                        className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none"
                                        placeholder="Enter customer name"
                                    />
                                </label>

                                <label className="block rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-3">
                                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Customer Phone</span>
                                    <input
                                        type="text"
                                        value={customerForm.phone}
                                        onChange={(event) => handleCustomerFieldChange('phone', event.target.value)}
                                        className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none"
                                        placeholder="Enter customer phone"
                                    />
                                </label>
                            </div>

                            <label className="mt-4 block rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-3">
                                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Internal Notes</span>
                                <textarea
                                    value={customerForm.notes}
                                    onChange={(event) => handleCustomerFieldChange('notes', event.target.value)}
                                    rows="4"
                                    className="mt-2 w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                                    placeholder="Optional notes for this reseller order"
                                />
                            </label>
                        </div>
                    ) : null}

                    {currentStep === 'review' ? (
                        <div className="mt-6 rounded-[1.45rem] border border-white/8 bg-[#151e34] p-5">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Step 3</p>
                            <h3 className="mt-2 text-xl font-black text-white">Review Before Save</h3>
                            <p className="mt-2 text-sm leading-7 text-slate-400">This confirms the draft snapshot exactly as it will be written into the isolated reseller order collection.</p>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <div className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-4">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Customer Name</p>
                                    <p className="mt-2 text-sm font-black text-white">{customerForm.name}</p>
                                </div>
                                <div className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-4">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Customer Phone</p>
                                    <p className="mt-2 text-sm font-black text-white">{customerForm.phone}</p>
                                </div>
                            </div>

                            <div className="mt-4 rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-4">
                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Notes</p>
                                <p className="mt-2 text-sm leading-7 text-slate-300">{customerForm.notes || 'No notes added.'}</p>
                            </div>

                            <div className="mt-5 space-y-3">
                                {normalizedDraftItems.map((draftItem) => (
                                    <div key={draftItem.key} className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-4">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <p className="text-sm font-black text-white">{draftItem.title}</p>
                                                <p className="mt-1 text-xs text-slate-500">{draftItem.productCode || 'No code'} • Qty {draftItem.quantity}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-emerald-300">{formatCurrency(draftItem.sellTotal)}</p>
                                                <p className="mt-1 text-xs text-sky-300">Profit {formatCurrency(draftItem.profitTotal)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </section>

                <aside className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7 xl:sticky xl:top-6">
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Draft Panel</p>
                    <h3 className="mt-2 text-2xl font-black text-white">Live Reseller Totals</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-400">This panel controls the draft, the step transitions, and the isolated reseller order save flow.</p>

                    {selectedEntry ? (
                        <div className="mt-6 space-y-4">
                            <div className="overflow-hidden rounded-[1.45rem] border border-white/8 bg-[#151e34]">
                                <img
                                    src={selectedEntry.image || '/logo.png'}
                                    alt={selectedEntry.title}
                                    className="h-56 w-full bg-[#0f1729] object-cover"
                                />
                                <div className="p-4">
                                    <p className="text-lg font-black text-white">{selectedEntry.title}</p>
                                    <p className="mt-1 text-sm text-slate-500">{selectedEntry.productCode || 'No code'}{selectedEntry.category ? ` • ${selectedEntry.category}` : ''}</p>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                                <PricingValue label="Your Cost" value={selectedEntry.pricing.wholesaleUnit} accent="text-brandGold" />
                                <PricingValue label="Public Price" value={selectedEntry.pricing.publicUnit} accent="text-emerald-300" />
                                <PricingValue label="Base Retail" value={selectedEntry.pricing.retailBaseUnit} accent="text-slate-200" />
                                <PricingValue label="Pack Price" value={selectedEntry.pricing.packUnit} accent="text-fuchsia-300" />
                                <PricingValue label="Discount" value={selectedEntry.pricing.discountUnit} accent="text-amber-300" />
                                <PricingValue label="Profit @ Public" value={selectedEntry.pricing.profitAtPublicUnit} accent="text-sky-300" />
                            </div>

                            <button
                                type="button"
                                onClick={() => handleAddToDraft(selectedEntry)}
                                className="inline-flex w-full items-center justify-center rounded-[1rem] border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-emerald-300 transition-colors hover:bg-emerald-500/18"
                            >
                                Add Selected Item To Draft
                            </button>
                        </div>
                    ) : (
                        <div className="mt-6 rounded-[1.45rem] border border-white/8 bg-white/[0.03] px-5 py-16 text-center text-slate-400">
                            <i className="fa-solid fa-hand-pointer text-3xl text-brandGold"></i>
                            <p className="mt-4 text-sm font-bold">Select a product entry to preview the pricing block.</p>
                        </div>
                    )}

                    <div className="mt-6 rounded-[1.45rem] border border-white/8 bg-[#151e34] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Draft Summary</p>
                                <p className="mt-1 text-sm text-slate-400">Local only until you confirm save.</p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                                {draftSummary.itemsCount} items
                            </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            <DraftMetric label="Sell Total" value={draftSummary.sellTotal} accent="text-emerald-300" />
                            <DraftMetric label="Your Cost" value={draftSummary.wholesaleTotal} accent="text-brandGold" />
                            <DraftMetric label="Profit" value={draftSummary.profitTotal} accent="text-sky-300" />
                            <DraftMetric label="Units" value={draftSummary.quantity} accent="text-slate-200" isCurrency={false} />
                        </div>
                    </div>

                    {submitError ? (
                        <div className="mt-6 rounded-[1.35rem] border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-200">
                            {submitError}
                        </div>
                    ) : null}

                    <div className="mt-6 space-y-3">
                        {normalizedDraftItems.length === 0 ? (
                            <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-5 py-10 text-center text-slate-400">
                                <i className="fa-solid fa-basket-shopping text-3xl text-brandGold"></i>
                                <p className="mt-4 text-sm font-bold">Your draft is empty.</p>
                                <p className="mt-2 text-sm">Pick any entry on the left and add it to the draft panel.</p>
                            </div>
                        ) : normalizedDraftItems.map((draftItem) => (
                            <div key={draftItem.key} className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] p-4">
                                <div className="flex items-start gap-3">
                                    <img
                                        src={draftItem.image || '/logo.png'}
                                        alt={draftItem.title}
                                        className="h-16 w-16 rounded-[1rem] border border-white/8 bg-[#0f1729] object-cover"
                                    />

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="line-clamp-2 text-sm font-black text-white">{draftItem.title}</p>
                                                <p className="mt-1 text-xs text-slate-500">{draftItem.productCode || 'No code'}{draftItem.category ? ` • ${draftItem.category}` : ''}</p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleRemoveDraftItem(draftItem.key)}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500/18"
                                                title="Remove draft item"
                                            >
                                                <i className="fa-solid fa-trash text-xs"></i>
                                            </button>
                                        </div>

                                        <div className="mt-4 grid gap-3">
                                            <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-white/8 bg-[#11192c] px-3 py-3">
                                                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Quantity</span>
                                                <div className="inline-flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDraftQuantityChange(draftItem.key, draftItem.quantity - 1)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-200 transition-colors hover:border-brandGold/20 hover:text-brandGold"
                                                    >
                                                        <i className="fa-solid fa-minus text-[10px]"></i>
                                                    </button>
                                                    <span className="min-w-[2rem] text-center text-sm font-black text-white">{draftItem.quantity}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDraftQuantityChange(draftItem.key, draftItem.quantity + 1)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-200 transition-colors hover:border-brandGold/20 hover:text-brandGold"
                                                    >
                                                        <i className="fa-solid fa-plus text-[10px]"></i>
                                                    </button>
                                                </div>
                                            </div>

                                            <label className="block rounded-[1rem] border border-white/8 bg-[#11192c] px-3 py-3">
                                                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Sell Price</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={draftItem.sellUnit}
                                                    onChange={(event) => handleDraftSellPriceChange(draftItem.key, event.target.value)}
                                                    className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none"
                                                />
                                            </label>

                                            <div className="grid gap-2 sm:grid-cols-2">
                                                <DraftMetric label="Public Ref" value={draftItem.publicUnit} accent="text-emerald-300" />
                                                <DraftMetric label="Cost Ref" value={draftItem.wholesaleUnit} accent="text-brandGold" />
                                                <DraftMetric label="Line Sell" value={draftItem.sellTotal} accent="text-white" />
                                                <DraftMetric label="Line Profit" value={draftItem.profitTotal} accent="text-sky-300" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 grid gap-3">
                        {currentStep === 'catalog' ? (
                            <button
                                type="button"
                                onClick={() => setCurrentStep('customer')}
                                disabled={!canContinueToCustomer}
                                className="inline-flex items-center justify-center rounded-[1rem] border border-brandGold/30 bg-brandGold/10 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Continue To Customer Details
                            </button>
                        ) : null}

                        {currentStep === 'customer' ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep('review')}
                                    disabled={!canContinueToReview}
                                    className="inline-flex items-center justify-center rounded-[1rem] border border-brandGold/30 bg-brandGold/10 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Continue To Review
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep('catalog')}
                                    className="inline-flex items-center justify-center rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:border-brandGold/20 hover:text-brandGold"
                                >
                                    Back To Catalog
                                </button>
                            </>
                        ) : null}

                        {currentStep === 'review' ? (
                            <>
                                <button
                                    type="button"
                                    onClick={handleSaveOrder}
                                    disabled={isSubmittingOrder || !canContinueToReview}
                                    className="inline-flex items-center justify-center rounded-[1rem] border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-emerald-300 transition-colors hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSubmittingOrder ? 'Saving...' : 'Confirm And Save Order'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep('customer')}
                                    disabled={isSubmittingOrder}
                                    className="inline-flex items-center justify-center rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:border-brandGold/20 hover:text-brandGold disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Back To Customer Details
                                </button>
                            </>
                        ) : null}
                    </div>

                    <div className="mt-6 rounded-[1.35rem] border border-white/8 bg-white/[0.03] p-4 text-sm leading-7 text-slate-400">
                        <p className="font-black uppercase tracking-[0.18em] text-brandGold">Next Slice</p>
                        <p className="mt-2">Once this order is saved, the reseller details view can share, print, and duplicate the customer invoice flow safely from the isolated workspace.</p>
                    </div>
                </aside>
            </div>
        </div>
    );
}