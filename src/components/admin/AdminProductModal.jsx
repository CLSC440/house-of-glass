'use client';

import { useEffect, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const STOCK_STATUS_OPTIONS = [
    { value: 'in_stock', label: 'In stock', tone: 'emerald' },
    { value: 'low_stock', label: 'Low stock', tone: 'amber' },
    { value: 'out_of_stock', label: 'Out of stock', tone: 'rose' }
];

function inferProvider(url = '') {
    if (!url) return 'external';
    if (url.startsWith('data:')) return 'data-uri';
    if (url.includes('ik.imagekit.io')) return 'imagekit';
    if (url.includes('cloudinary.com')) return 'cloudinary';
    return 'external';
}

function stringifyValue(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function normalizeNumericValue(value) {
    if (value === '' || value === null || value === undefined) return '';
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : value;
}

function getMediaUrl(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    return entry.primaryUrl || entry.url || entry.fallbackUrl || '';
}

function reorderPrimaryFirst(items = []) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const normalized = items.map((item) => ({
        ...item,
        isPrimary: Boolean(item?.isPrimary)
    }));

    const primaryIndex = normalized.findIndex((item) => item.isPrimary);
    const safePrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0;

    return normalized
        .map((item, index) => ({ ...item, isPrimary: index === safePrimaryIndex }))
        .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
}

function normalizeMediaEntry(entry, index) {
    const url = getMediaUrl(entry).trim();
    return {
        id: entry?.id || `media-${index}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        primaryUrl: entry?.primaryUrl || url,
        fallbackUrl: entry?.fallbackUrl || '',
        provider: entry?.provider || inferProvider(url),
        fileId: entry?.fileId || '',
        filePath: entry?.filePath || '',
        isPrimary: Boolean(entry?.isPrimary)
    };
}

function normalizeMediaCollection(imageDetails = [], imageUrls = []) {
    const source = Array.isArray(imageDetails) && imageDetails.length > 0
        ? imageDetails
        : (Array.isArray(imageUrls) ? imageUrls : []);
    const items = reorderPrimaryFirst(
        source
            .map((item, index) => normalizeMediaEntry(item, index))
            .filter((item) => item.url)
    );

    return {
        items,
        urls: items.map((item) => item.primaryUrl || item.url || item.fallbackUrl).filter(Boolean)
    };
}

function createBlankImage(isPrimary = false) {
    return {
        id: `media-${Math.random().toString(36).slice(2, 8)}`,
        url: '',
        primaryUrl: '',
        fallbackUrl: '',
        provider: 'external',
        fileId: '',
        filePath: '',
        isPrimary
    };
}

function createBlankVariant() {
    return {
        id: `variant-${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        label: '',
        code: '',
        price: '',
        wholesalePrice: '',
        discountAmount: '',
        stockStatus: 'in_stock',
        image: '',
        images: [],
        imageDetails: [],
        isLinked: false
    };
}

function normalizeVariant(variant, index) {
    const normalizedMedia = normalizeMediaCollection(
        variant?.imageDetails,
        Array.isArray(variant?.images) && variant.images.length > 0
            ? variant.images
            : (variant?.image ? [variant.image] : [])
    );
    const primaryImage = normalizedMedia.urls[0] || '';

    return {
        ...variant,
        id: variant?.id || variant?.code || `variant-${index}`,
        name: stringifyValue(variant?.name || variant?.label || ''),
        label: stringifyValue(variant?.label || variant?.name || ''),
        code: stringifyValue(variant?.code || ''),
        price: stringifyValue(variant?.price || variant?.retailPrice || variant?.retail_price || ''),
        wholesalePrice: stringifyValue(variant?.wholesalePrice || variant?.wholesale_price || variant?.cartonPrice || ''),
        discountAmount: stringifyValue(
            variant?.discountAmount
            || variant?.discount_amount
            || variant?.discount
            || variant?.discountValue
            || ''
        ),
        stockStatus: variant?.stockStatus || 'in_stock',
        image: primaryImage,
        images: normalizedMedia.urls,
        imageDetails: normalizedMedia.items,
        isLinked: Boolean(variant?.isLinked)
    };
}

function buildInitialFormData(product) {
    const normalizedMedia = normalizeMediaCollection(product?.imageDetails, product?.images || []);
    const variantList = Array.isArray(product?.variants) ? product.variants.map(normalizeVariant) : [];

    return {
        name: product?.name || product?.title || '',
        code: product?.code || '',
        category: product?.category || 'All',
        brand: product?.brand || '',
        origin: product?.origin || '',
        price: stringifyValue(product?.price || product?.retailPrice || ''),
        desc: product?.desc || product?.description || '',
        stockStatus: product?.stockStatus || 'in_stock',
        isGloballyAvailable: typeof product?.availableGlobally === 'boolean'
            ? product.availableGlobally
            : !Boolean(product?.isHidden),
        imageDetails: normalizedMedia.items.length > 0 ? normalizedMedia.items : [createBlankImage(true)],
        variants: variantList
    };
}

function pickFileAsDataUrl(onLoad) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            onLoad(typeof reader.result === 'string' ? reader.result : '');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function getToneClasses(tone) {
    if (tone === 'emerald') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    if (tone === 'amber') return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
    return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
}

export default function AdminProductModal({ isOpen, onClose, product, categories, brands }) {
    const [formData, setFormData] = useState(() => buildInitialFormData(null));
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setFormData(buildInitialFormData(product || null));
    }, [product, isOpen]);

    if (!isOpen) return null;

    const categoryOptions = Array.isArray(categories) ? categories : [];
    const brandOptions = Array.isArray(brands) ? brands : [];
    const orderedImages = reorderPrimaryFirst(formData.imageDetails);
    const imageCount = orderedImages.filter((item) => item.url).length;
    const variantCount = formData.variants.length;

    const updateField = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const updateImage = (index, field, value) => {
        setFormData((prev) => {
            const nextImages = prev.imageDetails.map((item, itemIndex) => {
                if (itemIndex !== index) return item;
                const nextUrl = field === 'url' ? value.trim() : getMediaUrl(item);
                return {
                    ...item,
                    [field]: value,
                    primaryUrl: field === 'url' ? nextUrl : (item.primaryUrl || nextUrl),
                    provider: field === 'url' ? inferProvider(value.trim()) : item.provider
                };
            });
            return { ...prev, imageDetails: nextImages };
        });
    };

    const addImageRow = () => {
        setFormData((prev) => ({
            ...prev,
            imageDetails: [...prev.imageDetails, createBlankImage(prev.imageDetails.length === 0)]
        }));
    };

    const removeImageRow = (index) => {
        setFormData((prev) => {
            const filtered = prev.imageDetails.filter((_, itemIndex) => itemIndex !== index);
            const fallback = filtered.length > 0 ? filtered : [createBlankImage(true)];
            return { ...prev, imageDetails: reorderPrimaryFirst(fallback) };
        });
    };

    const setPrimaryImage = (index) => {
        setFormData((prev) => ({
            ...prev,
            imageDetails: reorderPrimaryFirst(
                prev.imageDetails.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index }))
            )
        }));
    };

    const loadProductImageFromFile = (index) => {
        pickFileAsDataUrl((dataUrl) => {
            updateImage(index, 'url', dataUrl);
        });
    };

    const updateVariant = (index, field, value) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((variant, variantIndex) => {
                if (variantIndex !== index) return variant;
                const nextVariant = { ...variant, [field]: value };
                if (field === 'name') nextVariant.label = value;
                return nextVariant;
            })
        }));
    };

    const addVariant = () => {
        setFormData((prev) => ({
            ...prev,
            variants: [...prev.variants, createBlankVariant()]
        }));
    };

    const removeVariant = (index) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.filter((_, variantIndex) => variantIndex !== index)
        }));
    };

    const updateVariantImage = (index, value) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((variant, variantIndex) => {
                if (variantIndex !== index) return variant;
                const normalizedUrl = value.trim();
                const imageDetails = normalizedUrl
                    ? [{
                        id: variant.imageDetails?.[0]?.id || `variant-image-${variantIndex}`,
                        url: normalizedUrl,
                        primaryUrl: normalizedUrl,
                        fallbackUrl: '',
                        provider: inferProvider(normalizedUrl),
                        fileId: variant.imageDetails?.[0]?.fileId || '',
                        filePath: variant.imageDetails?.[0]?.filePath || '',
                        isPrimary: true
                    }]
                    : [];
                return {
                    ...variant,
                    image: normalizedUrl,
                    images: normalizedUrl ? [normalizedUrl] : [],
                    imageDetails
                };
            })
        }));
    };

    const loadVariantImageFromFile = (index) => {
        pickFileAsDataUrl((dataUrl) => {
            updateVariantImage(index, dataUrl);
        });
    };

    const handleSubmit = async (event) => {
        event?.preventDefault?.();
        setLoading(true);

        try {
            const normalizedImages = normalizeMediaCollection(formData.imageDetails, []);
            const normalizedVariants = formData.variants
                .map((variant) => {
                    const variantMedia = normalizeMediaCollection(variant.imageDetails, variant.images || []);
                    const primaryVariantImage = variantMedia.urls[0] || '';
                    return {
                        ...variant,
                        name: variant.name.trim(),
                        label: (variant.label || variant.name).trim(),
                        code: variant.code.trim(),
                        price: normalizeNumericValue(variant.price),
                        wholesalePrice: normalizeNumericValue(variant.wholesalePrice),
                        discountAmount: normalizeNumericValue(variant.discountAmount),
                        stockStatus: variant.stockStatus || 'in_stock',
                        image: primaryVariantImage,
                        images: variantMedia.urls,
                        imageDetails: variantMedia.items
                    };
                })
                .filter((variant) => variant.name || variant.label || variant.code || variant.images.length > 0);

            const productData = {
                name: formData.name.trim(),
                title: formData.name.trim(),
                code: formData.code.trim(),
                category: formData.category,
                brand: formData.brand.trim(),
                origin: formData.origin.trim(),
                price: normalizeNumericValue(formData.price),
                desc: formData.desc.trim(),
                description: formData.desc.trim(),
                stockStatus: formData.stockStatus,
                availableGlobally: formData.isGloballyAvailable,
                isHidden: !formData.isGloballyAvailable,
                image: normalizedImages.urls[0] || '',
                images: normalizedImages.urls,
                imageDetails: normalizedImages.items,
                variants: normalizedVariants,
                updatedAt: serverTimestamp()
            };

            if (!product) {
                productData.createdAt = serverTimestamp();
            }

            if (product?.id) {
                await setDoc(doc(db, 'products', product.id), productData, { merge: true });
            } else {
                await addDoc(collection(db, 'products'), productData);
            }

            onClose();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Failed to save product');
        } finally {
            setLoading(false);
        }
    };

    const selectedStockTone = STOCK_STATUS_OPTIONS.find((option) => option.value === formData.stockStatus)?.tone || 'emerald';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-3">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,#1c2438_0%,#121a2c_100%)] shadow-[0_32px_90px_rgba(0,0,0,0.55)]">
                <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_40%)] px-4 py-3 md:px-5 md:py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold/80">
                                Product Editor
                            </p>
                            <h2 className="mt-1 text-xl font-black text-white md:text-2xl">
                                {product ? 'Update Piece' : 'Add New Piece'}
                            </h2>
                            <p className="mt-1.5 max-w-xl text-xs text-slate-400">
                                Match the old admin flow with the same core product data, product media, and variant controls in one place.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Code</p>
                                <p className="mt-0.5 truncate text-xs font-bold text-white">{formData.code || 'Pending'}</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Images</p>
                                <p className="mt-0.5 text-xs font-bold text-white">{imageCount}</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Variants</p>
                                <p className="mt-0.5 text-xs font-bold text-white">{variantCount}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <form id="productForm" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 md:px-5 md:py-5">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_300px]">
                        <div className="space-y-4">
                            <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-3 md:p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brandGold/80">Core Details</p>
                                        <h3 className="mt-1 text-base font-black text-white">Product information</h3>
                                    </div>
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] ${getToneClasses(selectedStockTone)}`}>
                                        {STOCK_STATUS_OPTIONS.find((option) => option.value === formData.stockStatus)?.label || 'In stock'}
                                    </span>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Piece name</span>
                                        <input
                                            required
                                            type="text"
                                            value={formData.name}
                                            onChange={(event) => updateField('name', event.target.value)}
                                            className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-white outline-none transition focus:border-brandGold/60"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Category</span>
                                        <select
                                            value={formData.category}
                                            onChange={(event) => updateField('category', event.target.value)}
                                            className="w-full rounded-2xl border border-white/10 bg-[#0f1728] px-4 py-3 text-white outline-none transition focus:border-brandGold/60"
                                        >
                                            <option value="All">All Categories</option>
                                            {categoryOptions.map((category) => (
                                                <option key={category.id || category.name} value={category.name}>
                                                    {category.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="block">
                                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Brand</span>
                                        <select
                                            value={formData.brand}
                                            onChange={(event) => updateField('brand', event.target.value)}
                                            className="appearance-none w-full rounded-2xl border border-white/10 bg-[#0f1728] px-4 py-3 text-white outline-none transition focus:border-brandGold/60"
                                        >
                                            <option value="" disabled>Select Brand</option>
                                            {brandOptions.map((b) => (
                                                <option key={b.id || b.name} value={b.name || b}>{b.name || b}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="block">
                                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Origin</span>
                                        <input
                                            type="text"
                                            value={formData.origin}
                                            onChange={(event) => updateField('origin', event.target.value)}
                                            className="w-full rounded-2xl border border-white/10 bg-[#0f1728] px-4 py-3 text-white outline-none transition focus:border-brandGold/60"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Product code</span>
                                        <input
                                            type="text"
                                            value={formData.code}
                                            onChange={(event) => updateField('code', event.target.value)}
                                            className="w-full rounded-2xl border border-white/10 bg-[#0f1728] px-4 py-3 text-white outline-none transition focus:border-brandGold/60"
                                        />
                                    </label>

                                    <label className="block md:col-span-2">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Description</span>
                                        <textarea
                                            rows="4"
                                            value={formData.desc}
                                            onChange={(event) => updateField('desc', event.target.value)}
                                            className="w-full rounded-[1rem] border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-white outline-none transition focus:border-brandGold/60"
                                        />
                                    </label>
                                </div>
                            </section>

                            <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-3 md:p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brandGold/80">Product Images</p>
                                        <h3 className="mt-1 text-base font-black text-white">Main gallery</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addImageRow}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-brandGold/25 bg-brandGold/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-brandGold transition hover:bg-brandGold/18"
                                    >
                                        <i className="fa-solid fa-plus"></i>
                                        Add image
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {orderedImages.map((image, index) => {
                                        const imageUrl = getMediaUrl(image);
                                        return (
                                            <div key={image.id || index} className="grid gap-3 rounded-xl border border-white/10 bg-[#121a2d] p-3 md:grid-cols-[90px_minmax(0,1fr)] md:p-3">
                                                <div className="flex h-[90px] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#0b1120]">
                                                    {imageUrl ? (
                                                        <img src={imageUrl} alt="Product media" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <div className="text-center text-slate-500">
                                                            <i className="fa-regular fa-image text-xl"></i>
                                                            <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em]">Preview</p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-2.5">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <label className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">
                                                            <input
                                                                type="radio"
                                                                name="primaryProductImage"
                                                                checked={Boolean(image.isPrimary)}
                                                                onChange={() => setPrimaryImage(index)}
                                                                className="h-3.5 w-3.5 accent-[#d4af37]"
                                                            />
                                                            Main image
                                                        </label>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                                                                {image.provider || inferProvider(imageUrl)}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => loadProductImageFromFile(index)}
                                                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.09]"
                                                            >
                                                                <i className="fa-solid fa-upload"></i>
                                                                Upload
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeImageRow(index)}
                                                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-300 transition hover:bg-rose-500/15"
                                                            >
                                                                <i className="fa-solid fa-trash"></i>
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <label className="block">
                                                        <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Image link</span>
                                                        <input
                                                            type="text"
                                                            placeholder="https://..."
                                                            value={image.url}
                                                            onChange={(event) => updateImage(index, 'url', event.target.value)}
                                                            className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-white outline-none transition focus:border-brandGold/60"
                                                        />
                                                    </label>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-3 md:p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brandGold/80">Product Variants</p>
                                        <h3 className="mt-1 text-base font-black text-white">Colors and types</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addVariant}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-brandGold/25 bg-brandGold/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-brandGold transition hover:bg-brandGold/18"
                                    >
                                        <i className="fa-solid fa-plus"></i>
                                        Add variant
                                    </button>
                                </div>

                                {formData.variants.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-white/12 bg-[#121a2d] px-4 py-6 text-center">
                                        <p className="text-xs font-bold text-white">No variants yet</p>
                                        <p className="mt-1.5 text-xs text-slate-400">Add the same variant rows the old admin used for colors, shapes, or pack types.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {formData.variants.map((variant, index) => {
                                            const variantTone = STOCK_STATUS_OPTIONS.find((option) => option.value === variant.stockStatus)?.tone || 'emerald';
                                            return (
                                                <div key={variant.id || index} className="rounded-xl border border-white/10 bg-[#121a2d] p-3">
                                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Variant {index + 1}</p>
                                                            <p className="mt-0.5 text-sm font-black text-white">{variant.name || variant.label || 'Untitled variant'}</p>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {variant.isLinked ? (
                                                                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-blue-300">
                                                                    DC linked
                                                                </span>
                                                            ) : null}
                                                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] ${getToneClasses(variantTone)}`}>
                                                                {STOCK_STATUS_OPTIONS.find((option) => option.value === variant.stockStatus)?.label || 'In stock'}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeVariant(index)}
                                                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-300 transition hover:bg-rose-500/15"
                                                            >
                                                                <i className="fa-solid fa-trash"></i>
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                                                        <div className="grid gap-3 md:grid-cols-2">
                                                            <label className="block">
                                                                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Variant name</span>
                                                                <input
                                                                    type="text"
                                                                    value={variant.name}
                                                                    onChange={(event) => updateVariant(index, 'name', event.target.value)}
                                                                    className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-white outline-none transition focus:border-brandGold/60"
                                                                />
                                                            </label>

                                                            <label className="block">
                                                                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Code</span>
                                                                <input
                                                                    type="text"
                                                                    value={variant.code}
                                                                    onChange={(event) => updateVariant(index, 'code', event.target.value)}
                                                                    className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-white outline-none transition focus:border-brandGold/60"
                                                                />
                                                            </label>

                                                            <label className="block">
                                                                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Availability</span>
                                                                <select
                                                                    disabled
                                                                    value={variant.stockStatus}
                                                                    className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-[#0f1728]/50 px-3 py-2 text-sm text-slate-400 outline-none transition"
                                                                >
                                                                    {STOCK_STATUS_OPTIONS.map((option) => (
                                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                                    ))}
                                                                </select>
                                                            </label>

                                                            <label className="block">
                                                                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Retail price</span>
                                                                <input
                                                                    type="number"
                                                                    disabled
                                                                    value={variant.price}
                                                                    className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-[#0f1728]/50 px-3 py-2 text-sm text-slate-400 outline-none transition"
                                                                />
                                                            </label>

                                                            <label className="block">
                                                                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Wholesale price</span>
                                                                <input
                                                                    type="number"
                                                                    disabled
                                                                    value={variant.wholesalePrice}
                                                                    className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-[#0f1728]/50 px-3 py-2 text-sm text-slate-400 outline-none transition"
                                                                />
                                                            </label>

                                                            <label className="block md:col-span-2">
                                                                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Discount value</span>
                                                                <input
                                                                    type="number"
                                                                    disabled
                                                                    value={variant.discountAmount}
                                                                    className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-[#0f1728]/50 px-3 py-2 text-sm text-slate-400 outline-none transition"
                                                                />
                                                            </label>
                                                        </div>

                                                        <div className="rounded-xl border border-white/10 bg-[#0f1728] p-2.5">
                                                            <div className="flex h-[150px] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#0a1020]">
                                                                {variant.image ? (
                                                                    <img src={variant.image} alt="Variant" className="h-full w-full object-cover" />
                                                                ) : (
                                                                    <div className="text-center text-slate-500">
                                                                        <i className="fa-regular fa-image text-xl"></i>
                                                                        <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em]">Variant image</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <label className="mt-2.5 block">
                                                                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Image link</span>
                                                                <input
                                                                    type="text"
                                                                    value={variant.image || ''}
                                                                    onChange={(event) => updateVariantImage(index, event.target.value)}
                                                                    className="w-full rounded-xl border border-white/10 bg-[#10192c] px-3 py-2 text-sm text-white outline-none transition focus:border-brandGold/60"
                                                                />
                                                            </label>
                                                            <div className="mt-2.5 flex gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => loadVariantImageFromFile(index)}
                                                                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.09]"
                                                                >
                                                                    Upload
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateVariantImage(index, '')}
                                                                    className="flex-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-rose-300 transition hover:bg-rose-500/15"
                                                                >
                                                                    Clear
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        </div>

                        <aside className="space-y-4">
                            <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-3 md:p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brandGold/80">Pricing and Status</p>
                                <h3 className="mt-1 text-base font-black text-white">Commercial controls</h3>

                                <div className="mt-3 space-y-3">
                                    <label className="block">
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Base price</span>
                                            <span className="rounded bg-brandGold/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-brandGold/70">DC Managed</span>
                                        </div>
                                        <input
                                            type="number"
                                            disabled
                                            value={formData.price}
                                            className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-[#0f1728]/50 px-3 py-2 text-sm text-slate-400 outline-none transition"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Global availability</span>
                                        <button
                                            type="button"
                                            onClick={() => updateField('isGloballyAvailable', !formData.isGloballyAvailable)}
                                            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${formData.isGloballyAvailable ? 'border-emerald-500/25 bg-emerald-500/10 text-white' : 'border-white/10 bg-[#0f1728] text-slate-300'}`}
                                        >
                                            <div>
                                                <p className="text-sm font-bold">{formData.isGloballyAvailable ? 'Visible in gallery' : 'Hidden from gallery'}</p>
                                                <p className="mt-1 text-xs text-slate-400">Mirror the old global availability control without removing the product record.</p>
                                            </div>
                                            <span className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition ${formData.isGloballyAvailable ? 'bg-emerald-500/40 justify-end' : 'bg-white/10 justify-start'}`}>
                                                <span className="h-5 w-5 rounded-full bg-white"></span>
                                            </span>
                                        </button>
                                    </label>

                                    <label className="block">
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Product stock status</span>
                                            <span className="rounded bg-brandGold/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-brandGold/70">DC Managed</span>
                                        </div>
                                        <select
                                            disabled
                                            value={formData.stockStatus}
                                            className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-[#0f1728]/50 px-3 py-2 text-sm text-slate-400 outline-none transition"
                                        >
                                            {STOCK_STATUS_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            </section>

                            <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-3 md:p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brandGold/80">Summary</p>
                                <h3 className="mt-1 text-base font-black text-white">What will be saved</h3>

                                <div className="mt-3 space-y-2.5 text-xs text-slate-300">
                                    <div className="rounded-xl border border-white/10 bg-[#121a2d] px-3 py-2.5">
                                        <p className="font-black text-white">Product document</p>
                                        <p className="mt-0.5 text-slate-400">Saves core fields plus both `images` and `imageDetails` for legacy and current consumers.</p>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-[#121a2d] px-3 py-2.5">
                                        <p className="font-black text-white">Variant rows</p>
                                        <p className="mt-0.5 text-slate-400">Keeps per-variant code, pricing, availability, and image metadata.</p>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-[#121a2d] px-3 py-2.5">
                                        <p className="font-black text-white">Store visibility</p>
                                        <p className="mt-0.5 text-slate-400">`availableGlobally` and `isHidden` stay aligned so the storefront can keep using the current flags.</p>
                                    </div>
                                </div>
                            </section>
                        </aside>
                    </div>
                </form>

                <div className="flex flex-col gap-2 border-t border-white/10 bg-[#11192b]/90 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
                    <p className="text-xs text-slate-400 max-w-[60%]">
                        Primary media is always saved first so current gallery and legacy consumers resolve the same cover image.
                    </p>
                    <div className="flex items-center justify-end gap-2.5">
                        <button
                            onClick={onClose}
                            type="button"
                            className="rounded-[10px] border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-slate-300 transition hover:bg-white/[0.08]"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            form="productForm"
                            disabled={loading}
                            className="rounded-[10px] bg-brandGold px-5 py-2 text-xs font-black text-[#0b1020] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading ? 'Saving...' : 'Save Product'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
