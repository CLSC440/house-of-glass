'use client';
import { useGallery } from '@/contexts/GalleryContext';
import { useEffect, useState } from 'react';
import { AnimatedTestimonials } from '@/components/ui/animated-testimonials';
import { buildWhatsAppUrl, useSiteSettings } from '@/lib/use-site-settings';

export default function ProductModal() {
    const { selectedProduct, setSelectedProduct, addToCart, addToWholesaleCart, isWholesaleCustomer } = useGallery();

    useEffect(() => {
        if (selectedProduct) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [selectedProduct]);

    if (!selectedProduct) return null;

    const closeModal = () => setSelectedProduct(null);

    return (
        <ProductModalContent
            key={selectedProduct.id || selectedProduct.code || selectedProduct.name}
            selectedProduct={selectedProduct}
            closeModal={closeModal}
            addToCart={addToCart}
            addToWholesaleCart={addToWholesaleCart}
            isWholesaleCustomer={isWholesaleCustomer}
        />
    );
}

function ProductModalContent({ selectedProduct, closeModal, addToCart, addToWholesaleCart, isWholesaleCustomer }) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const { siteSettings } = useSiteSettings();
    
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
    const enquiryText = `مرحباً، أستفسر عن المنتج: ${selectedProduct.title || selectedProduct.name}`;
    const stockLimit = Number.isFinite(Number(selectedProduct.remainingQuantity)) && Number(selectedProduct.remainingQuantity) > 0
        ? Number(selectedProduct.remainingQuantity)
        : null;
    const isOutOfStock = selectedProduct.stockStatus === 'out_of_stock' || stockLimit === 0;
    const currentPrice = Number(selectedProduct.price || selectedProduct.retailPrice || selectedProduct.retail_price || 0);
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

    const increaseQuantity = () => {
        setQuantity((currentValue) => {
            const nextValue = currentValue + 1;
            if (stockLimit === null) return nextValue;
            return Math.min(nextValue, stockLimit);
        });
    };

    const decreaseQuantity = () => {
        setQuantity((currentValue) => Math.max(1, currentValue - 1));
    };

    const handleAddToCart = () => {
        addToCart(selectedProduct, quantity);
    };

    const handleAddToWholesaleCart = () => {
        addToWholesaleCart(selectedProduct, quantity);
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

    const variantsAsTestimonials = hasVariants ? selectedProduct.variants.map((v, idx) => {
        const vImages = getVariantAllImages(v);
        const displayImage = idx === activeVariantIndex && vImages[subImageIndex] ? vImages[subImageIndex] : vImages[0];
        
        return {
            src: displayImage,
            name: v.name || v.label || selectedProduct.title || selectedProduct.name || `Variant ${idx + 1}`,
            designation: v.price ? `${v.price} ج.م` : (v.code || 'House of Glass'),
            quote: fallbackDesc || v.desc || v.description || '',
            originalVariant: v
        };
    }) : [];

    const activeVariant = hasVariants ? selectedProduct.variants[activeVariantIndex] : null;
    const activeVariantImages = hasVariants ? getVariantAllImages(activeVariant) : [];

    const renderVariantsExtra = (activeIndex, setActiveIndex) => {
        const variant = selectedProduct.variants[activeIndex];
        const vPrice = Number(variant.price || selectedProduct.price || 0);
        return (
            <div className="mt-8 space-y-6">
                {/* 1. Variant Labels (Pills) */}
                <div>
                   <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">اختر الشكل / الموديل:</p>
                   <div className="flex flex-wrap gap-2">
                       {selectedProduct.variants.map((v, idx) => (
                           <button
                               key={idx}
                               onClick={() => setActiveIndex(idx)}
                               className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-2 ${
                                   activeIndex === idx 
                                   ? 'bg-brandGold text-brandBlue border-brandGold shadow-lg shadow-brandGold/25 scale-105' 
                                   : 'bg-white/5 dark:bg-neutral-800/50 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-neutral-700 hover:border-brandGold/50'
                               }`}
                           >
                               {v.name || v.label || `موديل ${idx + 1}`}
                           </button>
                       ))}
                   </div>
                </div>

                {/* 2. Sub-images of current variant */}
                {activeVariantImages.length > 1 && (
                    <div className="flex gap-3 overflow-x-auto hide-scroll pb-2 mb-4">
                        {activeVariantImages.map((imgUrl, i) => (
                            <button
                                key={i}
                                onClick={() => setSubImageIndex(i)}
                                className={`w-16 h-16 rounded-xl border-2 overflow-hidden flex-shrink-0 transition-all shadow-md ${
                                    subImageIndex === i 
                                        ? 'border-brandGold opacity-100 ring-2 ring-brandGold/30 ring-offset-2 dark:ring-offset-[#121926]' 
                                        : 'border-transparent opacity-50 hover:opacity-100 grayscale-[30%] hover:grayscale-0'
                                }`}
                            >
                                <img src={imgUrl} alt={`صورة فرعية ${i + 1}`} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}
                
                {/* 3. Price & Action */}
                <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-neutral-800/50 rounded-2xl border border-gray-100 dark:border-neutral-800">
                        <div>
                            <p className="text-xs text-gray-500 font-medium">السعر</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white">
                                {vPrice > 0 ? `${vPrice.toLocaleString()} ج.م` : 'تواصل معنا لمعرفة السعر'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-stretch gap-2">
                        <div className="flex items-center overflow-hidden rounded-xl border-2 border-brandGold/20 bg-white dark:bg-neutral-900">
                            <button type="button" onClick={decreaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-brandGold transition-colors hover:bg-brandGold/10">
                                -
                            </button>
                            <span className="min-w-12 border-x border-brandGold/15 px-3 text-center text-sm font-black text-brandBlue dark:text-white">{quantity}</span>
                            <button type="button" onClick={increaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-brandGold transition-colors hover:bg-brandGold/10">
                                +
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => addToCart(variant, quantity)}
                            className="flex-1 rounded-xl border-2 border-brandGold bg-brandGold px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-brandBlue transition-all hover:bg-white hover:text-brandBlue shadow-xl"
                        >
                            اضف للعربة
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    if (hasVariants) {
        return (
            <div key={selectedProduct.id || selectedProduct.code || selectedProduct.name} className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" dir="rtl">
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                    onClick={closeModal}
                ></div>

                <div className="relative w-full max-w-6xl max-h-[90vh] bg-white dark:bg-darkCard rounded-[2rem] shadow-2xl overflow-hidden flex flex-col transform transition-all">
                    
                    <button
                        onClick={closeModal}
                        className="absolute top-4 right-4 z-50 w-10 h-10 bg-white/20 hover:bg-white/90 text-gray-800 backdrop-blur-md rounded-full flex items-center justify-center transition-all shadow-sm border border-gray-100 dark:border-neutral-800"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>

                    <div className="w-full h-full overflow-y-auto hide-scroll flex flex-col pb-8">
                        <div className="px-8 mt-8 text-center">
                            <h2 className="text-3xl font-black text-brandBlue dark:text-white tracking-tighter">
                                {productNameParts.english ? <span dir="ltr">{productNameParts.english}</span> : null}
                                {productNameParts.english && productNameParts.arabic ? <span className="mx-2 text-brandGold">|</span> : null}
                                {productNameParts.arabic ? <span dir="rtl">{productNameParts.arabic}</span> : null}
                            </h2>
                            <p className="mt-2 text-sm text-gray-500 font-medium">استعرض الخيارات المتاحة لهذا المنتج</p>
                        </div>

                        <div className="flex-grow" dir="ltr">
                            <AnimatedTestimonials 
                                testimonials={variantsAsTestimonials} 
                                onActiveChange={handleActiveVariantChange}
                                renderExtra={(idx, setActiveIndex) => (
                                    <div dir="rtl">
                                        {renderVariantsExtra(idx, setActiveIndex)}
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div key={selectedProduct.id || selectedProduct.code || selectedProduct.name} className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" dir="rtl">
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={closeModal}
            ></div>
            
            <div className="relative w-full max-w-5xl max-h-[90vh] bg-white dark:bg-darkCard rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row transform transition-all">
                
                {/* Close button */}
                <button 
                    onClick={closeModal}
                    className="absolute top-4 right-4 z-50 w-10 h-10 bg-white/20 hover:bg-white/90 text-gray-800 backdrop-blur-md rounded-full flex items-center justify-center transition-all shadow-sm"
                >
                    <i className="fa-solid fa-xmark"></i>
                </button>

                {/* Media Section */}
                <div className="w-full md:w-3/5 bg-gray-100 dark:bg-gray-900 relative flex flex-col">
                    <div className="relative flex-grow flex items-center justify-center h-64 md:h-full p-4">
                        {currentMedia ? (
                            currentMedia.type === 'video' ? (
                                <video 
                                    src={currentMedia.url} 
                                    controls 
                                    autoPlay 
                                    loop 
                                    className="max-h-full max-w-full rounded-lg object-contain"
                                />
                            ) : (
                                <img 
                                    src={currentMedia.url || currentMedia} 
                                    alt={selectedProduct.title || selectedProduct.name}
                                    className="max-h-full max-w-full rounded-xl object-contain"
                                />
                            )
                        ) : (
                            <div className="text-gray-400">
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
                                    className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-brandGold transition-colors border border-white/10 shadow-xl"
                                >
                                    <i className="fa-solid fa-chevron-left"></i>
                                </button>
                            </>
                        )}
                    </div>
                    
                    {/* Thumbnails */}
                    {images.length > 1 && (
                        <div className="h-24 bg-gray-200 dark:bg-gray-800 p-2 flex gap-2 overflow-x-auto hide-scroll">
                            {images.map((img, idx) => (
                                <div 
                                    key={idx}
                                    onClick={() => setCurrentImageIndex(idx)}
                                    className={`flex-none w-20 h-full relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                                        idx === safeImageIndex ? 'border-brandGold opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    {img.type === 'video' ? (
                                        <div className="w-full h-full bg-black flex items-center justify-center">
                                            <i className="fa-solid fa-play text-white"></i>
                                        </div>
                                    ) : (
                                        <img src={img.url || img} className="w-full h-full object-cover" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Info Section */}
                <div className="w-full md:w-2/5 p-6 md:p-8 flex flex-col max-h-[50vh] md:max-h-full overflow-y-auto custom-scrollbar">
                    <div className="mb-2">
                        {metadata.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                                {metadata.map((item) => (
                                    <span key={item} className="inline-block px-3 py-1 bg-brandGold/10 text-brandGold rounded-full text-[11px] font-bold">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        )}
                        <h2 className="text-2xl md:text-3xl font-black text-brandBlue dark:text-slate-100 mb-2 leading-tight uppercase italic tracking-tighter">
                            {selectedProduct.title || selectedProduct.name}
                        </h2>
                        <div className="w-12 h-1 bg-brandGold rounded-full"></div>
                    </div>

                    <div className="my-6 space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                            <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm text-brandGold">
                                <i className="fa-solid fa-coins text-xl"></i>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">السعر</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-white">
                                        {currentPrice > 0 ? `${currentPrice.toLocaleString()} ج.م` : 'تواصل معنا لمعرفة السعر'}
                                </p>
                            </div>
                        </div>

                        {selectedProduct.stockStatus && (
                            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm text-white ${
                                    selectedProduct.stockStatus === 'in_stock' ? 'bg-[#0f9d58]' : 
                                    selectedProduct.stockStatus === 'low_stock' ? 'bg-[#f4b400]' : 'bg-[#dc3545]'
                                }`}>
                                    <i className={`fa-solid ${
                                        selectedProduct.stockStatus === 'in_stock' ? 'fa-check' : 
                                        selectedProduct.stockStatus === 'low_stock' ? 'fa-exclamation' : 'fa-xmark'
                                    } text-xl`}></i>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 font-medium">حالة التوفر</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                                        {selectedProduct.stockStatus === 'in_stock' ? 'متوفر' : 
                                         selectedProduct.stockStatus === 'low_stock' ? `كمية محدودة (${selectedProduct.remainingQuantity})` : 'نفدت الكمية'}
                                    </p>
                                </div>
                            </div>
                        )}
                        
                        {fallbackDesc !== '' && (
                            <div className="mt-6">
                                <h3 className="font-bold text-gray-900 dark:text-white mb-2">وصف المنتج</h3>
                                <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                                    {fallbackDesc}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-auto pt-6 border-t border-gray-100 dark:border-gray-800 space-y-3">
                        {isWholesaleCustomer && (
                            <div className="rounded-[1.4rem] border border-brandGold/25 bg-brandGold/5 p-4 dark:bg-brandGold/10">
                                <div className="mb-3 flex items-end justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Wholesale Cart | طلب جملة</p>
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">أضف كراتين الجملة في مسار منفصل عن العربة العادية.</p>
                                    </div>
                                    {wholesalePrice > 0 ? (
                                        <div className="text-left">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Wholesale</p>
                                            <p className="text-lg font-black text-brandGold">{wholesalePrice.toLocaleString()} ج.م</p>
                                        </div>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddToWholesaleCart}
                                    disabled={isOutOfStock}
                                    className="w-full rounded-xl border-2 border-brandGold/30 bg-brandGold/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-brandGold transition-all hover:bg-brandGold hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isOutOfStock ? 'غير متوفر حالياً' : 'ADD CARTON | اضف كرتونة'}
                                </button>
                            </div>
                        )}

                        <div className="rounded-[1.4rem] border border-green-500/20 bg-gray-50 p-4 dark:bg-gray-800/50">
                            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-green-600">Add To Cart | اضف للعربة</p>
                            <div className="flex items-stretch gap-2">
                                <div className="flex items-center overflow-hidden rounded-xl border-2 border-green-500/20 bg-white dark:bg-gray-900">
                                    <button type="button" onClick={decreaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-green-600 transition-colors hover:bg-green-50 dark:hover:bg-green-500/10">
                                        -
                                    </button>
                                    <span className="min-w-12 border-x border-green-500/15 px-3 text-center text-sm font-black text-brandBlue dark:text-white">{quantity}</span>
                                    <button type="button" onClick={increaseQuantity} className="flex h-12 w-10 items-center justify-center text-lg font-black text-green-600 transition-colors hover:bg-green-50 dark:hover:bg-green-500/10">
                                        +
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddToCart}
                                    disabled={isOutOfStock}
                                    className="flex-1 rounded-xl border-2 border-green-500/30 bg-green-600/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-green-600 transition-all hover:bg-green-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isOutOfStock ? 'غير متوفر حالياً' : 'ADD TO CART | اضف للعربة'}
                                </button>
                            </div>
                            {stockLimit !== null ? (
                                <p className="mt-2 text-[10px] font-bold text-gray-400">الحد الأقصى المتاح حالياً: {stockLimit}</p>
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
        </div>
    );
}