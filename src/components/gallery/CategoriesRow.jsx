'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGallery } from '@/contexts/GalleryContext';

const CATEGORY_PREVIEW_TILE_CLASSES = [
    'left-3 top-3 h-16 w-16 -rotate-6 md:left-4 md:top-4 md:h-20 md:w-20',
    'right-4 top-4 h-20 w-20 rotate-6 md:right-5 md:top-5 md:h-24 md:w-24',
    'left-10 bottom-8 h-18 w-18 rotate-[7deg] md:left-12 md:bottom-10 md:h-24 md:w-24',
    'right-8 bottom-5 h-16 w-16 -rotate-[8deg] md:right-10 md:bottom-6 md:h-20 md:w-20'
];

function getProductPreviewImage(product) {
    if (product?.image) return product.image;

    if (Array.isArray(product?.images) && product.images.length > 0) {
        const firstImage = product.images[0];
        return firstImage?.url || firstImage?.primaryUrl || firstImage;
    }

    if (Array.isArray(product?.variants) && product.variants.length > 0) {
        const variantWithImage = product.variants.find((variant) => variant?.image || (Array.isArray(variant?.images) && variant.images.length > 0));
        if (variantWithImage?.image) return variantWithImage.image;
        if (Array.isArray(variantWithImage?.images) && variantWithImage.images.length > 0) {
            const firstVariantImage = variantWithImage.images[0];
            return firstVariantImage?.url || firstVariantImage?.primaryUrl || firstVariantImage;
        }
    }

    return '';
}

function hashString(value) {
    return Array.from(String(value || '')).reduce((hash, character) => {
        return ((hash << 5) - hash + character.charCodeAt(0)) >>> 0;
    }, 0);
}

function pickCategoryPreviewImages(products, seed, count = 4) {
    const uniqueImages = Array.from(
        new Set(
            (products || [])
                .map((product) => getProductPreviewImage(product))
                .filter(Boolean)
        )
    );

    if (uniqueImages.length <= count) {
        return uniqueImages;
    }

    return [...uniqueImages]
        .sort((left, right) => hashString(`${seed}-${left}`) - hashString(`${seed}-${right}`))
        .slice(0, count);
}

function pickMixedPreviewImages(productsByCategory, seed, count = 4) {
    const categories = Object.keys(productsByCategory);
    const shuffledCategories = [...categories].sort((left, right) => hashString(`${seed}-cat-${left}`) - hashString(`${seed}-cat-${right}`));
    
    const mixedImages = [];
    
    for (const catName of shuffledCategories) {
        if (mixedImages.length >= count) break;
        const catProducts = productsByCategory[catName] || [];
        
        const uniqueCatImages = Array.from(
            new Set(catProducts.map((p) => getProductPreviewImage(p)).filter(Boolean))
        );
        
        if (uniqueCatImages.length > 0) {
            const sortedCatImages = [...uniqueCatImages].sort((left, right) => hashString(`${seed}-img-${left}`) - hashString(`${seed}-img-${right}`));
            mixedImages.push(sortedCatImages[0]);
        }
    }
    
    return mixedImages;
}

export default function CategoriesRow() {
    const { categories, allProducts, isLoading, activeCategory, setActiveCategory, selectedCategories } = useGallery();
    const containerRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [randomSeed, setRandomSeed] = useState(1);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setRandomSeed(Math.random());
        }, 10);
        return () => clearTimeout(timeoutId);
    }, []);

    const categoryItems = useMemo(() => [{ id: 'all', name: 'All' }, ...categories], [categories]);
    const categoryPreviewImages = useMemo(() => {
        const productsByCategory = allProducts.reduce((accumulator, product) => {
            const categoryName = String(product?.category || '').trim() || 'Uncategorized';
            if (!accumulator[categoryName]) {
                accumulator[categoryName] = [];
            }
            accumulator[categoryName].push(product);
            return accumulator;
        }, {});

        return categoryItems.reduce((accumulator, categoryItem) => {
            if (categoryItem.name === 'All') {
                accumulator[categoryItem.name] = pickMixedPreviewImages(productsByCategory, randomSeed);
            } else {
                const sourceProducts = productsByCategory[categoryItem.name] || [];
                accumulator[categoryItem.name] = pickCategoryPreviewImages(sourceProducts, categoryItem.name);
            }
            return accumulator;
        }, {});
    }, [allProducts, categoryItems, randomSeed]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateScrollState = () => {
            setCanScrollLeft(container.scrollLeft > 10);
            setCanScrollRight(container.scrollLeft + container.clientWidth < container.scrollWidth - 10);
        };

        updateScrollState();
        container.addEventListener('scroll', updateScrollState, { passive: true });
        window.addEventListener('resize', updateScrollState);

        return () => {
            container.removeEventListener('scroll', updateScrollState);
            window.removeEventListener('resize', updateScrollState);
        };
    }, [categoryItems.length]);

    const scrollCategories = (direction) => {
        const container = containerRef.current;
        if (!container) return;
        container.scrollBy({ left: direction * 320, behavior: 'smooth' });
    };

    if (isLoading) {
        return (
            <div className="relative mb-8 md:mb-12">
                <div className="flex overflow-x-auto gap-4 md:gap-6 hide-scroll pb-4 -mx-4 px-4 md:mx-0 md:px-0">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex-none w-48 md:w-64 h-32 md:h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 to-transparent"></div>
                            <div className="absolute bottom-4 left-4 right-4 h-6 bg-white/20 rounded"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (categoryItems.length === 0) return null;

    return (
        <div className="relative mb-8 md:mb-12 category-row-wrapper group/catrow">
            <button
                type="button"
                onClick={() => scrollCategories(-1)}
                className={`scroll-arrow scroll-arrow-left ${!canScrollLeft ? 'is-hidden' : ''}`}
                aria-label="Scroll categories left"
            >
                <i className="fa-solid fa-chevron-left"></i>
            </button>
            <button
                type="button"
                onClick={() => scrollCategories(1)}
                className={`scroll-arrow scroll-arrow-right ${!canScrollRight ? 'is-hidden' : ''}`}
                aria-label="Scroll categories right"
            >
                <i className="fa-solid fa-chevron-right"></i>
            </button>

            <div ref={containerRef} className="flex overflow-x-auto gap-4 md:gap-6 pb-4 -mx-4 px-4 md:mx-0 md:px-0 category-row-container">
                {categoryItems.map((cat) => {
                    const isActive = cat.name === 'All'
                        ? selectedCategories.length === 0 && activeCategory === 'All'
                        : activeCategory === cat.name || selectedCategories.includes(cat.name);
                    const previewImages = categoryPreviewImages[cat.name] || [];

                    return (
                        <button 
                            key={cat.id} 
                            onClick={() => setActiveCategory(cat.name)}
                            className={`category-card group/category flex-none w-48 md:w-64 h-32 md:h-40 rounded-2xl border relative overflow-hidden text-left transition-all duration-500 ease-out ${isActive ? 'z-10 scale-[1.04] border-brandGold shadow-[0_22px_58px_rgba(212,175,55,0.2)]' : 'border-gray-200 dark:border-gray-700 shadow-[0_14px_34px_rgba(15,23,42,0.1)] hover:-translate-y-2 hover:scale-[1.02] hover:border-brandGold/60 hover:shadow-[0_24px_60px_rgba(212,175,55,0.22)] dark:hover:shadow-[0_24px_60px_rgba(2,6,23,0.35)]'}`}
                        >
                            {previewImages.length > 0 ? (
                                <div className="absolute inset-0 overflow-hidden">
                                    {previewImages.map((imageUrl, index) => (
                                        <div
                                            key={`${cat.id}-${imageUrl}-${index}`}
                                            className={`absolute overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-[0_14px_34px_rgba(15,23,42,0.22)] transition-transform duration-500 group-hover/category:scale-105 ${CATEGORY_PREVIEW_TILE_CLASSES[index % CATEGORY_PREVIEW_TILE_CLASSES.length]}`}
                                        >
                                            <img
                                                src={imageUrl}
                                                alt=""
                                                aria-hidden="true"
                                                className="h-full w-full object-cover opacity-90 transition-transform duration-700 group-hover/category:scale-110"
                                                loading="lazy"
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#121926]/70 to-[#121926]/5 dark:from-black/90 dark:to-black/20 backdrop-blur-[2px] dark:backdrop-blur-none"></div>
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.05),rgba(15,23,42,0.5))] dark:bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.05),rgba(15,23,42,0.88))]"></div>
                            <div className={`absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_50%)] transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-70 group-hover/category:opacity-100'}`}></div>
                            <div className={`absolute -right-6 -top-8 h-24 w-24 rounded-full bg-brandGold/25 blur-2xl transition-all duration-500 ${isActive ? 'opacity-90' : 'opacity-0 group-hover/category:opacity-100 group-hover/category:scale-110'}`}></div>
                            <div className="absolute inset-0 flex flex-col justify-end p-4 md:p-5">
                                <h3 className={`font-black text-lg md:text-xl transition-all duration-500 ${isActive ? 'text-brandGold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] dark:drop-shadow-none' : 'text-slate-900 dark:text-white group-hover/category:-translate-y-1 group-hover/category:text-brandGold'}`}>
                                    {cat.name}
                                </h3>
                                <div className={`mt-2 h-1 rounded-full bg-brandGold transition-all duration-500 shadow-[0_1px_2px_rgba(0,0,0,0.1)] dark:shadow-none ${isActive ? 'w-8' : 'w-0 group-hover/category:w-10'}`}></div>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    );
}