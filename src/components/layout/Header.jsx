'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useGallery } from '@/contexts/GalleryContext';
import { getUserRoleLabel, isAdminRole, normalizeUserRole, USER_ROLE_VALUES } from '@/lib/user-roles';
import NotificationsCenter from '@/components/layout/NotificationsCenter';

export default function Header() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [user, setUser] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isAdminRedirecting, setIsAdminRedirecting] = useState(false);
    const [accountPanelOpen, setAccountPanelOpen] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
    const [expandedSections, setExpandedSections] = useState({
        categories: false,
        brands: false,
        origins: false,
        stock: false
    });
    const [expandedCategoryGroups, setExpandedCategoryGroups] = useState({});
    const pathname = usePathname();
    const router = useRouter();
    const {
        categories,
        activeCategory,
        setActiveCategory,
        filteredProducts,
        selectedProduct,
        userRole,
        getProductStockLimit,
        getProductStockStatus,
        cartCount,
        openCart,
        isWholesaleCustomer,
        wholesaleCartCount,
        openWholesaleCart,
        categoryFacetGroups,
        brandFacetEntries,
        originFacetEntries,
        ungroupedCategoryFacetEntries,
        hideOutOfStockProducts,
        toggleCategoryFilter,
        toggleCategoryGroupFilter,
        toggleBrandFilter,
        toggleOriginFilter,
        toggleStockFilter,
        clearAllFilters,
        activeFilterChips
    } = useGallery();

    useEffect(() => {
        let unsubscribeProfile = null;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (unsubscribeProfile) {
                unsubscribeProfile();
                unsubscribeProfile = null;
            }

            if (currentUser) {
                unsubscribeProfile = onSnapshot(doc(db, 'users', currentUser.uid), (userSnap) => {
                    if (!userSnap.exists()) {
                        setUserProfile(null);
                        setIsAdmin(false);
                        return;
                    }

                    const profileData = userSnap.data();
                    const normalizedRole = normalizeUserRole(profileData?.role);

                    setUserProfile(profileData);
                    setIsAdmin(isAdminRole(normalizedRole));

                    if (typeof window !== 'undefined') {
                        sessionStorage.setItem('userRole', normalizedRole || '');
                        sessionStorage.setItem('isAdmin', isAdminRole(normalizedRole) ? 'true' : 'false');
                    }
                }, (error) => {
                    console.error('Error fetching header user profile:', error);
                    setUserProfile(null);
                    setIsAdmin(false);
                });
            } else {
                setUserProfile(null);
                setIsAdmin(false);
                setAccountPanelOpen(false);

                if (typeof window !== 'undefined') {
                    sessionStorage.removeItem('userRole');
                    sessionStorage.removeItem('isAdmin');
                }
            }
        });
        return () => {
            if (unsubscribeProfile) {
                unsubscribeProfile();
            }
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        setAccountPanelOpen(false);
    }, [pathname]);

    useEffect(() => {
        setAvatarLoadFailed(false);
    }, [user?.photoURL, userProfile?.photoURL]);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const closeSidebar = () => setIsSidebarOpen(false);
    const toggleAccountPanel = () => setAccountPanelOpen((currentValue) => !currentValue);
    const closeAccountPanel = () => setAccountPanelOpen(false);
    const handleCategorySelect = (categoryName) => {
        setActiveCategory(categoryName);
        closeSidebar();
    };
    const showFavoritesShortcut = user && categories.includes('My Favorites');
    const stockOrderType = normalizeUserRole(userRole) === USER_ROLE_VALUES.CST_WHOLESALE ? 'wholesale' : 'retail';
    const inStockOnlyCount = filteredProducts.filter((product) => {
        if (getProductStockStatus(product, stockOrderType) === 'out_of_stock') {
            return false;
        }

        const stockLimit = getProductStockLimit(product, stockOrderType);
        return stockLimit === null ? true : stockLimit > 0;
    }).length;
    const toggleSection = (sectionName) => {
        setExpandedSections((currentSections) => ({
            ...currentSections,
            [sectionName]: !currentSections[sectionName]
        }));
    };
    const toggleCategoryGroup = (groupId) => {
        setExpandedCategoryGroups((currentState) => ({
            ...currentState,
            [groupId]: !currentState[groupId]
        }));
    };
    const handleSignOut = async () => {
        await signOut(auth);
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('isAdmin');
            sessionStorage.removeItem('userRole');
        }
        closeAccountPanel();
        closeSidebar();
    };

    const navigateToAdminDashboard = () => {
        if (isAdminRedirecting) {
            return;
        }

        setIsAdminRedirecting(true);
        closeAccountPanel();
        closeSidebar();

        if (typeof window !== 'undefined') {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.location.assign('/admin');
                });
            });
            return;
        }

        router.push('/admin');
    };

    const getDisplayRole = () => {
        return getUserRoleLabel(userProfile?.displayRole || userProfile?.role).toUpperCase();
    };

    const getFirstName = () => {
        const source = userProfile?.firstName || userProfile?.name || user?.displayName || user?.email || 'there';
        return String(source).trim().split(/\s+/)[0] || 'there';
    };

    const getAvatarLabel = () => {
        const source = userProfile?.name || user?.displayName || user?.email || 'U';
        return String(source).trim().charAt(0).toUpperCase() || 'U';
    };

    const profilePhotoUrl = userProfile?.photoURL || user?.photoURL || '';
    const shouldShowProfilePhoto = Boolean(profilePhotoUrl) && !avatarLoadFailed;

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
                                <button
                                    type="button"
                                    onClick={navigateToAdminDashboard}
                                    disabled={isAdminRedirecting}
                                    className="text-sm font-bold text-gray-500 dark:text-gray-300 hover:text-brandGold transition-colors disabled:cursor-wait disabled:text-brandGold"
                                >
                                    {isAdminRedirecting ? 'Loading Admin...' : 'Admin'}
                                </button>
                            )}
                        </nav>

                        <NotificationsCenter user={user} isAccountPanelOpen={accountPanelOpen} onBeforeOpen={closeAccountPanel} isProductModalOpen={Boolean(selectedProduct)} />

                        {user ? (
                            <button
                                type="button"
                                onClick={toggleAccountPanel}
                                className="google-account-pill order-last flex-shrink-0"
                                aria-label="Open account panel"
                            >
                                {shouldShowProfilePhoto ? (
                                    <img src={profilePhotoUrl} alt={user.displayName || user.email || 'User'} className="google-account-avatar h-full w-full object-cover" onError={() => setAvatarLoadFailed(true)} />
                                ) : (
                                    <DefaultAccountAvatar label={getAvatarLabel()} compact />
                                )}
                            </button>
                        ) : (
                            <Link href="/login" className="flex order-last flex-shrink-0 items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <span className="text-xs font-bold text-brandBlue dark:text-brandGold">Login</span>
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {user && accountPanelOpen && (
                <>
                    <div className="fixed inset-0 z-[160] bg-black/10" onClick={closeAccountPanel}></div>
                    <div className="fixed right-3 top-24 z-[165] w-[calc(100vw-1.5rem)] max-w-sm overflow-hidden rounded-[2rem] border border-brandGold/20 bg-[#171f36]/95 shadow-[0_30px_70px_rgba(5,10,23,0.52)] backdrop-blur-xl md:right-8" id="accountPanel">
                        <div className="max-h-[80vh] overflow-y-auto custom-scroll">
                            <div className="border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent px-6 pb-5 pt-6">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="truncate text-sm font-semibold text-slate-300">{userProfile?.email || user?.email || ''}</p>
                                    <button type="button" onClick={closeAccountPanel} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-slate-300 transition-colors hover:bg-white/15 hover:text-white">
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                </div>

                                <div className="mt-6 flex flex-col items-center text-center">
                                    <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-[#0c1120] shadow-[0_0_0_6px_rgba(255,255,255,0.08)]">
                                        {shouldShowProfilePhoto ? (
                                            <img src={profilePhotoUrl} alt={user.displayName || user.email || 'User'} className="h-full w-full rounded-full object-cover" onError={() => setAvatarLoadFailed(true)} />
                                        ) : (
                                            <DefaultAccountAvatar label={getAvatarLabel()} large />
                                        )}
                                    </div>
                                    <p className="mt-5 text-[2.2rem] font-medium leading-none text-white">Hi, {getFirstName()}!</p>
                                    <p className="mt-2 text-xs font-black uppercase tracking-[0.28em] text-brandGold">{getDisplayRole()}</p>
                                    {isAdmin && (
                                        <button type="button" onClick={navigateToAdminDashboard} disabled={isAdminRedirecting} className="mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-brandGold/35 bg-brandGold/10 px-6 py-3 text-sm font-black text-brandGold transition-all hover:border-brandGold/55 hover:bg-brandGold/16 disabled:cursor-wait disabled:opacity-80">
                                            {isAdminRedirecting ? (
                                                <>
                                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-brandGold/35 border-t-brandGold"></span>
                                                    <span>Loading Dashboard...</span>
                                                </>
                                            ) : (
                                                'Admin Dashboard'
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3 bg-gradient-to-b from-white/[0.04] via-white/[0.02] to-black/10 p-5">
                                <AccountPanelLink
                                    href="/profile#order-history"
                                    title="Retail History"
                                    subtitle="Your recent retail orders"
                                    onClick={closeAccountPanel}
                                />
                                {(isWholesaleCustomer || normalizeUserRole(userProfile?.role) !== USER_ROLE_VALUES.CST_RETAIL) && (
                                    <AccountPanelLink
                                        href="/profile#order-history"
                                        title="Wholesale History"
                                        subtitle="Previous wholesale orders"
                                        onClick={closeAccountPanel}
                                    />
                                )}
                                <AccountPanelLink
                                    href="/profile#profile-settings"
                                    title="Settings"
                                    subtitle="Profile, phone and password"
                                    onClick={closeAccountPanel}
                                />
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    className="flex w-full items-center justify-between rounded-[1.6rem] border border-white/10 bg-red-500/10 px-5 py-4 text-left transition-all hover:border-red-400/40 hover:bg-red-500/15"
                                >
                                    <span>
                                        <span className="block text-sm font-black text-red-400">Sign out</span>
                                        <span className="block text-[10px] uppercase tracking-[0.24em] text-slate-400">End current session</span>
                                    </span>
                                    <span className="text-red-400">→</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {isAdminRedirecting && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#060b17]/72 backdrop-blur-sm">
                    <div className="flex min-w-[220px] flex-col items-center rounded-[1.8rem] border border-brandGold/20 bg-[#171f36]/95 px-8 py-7 shadow-[0_24px_60px_rgba(5,10,23,0.5)]">
                        <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-brandGold/25 border-t-brandGold"></span>
                        <p className="mt-4 text-sm font-black uppercase tracking-[0.24em] text-brandGold">Loading Admin</p>
                        <p className="mt-2 text-center text-xs text-slate-300">Preparing dashboard and redirecting...</p>
                    </div>
                </div>
            )}

            <div className={`fixed inset-0 bg-black/50 z-[60] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={closeSidebar}></div>

            <div className={`fixed top-0 left-0 w-72 h-full bg-white dark:bg-darkCard z-[70] transition-transform duration-300 shadow-2xl flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-brandBlue dark:text-brandGold italic">Filters & Categories</h2>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-gray-400">{activeFilterChips.length > 0 ? `${activeFilterChips.length} active filters` : 'Browse the catalog'}</p>
                    </div>
                    <button onClick={closeSidebar} className="text-gray-400 hover:text-brandBlue dark:hover:text-white text-xl font-bold">✕</button>
                </div>
                
                <div className="flex-grow overflow-y-auto px-3 py-4 space-y-3">
                    {showFavoritesShortcut ? (
                        <button
                            type="button"
                            onClick={() => handleCategorySelect('My Favorites')}
                            className={`mx-0 w-full rounded-2xl border px-5 py-4 text-left text-sm font-bold transition-all ${activeCategory === 'My Favorites' ? 'border-brandGold/30 bg-brandGold/10 text-brandGold shadow-sm' : 'border-gray-200/70 bg-white/80 text-gray-600 hover:bg-gray-50 dark:border-gray-700/80 dark:bg-gray-900/50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
                        >
                            <span className="flex items-center gap-3">
                                <svg className="h-5 w-5 shrink-0 fill-current" viewBox="0 0 24 24">
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                </svg>
                                <span>My Favorites</span>
                            </span>
                        </button>
                    ) : null}

                    <SidebarFilterSection
                        title="Categories | التصنيفات"
                        eyebrow="Browse | تصفح"
                        iconPath="M4 7h16M4 12h16M4 17h10"
                        isExpanded={expandedSections.categories}
                        onToggle={() => toggleSection('categories')}
                    >
                        {categoryFacetGroups.map((groupEntry) => (
                            <FilterEntryGroup
                                key={groupEntry.id}
                                label={groupEntry.label}
                                count={groupEntry.count}
                                selected={groupEntry.selected}
                                explicitSelected={groupEntry.selected}
                                partiallySelected={!groupEntry.selected && groupEntry.hasSelectedEntry}
                                allSelected={groupEntry.allSelected}
                                expanded={expandedCategoryGroups[groupEntry.id] ?? (groupEntry.selected || groupEntry.hasSelectedEntry)}
                                onSelect={() => toggleCategoryGroupFilter(groupEntry.id)}
                                onToggle={() => toggleCategoryGroup(groupEntry.id)}
                            >
                                {groupEntry.entries.map((entry) => (
                                    <FilterEntryButton
                                        key={entry.label}
                                        label={entry.label}
                                        count={entry.count}
                                        selected={entry.selected}
                                        onClick={() => toggleCategoryFilter(entry.label)}
                                        compact
                                    />
                                ))}
                            </FilterEntryGroup>
                        ))}
                        {ungroupedCategoryFacetEntries.map((entry) => (
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
                        title="Brands | الماركات"
                        eyebrow="Filter | فلترة"
                        iconPath="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82zM7 7h.01"
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
                        title="Origin | المنشأ"
                        eyebrow="Filter | فلترة"
                        iconPath="M12 2a10 10 0 100 20 10 10 0 000-20zm0 0c2.5 2.7 4 6.3 4 10s-1.5 7.3-4 10m0-20C9.5 4.7 8 8.3 8 12s1.5 7.3 4 10m-9-10h18M4.9 7h14.2M4.9 17h14.2"
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
                        title="Availability | التوفر"
                        eyebrow="Filter | فلترة"
                        iconPath="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l4.16 2.38M21 16V8M3.27 6.96 12 12l8.73-5.04M12 22V12M15.5 21a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zm-1.15-3.35 1.05 1.05 1.8-2.05"
                        isExpanded={expandedSections.stock}
                        onToggle={() => toggleSection('stock')}
                    >
                        <FilterEntryButton
                            label="In Stock Only | المتاح فقط"
                            count={inStockOnlyCount}
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
                                <button type="button" onClick={navigateToAdminDashboard} disabled={isAdminRedirecting} className="block w-full text-center bg-brandGold/10 text-brandGold py-3 rounded-xl font-bold border border-brandGold/40 hover:bg-brandGold hover:text-white transition-colors disabled:cursor-wait disabled:opacity-80">
                                    {isAdminRedirecting ? 'Loading Dashboard...' : 'Admin Dashboard'}
                                </button>
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

function AccountPanelLink({ href, title, subtitle, onClick }) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className="flex w-full items-center justify-between rounded-[1.6rem] border border-white/10 bg-white/[0.05] px-5 py-4 text-left transition-all hover:border-brandGold/30 hover:bg-white/[0.08]"
        >
            <span>
                <span className="block text-sm font-black text-white">{title}</span>
                <span className="block text-[10px] uppercase tracking-[0.24em] text-slate-400">{subtitle}</span>
            </span>
            <span className="text-brandGold">→</span>
        </Link>
    );
}

function SidebarFilterSection({ title, eyebrow, iconPath, isExpanded, onToggle, children }) {
    return (
        <section className="overflow-hidden rounded-[26px] border border-gray-200/80 bg-white/80 shadow-sm backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/50">
            <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/80">
                <span className="flex min-w-0 items-center gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brandGold/10 text-brandGold">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                        </svg>
                    </span>
                    <span className="min-w-0">
                        <span className="block text-[10px] font-black uppercase tracking-[0.3em] text-brandGold/80">{eyebrow}</span>
                        <span className="block text-sm font-black text-brandBlue dark:text-white">{title}</span>
                    </span>
                </span>
                <svg className={`h-5 w-5 shrink-0 text-brandGold transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isExpanded && <div className="px-2 pb-2"><div className="space-y-1.5">{children}</div></div>}
        </section>
    );
}

function FilterEntryButton({ label, count, selected, onClick, compact = false }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center justify-between gap-3 rounded-2xl text-left text-sm font-bold transition-all ${compact ? 'px-3 py-3' : 'px-4 py-3.5'} ${selected ? 'border border-brandGold/30 bg-brandGold/10 text-brandGold shadow-sm' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
        >
            <span className="flex min-w-0 items-center gap-3">
                {selected ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brandGold text-[10px] font-black text-brandBlue">✓</span>
                ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 dark:border-gray-600"></span>
                )}
                <span className="truncate">{label}</span>
            </span>
            {typeof count === 'number' ? (
                <span className={`shrink-0 text-[11px] font-black ${selected ? 'text-brandGold' : 'text-gray-400 dark:text-gray-500'}`}>({count})</span>
            ) : null}
        </button>
    );
}

function FilterEntryGroup({ label, count, selected, explicitSelected, partiallySelected, allSelected, expanded, onSelect, onToggle, children }) {
    return (
        <div className="rounded-2xl border border-gray-200/70 bg-gray-50/60 p-1 dark:border-gray-700/80 dark:bg-gray-900/40">
            <button
                type="button"
                onClick={onSelect}
                className={`flex w-full items-center justify-between gap-3 rounded-[1rem] px-3 py-3 text-left transition-all ${selected ? 'bg-brandGold/10 text-brandGold' : partiallySelected ? 'text-brandGold hover:bg-white/80 dark:text-brandGold dark:hover:bg-gray-800/70' : 'text-brandBlue hover:bg-white/80 dark:text-white dark:hover:bg-gray-800/70'}`}
            >
                <span className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-brandGold bg-brandGold text-brandBlue' : partiallySelected ? 'border-brandGold text-brandGold' : 'border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}`}>
                        <i className={`fa-solid text-[9px] ${explicitSelected || allSelected ? 'fa-check' : partiallySelected ? 'fa-minus' : 'fa-plus'}`}></i>
                    </span>
                    <span className="truncate text-sm font-black">{label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                    {typeof count === 'number' ? (
                        <span className={`text-[11px] font-black ${selected || partiallySelected ? 'text-brandGold' : 'text-gray-400 dark:text-gray-500'}`}>({count})</span>
                    ) : null}
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onToggle();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                onToggle();
                            }
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5"
                        aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
                    >
                        <svg className={`h-4 w-4 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </span>
                </span>
            </button>
            {expanded ? <div className="space-y-1.5 px-2 pb-2">{children}</div> : null}
        </div>
    );
}

function DefaultAccountAvatar({ label, compact = false, large = false }) {
    const sizeClassName = large ? 'h-24 w-24 text-3xl' : compact ? 'h-full w-full text-sm' : 'h-full w-full text-base';

    return (
        <div className={`google-account-avatar relative overflow-hidden border border-brandGold/30 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.16),transparent_34%),linear-gradient(180deg,#151b2d_0%,#090d18_100%)] text-brandGold shadow-[0_12px_28px_rgba(0,0,0,0.35)] ${sizeClassName}`}>
            <svg className="absolute inset-0 h-full w-full text-brandGold/75" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="24" r="12" fill="currentColor" opacity="0.88" />
                <path d="M14 56c1.8-10.5 9.48-16 18-16s16.2 5.5 18 16" fill="currentColor" opacity="0.88" />
            </svg>
            <span className="absolute left-1/2 top-[37%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[0.78em] font-black uppercase leading-none text-[#0c1120]">
                {label}
            </span>
        </div>
    );
}