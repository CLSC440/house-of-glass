'use client';
import { useEffect, useRef, useState } from 'react';
import { useGallery } from '@/contexts/GalleryContext';

export default function SearchFilter() {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    
    const {
        searchQuery,
        setSearchQuery,
        activeCategory,
        setActiveCategory,
        categories,
        activeFilterChips,
        hideOutOfStockProducts,
        toggleStockFilter,
        removeFilterChip,
        clearAllFilters,
        primaryFilterDisplayLabel,
        selectedCategories,
        showToast
    } = useGallery();

    const toggleCatDropdown = () => setIsDropdownOpen(!isDropdownOpen);

    const handleCategorySelect = (catName) => {
        setActiveCategory(catName);
        setIsDropdownOpen(false);
    };

    const handleShareFilters = async () => {
        if (typeof window === 'undefined') return;

        const shareUrl = window.location.href;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'House Of Glass Filters',
                    text: 'Check this filtered catalog view.',
                    url: shareUrl
                });
                return;
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                showToast('Filter link copied successfully.');
                return;
            }

            window.prompt('Copy this filter link:', shareUrl);
        } catch (error) {
            if (error?.name === 'AbortError') {
                return;
            }

            console.error('Failed to share filters:', error);
            showToast('Unable to share this filter right now.', 'error');
        }
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative z-20 mx-auto -mt-8 w-full max-w-7xl isolate px-4 md:-mt-10">
            <div className="relative z-30 flex flex-col space-y-4 overflow-visible rounded-2xl border border-brandGold/20 bg-white p-4 shadow-[0_20px_40px_rgba(0,0,0,0.06)] backdrop-blur-2xl dark:bg-darkCard/90 md:flex-row md:space-x-6 md:space-y-0 md:p-6">
                <div className="flex-grow relative">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6 absolute left-4 top-1/2 min-w-[20px] -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name or category..." 
                        className="w-full pl-11 md:pl-12 pr-4 py-3 md:py-4 rounded-xl bg-gray-100/50 dark:bg-gray-800/50 dark:text-slate-200 border-none focus:ring-2 focus:ring-brandGold outline-none transition-all text-sm md:text-base ltr:text-left rtl:text-right" 
                    />
                </div>

                <div ref={dropdownRef} className={`relative z-40 group/cat ${isDropdownOpen ? 'md:z-[90]' : ''}`}>
                    <button onClick={toggleCatDropdown} className="w-full h-full min-w-[160px] flex items-center justify-between px-5 md:px-6 bg-brandGold/5 text-brandGold rounded-xl font-bold py-3 md:py-4 hover:bg-brandGold/10 transition-all text-sm md:text-base border border-brandGold/10">
                        <span>{selectedCategories.length > 0 || activeCategory !== 'All' ? primaryFilterDisplayLabel : `Category: ${activeCategory}`}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ml-2 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    
                    {isDropdownOpen && (
                        <div className="custom-scroll absolute right-0 top-full z-[100] mt-2 max-h-60 w-full min-w-[200px] overflow-y-auto rounded-xl border border-gray-100 bg-white py-2 shadow-2xl dark:border-gray-700 dark:bg-darkCard">
                            <button 
                                onClick={() => handleCategorySelect('All')}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-bold text-brandBlue dark:text-gray-200"
                            >
                                All Categories
                            </button>
                            {categories.map((cat) => (
                                <button 
                                    key={cat.id}
                                    onClick={() => handleCategorySelect(cat.name)}
                                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {activeFilterChips.length > 0 && (
                <div className="relative z-10 mt-4 rounded-2xl border border-brandGold/10 bg-white/80 p-4 shadow-[0_20px_40px_rgba(0,0,0,0.04)] backdrop-blur-2xl dark:bg-darkCard/80">
                    <div className="flex flex-wrap items-center gap-2">
                        {activeFilterChips.map((chip) => (
                            <button
                                key={`${chip.type}-${chip.value}`}
                                type="button"
                                onClick={() => removeFilterChip(chip.type, chip.value)}
                                className="inline-flex items-center gap-2 rounded-full border border-brandGold/20 bg-brandGold/5 px-3 py-2 text-xs font-black tracking-[0.08em] text-brandBlue transition-colors hover:bg-brandGold hover:text-white dark:text-white"
                            >
                                <span>{chip.label}</span>
                                <i className="fa-solid fa-xmark text-[10px]"></i>
                            </button>
                        ))}

                        <div className="ml-auto flex items-center gap-3">
                            <button
                                type="button"
                                onClick={toggleStockFilter}
                                aria-pressed={hideOutOfStockProducts}
                                className={`inline-flex items-center gap-3 rounded-full border px-3 py-2 transition-colors ${hideOutOfStockProducts ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-brandGold/15 bg-brandGold/5 text-slate-300 hover:border-brandGold/30 hover:text-brandGold'}`}
                            >
                                <span className="text-[11px] font-black uppercase tracking-[0.16em]">In Stock Only</span>
                                <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hideOutOfStockProducts ? 'bg-emerald-500/70' : 'bg-slate-600/70'}`}>
                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${hideOutOfStockProducts ? 'translate-x-5' : 'translate-x-1'}`}></span>
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={clearAllFilters}
                                className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-red-500 transition-colors hover:bg-red-500 hover:text-white dark:border-red-500/20 dark:bg-red-500/10"
                            >
                                Clear All
                            </button>

                            <button
                                type="button"
                                onClick={handleShareFilters}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-brandGold/15 bg-brandGold/5 text-brandGold transition-colors hover:border-brandGold/35 hover:bg-brandGold hover:text-brandBlue"
                                aria-label="Share current filters"
                                title="Share current filters"
                            >
                                <i className="fa-solid fa-share-nodes text-sm"></i>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}