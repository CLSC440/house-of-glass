'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useGallery } from '@/contexts/GalleryContext';

export default function Header() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [user, setUser] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [expandedSections, setExpandedSections] = useState({
        categories: true,
        brands: false,
        origins: false,
        stock: true
    });
    const pathname = usePathname();
    const {
        categories,
        activeCategory,
        setActiveCategory,
        cartCount,
        openCart,
        isWholesaleCustomer,
        wholesaleCartCount,
        openWholesaleCart,
        categoryFacetEntries,
        brandFacetEntries,
        originFacetEntries,
        hideOutOfStockProducts,
        toggleCategoryFilter,
        toggleBrandFilter,
        toggleOriginFilter,
        toggleStockFilter,
        clearAllFilters,
        activeFilterChips
    } = useGallery();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (typeof window !== 'undefined') {
                setIsAdmin(sessionStorage.getItem('isAdmin') === 'true');
            }
        });
        return () => unsubscribe();
    }, []);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const closeSidebar = () => setIsSidebarOpen(false);
    const handleCategorySelect = (categoryName) => {
        setActiveCategory(categoryName);
        closeSidebar();
    };
    const toggleSection = (sectionName) => {
        setExpandedSections((currentSections) => ({
            ...currentSections,
            [sectionName]: !currentSections[sectionName]
        }));
    };
    const handleSignOut = async () => {
        await signOut(auth);
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('isAdmin');
            sessionStorage.removeItem('userRole');
        }
        closeSidebar();
    };

    return (
        <>
            <header className="bg-white/80 dark:bg-brandBlue/80 backdrop-blur-xl sticky top-0 z-50 border-b border-brandGold/20 transition-all duration-500">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 md:h-24 flex items-center justify-between">
                    <div className="flex-1 md:flex-none">
                        <button onClick={toggleSidebar} className="p-2 text-brandBlue dark:text-brandGold hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-8 md:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex-none md:flex-1 flex justify-center md:justify-start md:ml-4">
                        <Link href="/" className="flex items-center group">
                            <div className="shine-effect">
                                <img src="/logo.png" alt="Logo" className="h-24 md:h-32 w-auto transition-all group-hover:scale-105 relative z-10" />
                            </div>
                            <div className="ml-3 hidden lg:flex flex-col justify-center leading-none">
                                <span className="text-xl md:text-2xl font-bold text-brandBlue dark:text-brandGold tracking-[-0.03em] font-sans">House Of Glass</span>
                                <span className="text-[9px] md:text-[11px] font-black tracking-[0.25em] text-brandGold dark:text-slate-200 uppercase mt-1.5 opacity-90">Al Ashour Ades</span>
                            </div>
                        </Link>
                    </div>

                    <div className="flex-1 md:flex-none flex items-center justify-end space-x-3 md:space-x-6">
                        {isWholesaleCustomer && (
                            <button onClick={openWholesaleCart} className="relative p-2 text-brandGold hover:bg-brandGold/10 rounded-lg transition-colors group" aria-label="Wholesale Cart" title="Wholesale Order">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-7 md:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
                                </svg>
                                <span className={`absolute -top-1 -right-1 bg-brandGold text-brandBlue text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${wholesaleCartCount > 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`}>{wholesaleCartCount}</span>
                            </button>
                        )}

                        <button onClick={openCart} className="relative p-2 text-brandBlue dark:text-brandGold hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors group" aria-label="Cart">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-7 md:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className={`absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${cartCount > 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`}>{cartCount}</span>
                        </button>

                        <nav className="hidden md:flex items-center space-x-6">
                            <Link
                                href="/"
                                className={`text-sm font-bold px-1 py-1 border-b-2 transition-colors ${pathname === '/' ? 'text-brandBlue dark:text-white border-brandGold' : 'text-gray-500 dark:text-gray-300 border-transparent hover:text-brandGold'}`}
                            >
                                Home
                            </Link>
                            {isAdmin && (
                                <Link href="/admin" className="text-sm font-bold text-gray-500 dark:text-gray-300 hover:text-brandGold transition-colors">
                                    Admin
                                </Link>
                            )}
                        </nav>

                        {user ? (
                            <Link href="/profile" className="hidden md:flex order-last flex-shrink-0 items-center justify-between space-x-3 md:space-x-4 px-4 py-2 md:px-5 md:py-2.5 bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700 shadow-[0_12px_30px_rgba(32,41,61,0.15)] min-w-[190px] md:min-w-[220px] hover:-translate-y-0.5 transition-all">
                                <div className="google-account-avatar">{user.displayName?.charAt(0).toUpperCase() || 'U'}</div>
                                <span className="text-xs font-bold text-gray-800 dark:text-slate-200 truncate">{user.displayName || user.email || 'User'}</span>
                            </Link>
                        ) : (
                            <Link href="/login" className="hidden md:flex order-last flex-shrink-0 items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <span className="text-xs font-bold text-brandBlue dark:text-brandGold">Login</span>
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <div className={`fixed inset-0 bg-black/50 z-[60] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={closeSidebar}></div>

            <div className={`fixed top-0 left-0 w-72 h-full bg-white dark:bg-darkCard z-[70] transition-transform duration-300 shadow-2xl flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-brandBlue dark:text-brandGold italic">Filters & Categories</h2>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-gray-400">{activeFilterChips.length > 0 ? `${activeFilterChips.length} active filters` : 'Browse the catalog'}</p>
                    </div>
                    <button onClick={closeSidebar} className="text-gray-400 hover:text-brandBlue dark:hover:text-white text-xl font-bold">✕</button>
                </div>
                
                <div className="flex-grow overflow-y-auto py-4 px-4 space-y-4">
                    <button
                        type="button"
                        onClick={() => handleCategorySelect('All')}
                        className={`w-full text-left rounded-xl px-4 py-3 font-bold transition-colors ${activeCategory === 'All' && activeFilterChips.length === 0 ? 'bg-brandGold text-white' : 'bg-gray-50 text-brandBlue hover:bg-brandGold/10 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                    >
                        All Categories
                    </button>

                    <SidebarFilterSection
                        title="Categories"
                        isExpanded={expandedSections.categories}
                        onToggle={() => toggleSection('categories')}
                    >
                        {categoryFacetEntries.map((entry) => (
                            <FilterEntryButton
                                key={entry.label}
                                label={entry.label}
                                count={entry.count}
                                selected={entry.selected}
                                onClick={() => toggleCategoryFilter(entry.label)}
                            />
                        ))}
                    </SidebarFilterSection>

                    <SidebarFilterSection
                        title="Brands"
                        isExpanded={expandedSections.brands}
                        onToggle={() => toggleSection('brands')}
                    >
                        {brandFacetEntries.map((entry) => (
                            <FilterEntryButton
                                key={entry.label}
                                label={entry.label}
                                count={entry.count}
                                selected={entry.selected}
                                onClick={() => toggleBrandFilter(entry.label)}
                            />
                        ))}
                    </SidebarFilterSection>

                    <SidebarFilterSection
                        title="Origin"
                        isExpanded={expandedSections.origins}
                        onToggle={() => toggleSection('origins')}
                    >
                        {originFacetEntries.map((entry) => (
                            <FilterEntryButton
                                key={entry.label}
                                label={entry.label}
                                count={entry.count}
                                selected={entry.selected}
                                onClick={() => toggleOriginFilter(entry.label)}
                            />
                        ))}
                    </SidebarFilterSection>

                    <SidebarFilterSection
                        title="Stock"
                        isExpanded={expandedSections.stock}
                        onToggle={() => toggleSection('stock')}
                    >
                        <FilterEntryButton
                            label="In Stock Only | المتاح فقط"
                            count={categories.length > 0 ? undefined : undefined}
                            selected={hideOutOfStockProducts}
                            onClick={toggleStockFilter}
                        />
                    </SidebarFilterSection>

                    {activeFilterChips.length > 0 && (
                        <button
                            type="button"
                            onClick={clearAllFilters}
                            className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.2em] text-red-500 transition-colors hover:bg-red-500 hover:text-white dark:border-red-500/20 dark:bg-red-500/10"
                        >
                            Clear All Filters
                        </button>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    {user ? (
                        <div className="flex flex-col gap-2">
                            <Link href="/profile" onClick={closeSidebar} className="block text-center bg-brandBlue text-white py-3 rounded-xl font-bold border border-brandGold hover:bg-opacity-90">
                                My Profile
                            </Link>
                            {isAdmin && (
                                <Link href="/admin" onClick={closeSidebar} className="block text-center bg-brandGold/10 text-brandGold py-3 rounded-xl font-bold border border-brandGold/40 hover:bg-brandGold hover:text-white transition-colors">
                                    Admin Dashboard
                                </Link>
                            )}
                            <button onClick={handleSignOut} className="block w-full text-center bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 py-3 rounded-xl font-bold transition-colors">
                                Sign Out
                            </button>
                        </div>
                    ) : (
                        <Link href="/login" onClick={closeSidebar} className="block text-center bg-brandBlue text-white py-3 rounded-xl font-bold border border-brandGold hover:bg-opacity-90">
                            Login / Register
                        </Link>
                    )}
                </div>
            </div>
        </>
    );
}

function SidebarFilterSection({ title, isExpanded, onToggle, children }) {
    return (
        <section className="rounded-2xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-900/30">
            <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-1 py-1.5 text-left">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-brandGold">{title}</span>
                <i className={`fa-solid fa-chevron-down text-xs text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}></i>
            </button>
            {isExpanded && <div className="mt-2 space-y-2">{children}</div>}
        </section>
    );
}

function FilterEntryButton({ label, count, selected, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors ${selected ? 'bg-brandGold text-white' : 'bg-[#1f2b42] text-gray-200 hover:bg-brandGold/15 dark:bg-[#243047]'}`}
        >
            <span className="truncate text-sm font-medium">{label}</span>
            {typeof count === 'number' ? (
                <span className={`ml-3 rounded-full px-2 py-0.5 text-[10px] font-black ${selected ? 'bg-white/15 text-white' : 'bg-white/10 text-brandGold'}`}>{count}</span>
            ) : null}
        </button>
    );
}