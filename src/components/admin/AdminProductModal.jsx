'use client';

import { useEffect, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useGallery } from '@/contexts/GalleryContext';
import { deleteImageKitFiles, uploadToImageKit } from '@/lib/imagekit-client';

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

function normalizeLabel(value, fallback = '') {
    const normalized = String(value || '').trim();
    return normalized || fallback;
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

function getRenderableMediaUrl(entry) {
    if (!entry || typeof entry === 'string') return getMediaUrl(entry);
    return entry.previewUrl || getMediaUrl(entry);
}

function inferUploadExtension(source) {
    if (!source) return 'jpg';

    if (typeof source === 'string') {
        const match = source.match(/^data:image\/([a-zA-Z0-9.+-]+);/);
        if (match?.[1]) {
            const normalized = match[1].toLowerCase();
            return normalized === 'jpeg' ? 'jpg' : normalized;
        }

        const parts = source.split('.');
        if (parts.length > 1) {
            return parts.pop().split('?')[0].toLowerCase();
        }

        return 'jpg';
    }

    const fileName = String(source?.name || '').trim();
    if (fileName.includes('.')) {
        return fileName.split('.').pop().toLowerCase();
    }

    const mimeType = String(source?.type || '').toLowerCase();
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('gif')) return 'gif';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
    return 'jpg';
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
        previewUrl: entry?.previewUrl || '',
        pendingFile: entry?.pendingFile || null,
        sourceMediaId: entry?.sourceMediaId || '',
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
        previewUrl: '',
        pendingFile: null,
        sourceMediaId: '',
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
        id: variant?.id || variant?.code || variant?.barcode || variant?.sku || variant?.itemCode || `variant-${index}`,
        name: stringifyValue(variant?.name || variant?.label || ''),
        label: stringifyValue(variant?.label || variant?.name || ''),
        code: stringifyValue(variant?.code || variant?.barcode || variant?.productCode || variant?.sku || variant?.itemCode || ''),
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
        code: (product?.code || product?.barcode || product?.itemCode || product?.sku || product?.productCode || '').toString().trim(),
        category: product?.category || 'All',
        brand: product?.brand || 'Generic',
        origin: product?.origin || '',
        price: stringifyValue(product?.price || product?.retailPrice || ''),
        wholesalePrice: stringifyValue(product?.wholesalePrice || product?.wholesale_price || product?.cartonPrice || ''),
        discountAmount: stringifyValue(product?.discountAmount || product?.discount_amount || product?.discountValue || product?.discount || ''),
        desc: product?.desc || product?.description || '',
        stockStatus: product?.stockStatus || 'in_stock',
        isLinked: Boolean(product?.isLinked),
        isGloballyAvailable: typeof product?.availableGlobally === 'boolean'
            ? product.availableGlobally
            : !Boolean(product?.isHidden),
        imageDetails: normalizedMedia.items.length > 0 ? normalizedMedia.items : [createBlankImage(true)],
        variants: variantList
    };
}

function pickImageFile(onLoad) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        onLoad(file, URL.createObjectURL(file));
    };
    input.click();
}

function collectImageKitFileIdsFromProduct(product = {}) {
    const normalizedMainMedia = normalizeMediaCollection(product?.imageDetails, product?.images || []);
    const collected = normalizedMainMedia.items
        .filter((item) => item.provider === 'imagekit' && item.fileId)
        .map((item) => item.fileId);

    (product?.variants || []).forEach((variant) => {
        const normalizedVariantMedia = normalizeMediaCollection(variant?.imageDetails, variant?.images || (variant?.image ? [variant.image] : []));
        normalizedVariantMedia.items.forEach((item) => {
            if (item.provider === 'imagekit' && item.fileId) {
                collected.push(item.fileId);
            }
        });
    });

    return Array.from(new Set(collected));
}

function getRemovedImageKitFileIds(previousProduct = null, nextProduct = null) {
    const previousIds = new Set(collectImageKitFileIdsFromProduct(previousProduct || {}));
    const nextIds = new Set(collectImageKitFileIdsFromProduct(nextProduct || {}));
    return Array.from(previousIds).filter((fileId) => !nextIds.has(fileId));
}

function getToneClasses(tone) {
    if (tone === 'emerald') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    if (tone === 'amber') return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
    return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
}

export default function AdminProductModal({ isOpen, onClose, product, categories, brands, onDelete, deleteLoading = false }) {
    const { dcProductsMap, allProducts } = useGallery();
    const [formData, setFormData] = useState(() => buildInitialFormData(null));
    const [loading, setLoading] = useState(false);
    const [variantImagePicker, setVariantImagePicker] = useState({ variantIndex: null, imageIndex: null });

    useEffect(() => {
        const initialData = buildInitialFormData(product || null);
        const normalizedCode = String(initialData.code || '').trim().toLowerCase();
        const dcEntry = dcProductsMap?.[normalizedCode];

        if (dcEntry) {
            const price = dcEntry.retailPrice || dcEntry.price || dcEntry.retail_price;
            const wholesalePrice = dcEntry.wholesalePrice || dcEntry.wholesale_price || dcEntry.cartonPrice;
            const discountAmount = dcEntry.discountAmount || dcEntry.discount_amount || dcEntry.discountValue || dcEntry.discount;

            if (price) initialData.price = String(price);
            if (wholesalePrice) initialData.wholesalePrice = String(wholesalePrice);
            if (discountAmount) initialData.discountAmount = String(discountAmount);
            initialData.isLinked = true;
        }

        setFormData(initialData);
    }, [product, isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        setFormData((prev) => {
            const normalizedCode = String(prev.code || '').trim().toLowerCase();
            if (!normalizedCode) {
                if (!prev.isLinked) return prev;
                return { ...prev, isLinked: false };
            }

            const dcEntry = dcProductsMap?.[normalizedCode];
            if (!dcEntry) {
                if (!prev.isLinked) return prev;
                return { ...prev, isLinked: false };
            }

            const price = dcEntry.retailPrice || dcEntry.price || dcEntry.retail_price;
            const wholesalePrice = dcEntry.wholesalePrice || dcEntry.wholesale_price || dcEntry.cartonPrice;
            const discountAmount = dcEntry.discountAmount || dcEntry.discount_amount || dcEntry.discountValue || dcEntry.discount;

            const nextData = {
                ...prev,
                isLinked: true,
                ...(price ? { price: String(price) } : {}),
                ...(wholesalePrice ? { wholesalePrice: String(wholesalePrice) } : {}),
                ...(discountAmount ? { discountAmount: String(discountAmount) } : {})
            };

            const didChange = nextData.isLinked !== prev.isLinked
                || nextData.price !== prev.price
                || nextData.wholesalePrice !== prev.wholesalePrice
                || nextData.discountAmount !== prev.discountAmount;

            return didChange ? nextData : prev;
        });
    }, [dcProductsMap, isOpen]);

    if (!isOpen) return null;

    const categoryOptions = Array.isArray(categories) ? categories : [];
    const brandOptionsList = Array.isArray(brands) ? brands : [];
    const hasGeneric = brandOptionsList.some(b => String(b.name || b).toLowerCase() === 'generic');
    const brandOptions = hasGeneric ? brandOptionsList : [...brandOptionsList, { id: 'generic-fallback', name: 'Generic' }];
    const originOptions = Array.from(
        new Set(
            [
                ...allProducts.map((entry) => normalizeLabel(entry?.origin || entry?.country || entry?.countryOfOrigin, '')),
                normalizeLabel(formData.origin, '')
            ].filter(Boolean)
        )
    ).sort((left, right) => left.localeCompare(right));
    const orderedImages = reorderPrimaryFirst(formData.imageDetails);
    const availableProductImages = orderedImages.filter((item) => getRenderableMediaUrl(item));
    const imageCount = orderedImages.filter((item) => getRenderableMediaUrl(item)).length;
    const variantCount = formData.variants.length;

    const getDuplicateWarning = (code) => {
        if (!code || !allProducts) return null;
        const normalized = String(code).trim().toLowerCase();
        
        for (const p of allProducts) {
            if (product && p.id === product.id) continue;
            
            const pCode = String(p.code || '').trim().toLowerCase();
            if (pCode === normalized) return p.name || p.title || 'Unknown Product';
            
            if (Array.isArray(p.variants)) {
                for (const v of p.variants) {
                    const vCode = String(v.code || v.barcode || '').trim().toLowerCase();
                    if (vCode === normalized) return p.name || p.title || 'Unknown Product';
                }
            }
        }
        return null;
    };

    const updateField = (field, value) => {
        setFormData((prev) => {
            const nextData = { ...prev, [field]: value };
            
            if (field === 'code') {
                const normalizedCode = String(value || '').trim().toLowerCase();
                const dcEntry = dcProductsMap?.[normalizedCode];
                if (dcEntry) {
                    const price = dcEntry.retailPrice || dcEntry.price || dcEntry.retail_price;
                    const wholesalePrice = dcEntry.wholesalePrice || dcEntry.wholesale_price || dcEntry.cartonPrice;
                    const discountAmount = dcEntry.discountAmount || dcEntry.discount_amount || dcEntry.discountValue || dcEntry.discount;
                    
                    if (price) nextData.price = String(price);
                    if (wholesalePrice) nextData.wholesalePrice = String(wholesalePrice);
                    if (discountAmount) nextData.discountAmount = String(discountAmount);
                    nextData.isLinked = true;
                } else {
                    nextData.isLinked = false;
                }
            }
            
            return nextData;
        });
    };

    const handleAddOrigin = () => {
        const nextOrigin = window.prompt('Enter new region name:', formData.origin || '');
        const normalizedOrigin = normalizeLabel(nextOrigin, '');

        if (!normalizedOrigin) return;
        updateField('origin', normalizedOrigin);
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
                    provider: field === 'url' ? inferProvider(value.trim()) : item.provider,
                    pendingFile: field === 'url' ? null : item.pendingFile,
                    previewUrl: field === 'url' ? '' : item.previewUrl,
                    fileId: field === 'url' ? '' : item.fileId,
                    filePath: field === 'url' ? '' : item.filePath
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
        pickImageFile((file, previewUrl) => {
            setFormData((prev) => ({
                ...prev,
                imageDetails: prev.imageDetails.map((item, itemIndex) => {
                    if (itemIndex !== index) return item;
                    return {
                        ...item,
                        url: previewUrl,
                        primaryUrl: previewUrl,
                        pendingFile: file,
                        previewUrl,
                        provider: 'imagekit',
                        fileId: '',
                        filePath: ''
                    };
                })
            }));
        });
    };

    const updateVariant = (index, field, value) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((variant, variantIndex) => {
                if (variantIndex !== index) return variant;
                
                const nextVariant = { ...variant, [field]: value };
                if (field === 'name') nextVariant.label = value;
                
                if (field === 'code') {
                    const normalizedCode = String(value || '').trim().toLowerCase();
                    const dcEntry = dcProductsMap?.[normalizedCode];
                    
                    if (dcEntry) {
                        const price = dcEntry.retailPrice || dcEntry.price || dcEntry.retail_price;
                        const wholesalePrice = dcEntry.wholesalePrice || dcEntry.wholesale_price || dcEntry.cartonPrice;
                        const discountAmount = dcEntry.discountAmount || dcEntry.discount_amount || dcEntry.discountValue || dcEntry.discount;
                        
                        if (price) nextVariant.price = String(price);
                        if (wholesalePrice) nextVariant.wholesalePrice = String(wholesalePrice);
                        if (discountAmount) nextVariant.discountAmount = String(discountAmount);
                        nextVariant.isLinked = true;
                    } else {
                        nextVariant.isLinked = false;
                    }
                }
                
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

    const addVariantImage = (index) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((variant, variantIndex) => {
                if (variantIndex !== index) return variant;
                const existing = variant.imageDetails || [];
                return {
                    ...variant,
                    imageDetails: [...existing, createBlankImage(existing.length === 0)]
                };
            })
        }));
    };

    const removeVariantImage = (variantIndex, imageIndex) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((variant, vIndex) => {
                if (vIndex !== variantIndex) return variant;
                const existing = (variant.imageDetails && variant.imageDetails.length > 0) ? variant.imageDetails : [createBlankImage(true)];
                const filtered = existing.filter((_, i) => i !== imageIndex);
                const nextImages = filtered.length > 0 ? filtered : [createBlankImage(true)];
                const primaryUrl = nextImages[0]?.url || nextImages[0]?.primaryUrl || '';
                return {
                    ...variant,
                    imageDetails: nextImages,
                    image: primaryUrl,
                    images: nextImages.map(img => img.url).filter(Boolean)
                };
            })
        }));
    };

    const updateVariantImageUrl = (variantIndex, imageIndex, value) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((variant, vIndex) => {
                if (vIndex !== variantIndex) return variant;
                const normalizedUrl = value.trim();
                const existing = (variant.imageDetails && variant.imageDetails.length > 0) ? variant.imageDetails : [createBlankImage(true)];
                const nextImages = existing.map((img, i) => {
                    if (i !== imageIndex) return img;
                    return {
                        ...img,
                        url: normalizedUrl,
                        primaryUrl: normalizedUrl,
                        provider: inferProvider(normalizedUrl),
                        pendingFile: null,
                        previewUrl: '',
                        fileId: '',
                        filePath: ''
                    };
                });
                const primaryUrl = nextImages[0]?.url || nextImages[0]?.primaryUrl || '';
                return {
                    ...variant,
                    imageDetails: nextImages,
                    image: primaryUrl,
                    images: nextImages.map(img => img.url).filter(Boolean)
                };
            })
        }));
    };

    const loadVariantImageFromFile = (variantIndex, imageIndex) => {
        pickImageFile((file, previewUrl) => {
            setFormData((prev) => ({
                ...prev,
                variants: prev.variants.map((variant, currentVariantIndex) => {
                    if (currentVariantIndex !== variantIndex) return variant;
                    const existing = (variant.imageDetails && variant.imageDetails.length > 0) ? variant.imageDetails : [createBlankImage(true)];
                    const nextImages = existing.map((img, currentImageIndex) => {
                        if (currentImageIndex !== imageIndex) return img;
                        return {
                            ...img,
                            url: previewUrl,
                            primaryUrl: previewUrl,
                            pendingFile: file,
                            previewUrl,
                            provider: 'imagekit',
                            fileId: '',
                            filePath: '',
                            sourceMediaId: ''
                        };
                    });
                    const primaryUrl = nextImages[0]?.primaryUrl || nextImages[0]?.url || '';
                    return {
                        ...variant,
                        imageDetails: nextImages,
                        image: primaryUrl,
                        images: nextImages.map((img) => img.primaryUrl || img.url).filter(Boolean)
                    };
                })
            }));
        });
    };

    const toggleVariantImagePicker = (variantIndex, imageIndex) => {
        setVariantImagePicker((currentValue) => {
            if (currentValue.variantIndex === variantIndex && currentValue.imageIndex === imageIndex) {
                return { variantIndex: null, imageIndex: null };
            }

            return { variantIndex, imageIndex };
        });
    };

    const linkVariantImageToProductImage = (variantIndex, imageIndex, productImage) => {
        const normalizedProductImage = normalizeMediaEntry(productImage, imageIndex);

        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((variant, currentVariantIndex) => {
                if (currentVariantIndex !== variantIndex) return variant;

                const existing = (variant.imageDetails && variant.imageDetails.length > 0) ? variant.imageDetails : [createBlankImage(true)];
                const nextImages = existing.map((img, currentImageIndex) => {
                    if (currentImageIndex !== imageIndex) return img;

                    return {
                        ...img,
                        url: normalizedProductImage.url,
                        primaryUrl: normalizedProductImage.primaryUrl,
                        fallbackUrl: normalizedProductImage.fallbackUrl,
                        provider: normalizedProductImage.provider,
                        fileId: normalizedProductImage.fileId,
                        filePath: normalizedProductImage.filePath,
                        previewUrl: normalizedProductImage.previewUrl,
                        pendingFile: normalizedProductImage.pendingFile,
                        sourceMediaId: normalizedProductImage.id
                    };
                });

                const primaryUrl = nextImages[0]?.primaryUrl || nextImages[0]?.url || '';
                return {
                    ...variant,
                    imageDetails: nextImages,
                    image: primaryUrl,
                    images: nextImages.map((img) => img.primaryUrl || img.url).filter(Boolean)
                };
            })
        }));

        setVariantImagePicker({ variantIndex: null, imageIndex: null });
    };

    const handleSubmit = async (event) => {
        event?.preventDefault?.();
        setLoading(true);
        const uploadedFileIds = [];

        try {
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error('Authentication required before uploading product media');
            }

            const uploadRoot = normalizeLabel(product?.id || formData.code || product?.code, 'draft');
            const uploadedMediaCache = new Map();

            const uploadMediaItem = async (item, index, folder) => {
                const normalizedItem = normalizeMediaEntry(item, index);
                const existingUrl = normalizedItem.url.trim();
                const pendingFileKey = item?.pendingFile
                    ? `${item.pendingFile.name}:${item.pendingFile.size}:${item.pendingFile.lastModified}`
                    : '';
                const sharedMediaKey = normalizedItem.fileId
                    ? `file:${normalizedItem.fileId}`
                    : normalizedItem.sourceMediaId
                        ? `source:${normalizedItem.sourceMediaId}`
                        : pendingFileKey
                            ? `pending:${pendingFileKey}`
                            : existingUrl
                                ? `url:${existingUrl}`
                                : '';

                if (sharedMediaKey && uploadedMediaCache.has(sharedMediaKey)) {
                    return normalizeMediaEntry({
                        ...normalizedItem,
                        ...uploadedMediaCache.get(sharedMediaKey),
                        previewUrl: '',
                        pendingFile: null
                    }, index);
                }

                if (item?.pendingFile) {
                    const uploadedMedia = await uploadToImageKit(currentUser, item.pendingFile, {
                        folder,
                        fileName: `${uploadRoot}_${folder.split('/').pop()}_${index + 1}.${inferUploadExtension(item.pendingFile)}`,
                        tags: ['product', 'admin-modal']
                    });
                    if (uploadedMedia.fileId) uploadedFileIds.push(uploadedMedia.fileId);
                    if (sharedMediaKey) uploadedMediaCache.set(sharedMediaKey, uploadedMedia);
                    return normalizeMediaEntry({ ...normalizedItem, ...uploadedMedia, previewUrl: '', pendingFile: null }, index);
                }

                if (existingUrl.startsWith('data:')) {
                    const uploadBlob = await fetch(existingUrl).then((response) => response.blob());
                    const uploadedMedia = await uploadToImageKit(currentUser, uploadBlob, {
                        folder,
                        fileName: `${uploadRoot}_${folder.split('/').pop()}_${index + 1}.${inferUploadExtension(existingUrl)}`,
                        tags: ['product', 'admin-modal']
                    });
                    if (uploadedMedia.fileId) uploadedFileIds.push(uploadedMedia.fileId);
                    if (sharedMediaKey) uploadedMediaCache.set(sharedMediaKey, uploadedMedia);
                    return normalizeMediaEntry({ ...normalizedItem, ...uploadedMedia, previewUrl: '', pendingFile: null }, index);
                }

                if (!existingUrl) {
                    return null;
                }

                if (sharedMediaKey) uploadedMediaCache.set(sharedMediaKey, normalizedItem);
                return normalizeMediaEntry({ ...normalizedItem, previewUrl: '', pendingFile: null }, index);
            };

            const normalizedMainItems = reorderPrimaryFirst(
                (await Promise.all(
                    reorderPrimaryFirst(formData.imageDetails).map((item, index) => uploadMediaItem(item, index, `/products/${uploadRoot}/main`))
                )).filter(Boolean)
            );

            const resolvedVariants = (await Promise.all(formData.variants
                .map(async (variant, variantIndex) => {
                    const variantSource = (variant.imageDetails && variant.imageDetails.length > 0)
                        ? variant.imageDetails
                        : (variant.images && variant.images.length > 0 ? variant.images : (variant.image ? [variant.image] : []));
                    const variantMediaItems = reorderPrimaryFirst(
                        (await Promise.all(
                            variantSource.map((item, imageIndex) => uploadMediaItem(item, imageIndex, `/products/${uploadRoot}/variants/${variantIndex + 1}`))
                        )).filter(Boolean)
                    );
                    const variantMedia = {
                        items: variantMediaItems,
                        urls: variantMediaItems.map((item) => item.primaryUrl || item.url || item.fallbackUrl).filter(Boolean)
                    };
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
                })))
                .filter((variant) => variant.name || variant.label || variant.code || variant.images.length > 0);

            const productData = {
                name: formData.name.trim(),
                title: formData.name.trim(),
                code: formData.code.trim(),
                category: formData.category,
                brand: formData.brand.trim(),
                origin: formData.origin.trim(),
                price: normalizeNumericValue(formData.price),
                wholesalePrice: normalizeNumericValue(formData.wholesalePrice),
                discountAmount: normalizeNumericValue(formData.discountAmount),
                desc: formData.desc.trim(),
                description: formData.desc.trim(),
                stockStatus: formData.stockStatus,
                availableGlobally: formData.isGloballyAvailable,
                isHidden: !formData.isGloballyAvailable,
                image: normalizedMainItems[0]?.primaryUrl || normalizedMainItems[0]?.url || '',
                images: normalizedMainItems.map((item) => item.primaryUrl || item.url || item.fallbackUrl).filter(Boolean),
                imageDetails: normalizedMainItems,
                variants: resolvedVariants,
                updatedAt: serverTimestamp()
            };

            const nextProductState = {
                ...(product || {}),
                ...productData
            };

            if (!product) {
                productData.createdAt = serverTimestamp();
            }

            if (product?.id) {
                await setDoc(doc(db, 'products', product.id), productData, { merge: true });
            } else {
                await addDoc(collection(db, 'products'), productData);
            }

            const removableFileIds = product ? getRemovedImageKitFileIds(product, nextProductState) : [];
            if (removableFileIds.length > 0) {
                try {
                    await deleteImageKitFiles(currentUser, removableFileIds);
                } catch (cleanupError) {
                    console.error('Failed to delete removed ImageKit files:', cleanupError);
                }
            }

            onClose();
        } catch (error) {
            console.error('Error saving product:', error);
            if (uploadedFileIds.length > 0 && auth.currentUser) {
                try {
                    await deleteImageKitFiles(auth.currentUser, uploadedFileIds);
                } catch (cleanupError) {
                    console.error('Failed to clean up newly uploaded ImageKit files:', cleanupError);
                }
            }
            alert(error?.message || 'Failed to save product');
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
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Origin</span>
                                            <button
                                                type="button"
                                                onClick={handleAddOrigin}
                                                className="inline-flex items-center gap-1 rounded-lg border border-brandGold/25 bg-brandGold/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-brandGold transition hover:bg-brandGold/18"
                                            >
                                                <i className="fa-solid fa-plus"></i>
                                                Add
                                            </button>
                                        </div>
                                        <select
                                            value={formData.origin}
                                            onChange={(event) => updateField('origin', event.target.value)}
                                            className="appearance-none w-full rounded-2xl border border-white/10 bg-[#0f1728] px-4 py-3 text-white outline-none transition focus:border-brandGold/60"
                                        >
                                            <option value="" disabled>Select Region</option>
                                            {originOptions.map((origin) => (
                                                <option key={origin} value={origin}>{origin}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <div className="block">
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Product code</span>
                                            {formData.isGloballyAvailable === false ? null : <span className="hidden"></span>}
                                        </div>
                                        <input
                                            type="text"
                                            value={formData.code}
                                            onChange={(event) => updateField('code', event.target.value)}
                                            className={`w-full rounded-2xl border border-white/10 bg-[#0f1728] px-4 py-3 text-white outline-none transition focus:ring-1 ${getDuplicateWarning(formData.code) ? 'border-rose-500/50 focus:border-rose-500 focus:ring-rose-500' : 'focus:border-brandGold/60 focus:ring-brandGold/60'}`}
                                        />
                                        {getDuplicateWarning(formData.code) && (
                                            <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-rose-400">
                                                <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
                                                <span>Already exists in <strong>{getDuplicateWarning(formData.code)}</strong></span>
                                            </p>
                                        )}
                                    </div>

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
                                        const imageUrl = getRenderableMediaUrl(image);
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
                                                <div key={variant.id ? `${variant.id}-${index}` : index} className="rounded-xl border border-white/10 bg-[#121a2d] p-3">
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

<div className="block space-y-1.5">
                                                                  <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Code</span>
                                                                  <input        
                                                                      type="text"
                                                                      value={variant.code || ''}
                                                                      onChange={(e) => updateVariant(index, 'code', e.target.value)}
                                                                      className={`w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:ring-1 ${getDuplicateWarning(variant.code) ? 'border-rose-500/50 focus:border-rose-500 focus:ring-rose-500' : 'focus:border-brandGold/50 focus:ring-brandGold/50'}`}
                                                                  />
                                                                  {getDuplicateWarning(variant.code) && (
                                                                      <p className="text-[11px] font-medium text-rose-400 flex items-start gap-1 mt-1">
                                                                          <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
                                                                          <span>Already exists in <strong>{getDuplicateWarning(variant.code)}</strong></span>
                                                                      </p>
                                                                  )}
                                                            </div>

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
                                                                  <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Retail price</span>
                                                                  <input
                                                                      type="text"
                                                                      disabled={variant.isLinked}
                                                                      value={variant.price || ''}
                                                                      onChange={(e) => updateVariant(index, 'price', e.target.value)}
                                                                      className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-brandGold/50 focus:ring-1 focus:ring-brandGold/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                  />
                                                            </label>

                                                            <label className="block">
                                                                  <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Wholesale price</span>
                                                                  <input        
                                                                      type="text"
                                                                      disabled={variant.isLinked}
                                                                      value={variant.wholesalePrice || ''}
                                                                      onChange={(e) => updateVariant(index, 'wholesalePrice', e.target.value)}
                                                                      className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-brandGold/50 focus:ring-1 focus:ring-brandGold/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                  />
                                                            </label>

                                                            <label className="block">
                                                                  <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Discount value</span>
                                                                  <input        
                                                                      type="text"
                                                                      disabled={variant.isLinked}
                                                                      value={variant.discountAmount || ''}
                                                                      onChange={(e) => updateVariant(index, 'discountAmount', e.target.value)}
                                                                      className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-brandGold/50 focus:ring-1 focus:ring-brandGold/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                  />
                                                            </label>

                                                            <label className="block">
                                                                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Net price</span>
                                                                <input
                                                                    type="text"
                                                                    disabled    
                                                                    value={Number(variant.price || 0) - Number(variant.discountAmount || 0)}
                                                                    className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-[#0f1728]/50 px-3 py-2 text-sm text-slate-400 outline-none transition"
                                                                />
                                                            </label>
                                                        </div>

                                                        <div className="rounded-xl border border-white/10 bg-[#0f1728] p-2.5 space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Variant Images</p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => addVariantImage(index)}
                                                                    className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                                                                >
                                                                    <i className="fa-solid fa-plus text-[8px]"></i>
                                                                </button>
                                                            </div>
                                                            <div className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-2 custom-scrollbar">
                                                                {(variant.imageDetails && variant.imageDetails.length > 0 ? variant.imageDetails : [{ url: variant.image || '', id: `temp-${index}` }]).map((img, imgIndex) => {
                                                                    const imgUrl = getRenderableMediaUrl(img);
                                                                    return (
                                                                        <div key={img.id || imgIndex} className="relative group w-[220px] shrink-0 snap-start rounded-lg border border-white/5 bg-[#0a1020] p-2">
                                                                            <div className="flex h-[150px] items-center justify-center overflow-hidden rounded-md border border-white/5 bg-[#050810]">
                                                                                {imgUrl ? (
                                                                                    <img src={imgUrl} alt="Variant" className="h-full w-full object-cover" />
                                                                                ) : (
                                                                                    <div className="text-center text-slate-600">
                                                                                        <i className="fa-regular fa-image text-xl"></i>
                                                                                        <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em]">Variant image</p>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => removeVariantImage(index, imgIndex)}
                                                                                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/80 text-white opacity-0 transition hover:bg-rose-500 group-hover:opacity-100"
                                                                            >
                                                                                <i className="fa-solid fa-xmark text-[10px]"></i>
                                                                            </button>

                                                                            <label className="mt-2.5 block">
                                                                                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Image link</span>
                                                                                <input
                                                                                    type="text"
                                                                                    value={imgUrl}
                                                                                    onChange={(event) => updateVariantImageUrl(index, imgIndex, event.target.value)}
                                                                                    className="w-full rounded-xl border border-white/10 bg-[#10192c] px-3 py-2 text-sm text-white outline-none transition focus:border-brandGold/60"
                                                                                />
                                                                            </label>
                                                                            <div className="mt-2.5 flex gap-1.5">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => loadVariantImageFromFile(index, imgIndex)}
                                                                                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.09]"
                                                                                >
                                                                                    Upload
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => toggleVariantImagePicker(index, imgIndex)}
                                                                                    disabled={availableProductImages.length === 0}
                                                                                    className="flex-1 rounded-lg border border-brandGold/20 bg-brandGold/10 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-brandGold transition hover:bg-brandGold/15 disabled:cursor-not-allowed disabled:opacity-40"
                                                                                >
                                                                                    Link image
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => updateVariantImageUrl(index, imgIndex, '')}
                                                                                    className="flex-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-rose-300 transition hover:bg-rose-500/15"
                                                                                >
                                                                                    Clear
                                                                                </button>
                                                                            </div>
                                                                            {variantImagePicker.variantIndex === index && variantImagePicker.imageIndex === imgIndex ? (
                                                                                <div className="mt-2.5 space-y-2 rounded-lg border border-brandGold/15 bg-[#0c1425] p-2.5">
                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-brandGold/80">Product Images</p>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setVariantImagePicker({ variantIndex: null, imageIndex: null })}
                                                                                            className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 transition hover:text-white"
                                                                                        >
                                                                                            Close
                                                                                        </button>
                                                                                    </div>
                                                                                    {availableProductImages.length === 0 ? (
                                                                                        <p className="text-[11px] text-slate-500">Upload or add product images first.</p>
                                                                                    ) : (
                                                                                        <div className="grid grid-cols-3 gap-2">
                                                                                            {availableProductImages.map((productImage, productImageIndex) => {
                                                                                                const productImageUrl = getRenderableMediaUrl(productImage);
                                                                                                const isSameSource = (img.sourceMediaId && img.sourceMediaId === productImage.id)
                                                                                                    || (img.fileId && img.fileId === productImage.fileId)
                                                                                                    || (getMediaUrl(img) && getMediaUrl(img) === getMediaUrl(productImage));

                                                                                                return (
                                                                                                    <button
                                                                                                        key={productImage.id || productImageIndex}
                                                                                                        type="button"
                                                                                                        onClick={() => linkVariantImageToProductImage(index, imgIndex, productImage)}
                                                                                                        className={`overflow-hidden rounded-lg border p-1 transition ${isSameSource ? 'border-brandGold bg-brandGold/10' : 'border-white/10 bg-white/[0.03] hover:border-brandGold/40'}`}
                                                                                                    >
                                                                                                        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-[#050810]">
                                                                                                            {productImageUrl ? <img src={productImageUrl} alt="Product media" className="h-full w-full object-cover" /> : null}
                                                                                                        </div>
                                                                                                    </button>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : null}
                                                                        </div>
                                                                    );
                                                                })}
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
                                            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Retail price</span>
                                            {formData.isLinked ? <span className="rounded bg-brandGold/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-brandGold/70">DC Managed</span> : null}
                                        </div>
                                        <input
                                            type="number"
                                            disabled={formData.isLinked}
                                            value={formData.price || ''}
                                            onChange={(e) => updateField('price', Number(e.target.value))}
                                            className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-brandGold/50 focus:ring-1 focus:ring-brandGold/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Wholesale price</span>
                                        <input
                                            type="number"
                                            disabled={formData.isLinked}
                                            value={formData.wholesalePrice || ''}
                                            onChange={(e) => updateField('wholesalePrice', Number(e.target.value))}
                                            className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-brandGold/50 focus:ring-1 focus:ring-brandGold/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Discount value</span>
                                        <input
                                            type="number"
                                            disabled={formData.isLinked}
                                            value={formData.discountAmount || ''}
                                            onChange={(e) => updateField('discountAmount', Number(e.target.value))}
                                            className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-brandGold/50 focus:ring-1 focus:ring-brandGold/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Net price</span>
                                        <input
                                            type="number"
                                            disabled
                                            value={Number(formData.price || 0) - Number(formData.discountAmount || 0)}
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

</aside>
                    </div>
                </form>

                <div className="flex flex-col gap-2 border-t border-white/10 bg-[#11192b]/90 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
                    <p className="text-xs text-slate-400 max-w-[60%]">
                        Primary media is always saved first so current gallery and legacy consumers resolve the same cover image.
                    </p>
                    <div className="flex items-center justify-end gap-2.5">
                        {product?.id && onDelete ? (
                            <button
                                onClick={() => onDelete?.(product)}
                                type="button"
                                disabled={loading || deleteLoading}
                                className="rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs font-black text-rose-300 transition hover:bg-rose-500/18 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deleteLoading ? 'Deleting...' : 'Delete Product'}
                            </button>
                        ) : null}
                        <button
                            onClick={onClose}
                            type="button"
                            disabled={loading || deleteLoading}
                            className="rounded-[10px] border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-slate-300 transition hover:bg-white/[0.08]"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            form="productForm"
                            disabled={loading || deleteLoading}
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

