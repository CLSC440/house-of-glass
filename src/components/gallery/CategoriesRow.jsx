'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGallery } from '@/contexts/GalleryContext';

export default function CategoriesRow() {
    const { categories, isLoading, activeCategory, setActiveCategory, selectedCategories } = useGallery();
    const containerRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const categoryItems = useMemo(() => [{ id: 'all', name: 'All' }, ...categories], [categories]);

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
                    return (
                        <button 
                            key={cat.id} 
                            onClick={() => setActiveCategory(cat.name)}
                            className={`category-card flex-none w-48 md:w-64 h-32 md:h-40 rounded-2xl border transition-all duration-300 relative overflow-hidden text-left ${isActive ? 'border-brandGold shadow-lg scale-105 z-10' : 'border-gray-200 dark:border-gray-700 shadow-sm hover:border-brandGold/50'}`}
                        >
                            <div className="absolute inset-0 bg-gradient-to-t from-[#121926]/90 to-[#121926]/10 dark:from-black/90 dark:to-black/20"></div>
                            <div className="absolute inset-0 flex flex-col justify-end p-4 md:p-5">
                                <h3 className={`font-black text-lg md:text-xl transition-colors ${isActive ? 'text-brandGold' : 'text-white'}`}>
                                    {cat.name}
                                </h3>
                                {isActive && (
                                    <div className="w-8 h-1 bg-brandGold rounded-full mt-2"></div>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    );
}