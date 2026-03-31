'use client';
import { useState } from 'react';
import { useGallery } from '@/contexts/GalleryContext';

export default function ProductGrid() {
    const { filteredProducts, isLoading, setSelectedProduct } = useGallery();
    const [flippedCards, setFlippedCards] = useState({});

    const getImageUrl = (product) => {
        const firstImage = Array.isArray(product.images) ? product.images[0] : null;
        if (!firstImage) return '';
        return firstImage.url || firstImage.primaryUrl || firstImage;
    };

    const getMetaParts = (product) => {
        return [product.category, product.brand, product.origin].filter(Boolean).slice(0, 2);
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
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-10">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="group relative bg-white dark:bg-darkCard rounded-[2rem] p-4 flex flex-col justify-between border border-gray-100 dark:border-gray-800 animate-pulse h-[350px]">
                        <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 rounded-[1.5rem] mb-4"></div>
                        <div className="space-y-3">
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
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

    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-10">
            {filteredProducts.map((product) => {
                const productId = product.id || product.code || product.name;
                const stockStatus = product.stockStatus || 'in_stock';
                const isHidden = product.isHidden || false;
                const remainingQuantity = product.remainingQuantity || 0;
                const imageUrl = getImageUrl(product);
                const metaParts = getMetaParts(product);
                const variants = getVariantEntries(product);
                const hasVariants = variants.length > 0;
                const isFlipped = Boolean(flippedCards[productId]);
                const featuredVariants = variants.slice(0, 4);
                
                return (
                    <div 
                        key={productId}
                        className="relative [perspective:1800px]"
                    >
                        <div className={`relative min-h-[28rem] transition-transform duration-700 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
                            <div 
                                onClick={() => openProductDetails(product)}
                                className={`group absolute inset-0 rounded-[2rem] bg-white dark:bg-darkCard p-4 flex flex-col justify-between shadow-sm hover:shadow-2xl hover:shadow-brandGold/10 transition-all duration-500 border border-gray-100 hover:border-brandGold/30 dark:border-gray-800/80 hover:-translate-y-2 cursor-pointer [backface-visibility:hidden]
                                ${stockStatus === 'out_of_stock' ? 'opacity-80 grayscale-[20%]' : ''}`}
                            >
                                {getStockBadge(stockStatus, isHidden, remainingQuantity)}

                                {hasVariants && (
                                    <button
                                        type="button"
                                        onClick={(event) => toggleCardFlip(productId, event)}
                                        className="absolute top-4 left-4 z-20 inline-flex items-center gap-2 rounded-full border border-brandGold/30 bg-white/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-brandBlue shadow-lg backdrop-blur-md transition-all hover:border-brandGold hover:bg-brandGold hover:text-white dark:bg-black/70 dark:text-white"
                                    >
                                        <i className="fa-solid fa-arrows-rotate text-[10px]"></i>
                                        {variants.length} VARIANTS
                                    </button>
                                )}

                                <div className="relative w-full aspect-[4/5] rounded-[1.5rem] overflow-hidden mb-6 bg-gray-50 dark:bg-gray-800/50">
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

                                <div className="px-2">
                                    <div className="title-container">
                                        <h3 className="title-slide font-bold text-gray-900 dark:text-white text-lg md:text-xl mb-2 leading-tight group-hover:text-brandGold transition-colors" dir="rtl">
                                            {product.title || product.name}
                                        </h3>
                                    </div>

                                    {metaParts.length > 0 && (
                                        <div className="product-card-meta-row" dir="rtl">
                                            <div className="product-card-label">
                                                <div className="product-card-label-content">
                                                    {metaParts.map((part, index) => (
                                                        <span key={`${productId}-${part}`} className={`product-card-label-part ${index === 0 ? 'is-primary' : ''}`}>
                                                            {index > 0 && <span className="product-card-label-separator">•</span>}
                                                            {part}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="flex items-center justify-between mt-4" dir="rtl">
                                        <div>
                                            <span className="text-gray-400 text-[10px] md:text-xs font-medium mb-1 uppercase tracking-widest block hidden md:block">السعر</span>
                                            {product.price ? (
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="font-black text-gray-900 dark:text-white text-xl md:text-2xl tracking-tight">{product.price}</span>
                                                    <span className="text-brandGold font-bold text-xs md:text-sm">ج.م</span>
                                                </div>
                                            ) : (
                                                <span className="font-bold text-brandGold text-sm">تواصل معنا</span>
                                            )}
                                        </div>
                                        
                                        <button className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gray-50 dark:bg-gray-800/50 hover:bg-brandGold hover:text-white text-gray-400 flex items-center justify-center transition-all duration-300 shadow-sm border border-gray-100 dark:border-gray-800 focus:scale-95 group/btn">
                                            <i className="fa-solid fa-arrow-left -rotate-45 group-hover/btn:rotate-0 transition-transform duration-300"></i>
                                        </button>
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

                                    <div className="mt-5 grid grid-cols-2 gap-3">
                                        {featuredVariants.map((variant, index) => {
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

                                    <div className="mt-auto space-y-3 pt-5">
                                        {variants.length > featuredVariants.length ? (
                                            <p className="text-right text-[11px] font-bold uppercase tracking-[0.14em] text-brandGold/85" dir="rtl">
                                                +{variants.length - featuredVariants.length} variants more inside details
                                            </p>
                                        ) : null}
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
                )
            })}
        </div>
    );
}