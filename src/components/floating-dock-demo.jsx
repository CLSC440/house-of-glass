'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FloatingDock } from '@/components/ui/floating-dock';
import { auth, db } from '@/lib/firebase';
import { DEFAULT_SITE_SETTINGS, normalizeSiteSettings, useSiteSettings } from '@/lib/use-site-settings';
import { normalizeUserRole, USER_ROLE_VALUES } from '@/lib/user-roles';
import { signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import {
    IconAdjustmentsCog,
    IconArrowsSort,
    IconChecklist,
    IconCirclePlus,
    IconClipboardList,
    IconCategory,
    IconEdit,
    IconHome,
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
    IconLogout2,
    IconMessageCircle,
    IconMoonStars,
    IconSettings,
    IconTags,
    IconUsersGroup
} from '@tabler/icons-react';

const ADMIN_TOOLBAR_ORDER_STORAGE_KEY = 'gallery-admin-toolbar-order';

const TAXONOMY_CONFIG = {
    brands: {
        title: 'Brands',
        collectionName: 'categories',
        productField: 'brand',
        addPlaceholder: 'New brand...',
        duplicateMessage: 'Brand name already exists!',
        addedMessage: 'Brand added successfully!',
        renamedMessage: 'Brand updated successfully!',
        deletedMessage: 'Brand deleted successfully!',
        renamePrompt: 'Enter new brand name:'
    },
    categories: {
        title: 'Categories',
        collectionName: 'productCategories',
        productField: 'category',
        addPlaceholder: 'New product category...',
        duplicateMessage: 'Category name already exists!',
        addedMessage: 'Category added successfully!',
        renamedMessage: 'Category updated successfully!',
        deletedMessage: 'Category deleted successfully!',
        renamePrompt: 'Enter new category name:'
    }
};

function normalizeLabel(value, fallback = '') {
    const normalized = String(value || '').trim();
    return normalized || fallback;
}

function sortTaxonomyDocs(snapshot) {
    return snapshot.docs
        .map((entry, index) => {
            const data = entry.data() || {};
            return {
                id: entry.id,
                name: normalizeLabel(data.name, ''),
                order: data.order !== undefined ? data.order : index
            };
        })
        .filter((entry) => entry.name)
        .sort((left, right) => left.order - right.order);
}

function sortProductsForHomeRow(products = []) {
    return [...products].sort((leftProduct, rightProduct) => {
        const leftOrder = Number(leftProduct?.order);
        const rightOrder = Number(rightProduct?.order);
        const safeLeftOrder = Number.isFinite(leftOrder) ? leftOrder : Number.MAX_SAFE_INTEGER;
        const safeRightOrder = Number.isFinite(rightOrder) ? rightOrder : Number.MAX_SAFE_INTEGER;

        if (safeLeftOrder !== safeRightOrder) return safeLeftOrder - safeRightOrder;

        return normalizeLabel(leftProduct?.title || leftProduct?.name, '').localeCompare(
            normalizeLabel(rightProduct?.title || rightProduct?.name, '')
        );
    });
}

function orderToolbarItems(items = [], orderedIds = []) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return items;

    const positionMap = new Map(orderedIds.map((id, index) => [id, index]));

    return [...items].sort((leftItem, rightItem) => {
        const leftIndex = positionMap.has(leftItem.id) ? positionMap.get(leftItem.id) : Number.MAX_SAFE_INTEGER;
        const rightIndex = positionMap.has(rightItem.id) ? positionMap.get(rightItem.id) : Number.MAX_SAFE_INTEGER;

        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return 0;
    });
}

export default function FloatingDockDemo({
    allProducts = [],
    categories = [],
    onAddProduct,
    ordersHref = '/admin/orders',
    usersHref = '/admin/users',
    stockHref = '/admin/stock',
    supportHref = '/whatsapp-server',
    healthHref = '/server-status',
    homeHref = '/'
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [openPanel, setOpenPanel] = useState(null);
    const [isDark, setIsDark] = useState(true);
    const [userRole, setUserRole] = useState('');
    const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
    const [settingsForm, setSettingsForm] = useState(DEFAULT_SITE_SETTINGS);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [settingsFeedback, setSettingsFeedback] = useState(null);
    const [brandsData, setBrandsData] = useState([]);
    const [categoriesData, setCategoriesData] = useState([]);
    const [managerInput, setManagerInput] = useState('');
    const [managerFeedback, setManagerFeedback] = useState(null);
    const [reorderSections, setReorderSections] = useState([]);
    const [reorderFeedback, setReorderFeedback] = useState(null);
    const [isSavingReorder, setIsSavingReorder] = useState(false);
    const [toolbarOrderIds, setToolbarOrderIds] = useState([]);
    const [toolbarEditorItems, setToolbarEditorItems] = useState([]);
    const managerListRef = useRef(null);
    const sortableRef = useRef(null);
    const reorderSortableRefs = useRef({});
    const reorderSectionRefs = useRef({});
    const toolbarEditorRef = useRef(null);
    const toolbarEditorSortableRef = useRef(null);
    const { siteSettings, derivedSettings, isLoading: isSettingsLoading } = useSiteSettings();

    useEffect(() => {
        setIsDark(document.documentElement.classList.contains('dark'));
        setUserRole(normalizeUserRole(sessionStorage.getItem('userRole')));

        try {
            const storedToolbarOrder = window.localStorage.getItem(ADMIN_TOOLBAR_ORDER_STORAGE_KEY);
            if (storedToolbarOrder) {
                const parsedToolbarOrder = JSON.parse(storedToolbarOrder);
                if (Array.isArray(parsedToolbarOrder)) {
                    setToolbarOrderIds(parsedToolbarOrder);
                }
            }
        } catch (error) {
            console.error('Failed to restore admin toolbar order:', error);
        }
    }, []);

    useEffect(() => {
        setSettingsForm(siteSettings);
    }, [siteSettings]);

    useEffect(() => {
        const unsubscribeBrands = onSnapshot(collection(db, 'categories'), (snapshot) => {
            setBrandsData(sortTaxonomyDocs(snapshot));
        });

        const unsubscribeCategories = onSnapshot(collection(db, 'productCategories'), (snapshot) => {
            setCategoriesData(sortTaxonomyDocs(snapshot));
        });

        return () => {
            unsubscribeBrands();
            unsubscribeCategories();
        };
    }, []);

    useEffect(() => {
        setManagerInput('');
        setManagerFeedback(null);
        setReorderFeedback(null);
    }, [openPanel]);

    useEffect(() => {
        if (!managerFeedback) return undefined;

        const timeoutId = window.setTimeout(() => setManagerFeedback(null), 3200);
        return () => window.clearTimeout(timeoutId);
    }, [managerFeedback]);

    useEffect(() => {
        if (!reorderFeedback) return undefined;

        const timeoutId = window.setTimeout(() => setReorderFeedback(null), 3200);
        return () => window.clearTimeout(timeoutId);
    }, [reorderFeedback]);

    const isStrictAdmin = userRole === USER_ROLE_VALUES.ADMIN;
    const isManagerPanel = openPanel === 'brands' || openPanel === 'categories';
    const managerConfig = isManagerPanel ? TAXONOMY_CONFIG[openPanel] : null;
    const managerItems = useMemo(() => {
        if (openPanel === 'brands') return brandsData;
        if (openPanel === 'categories') return categoriesData;
        return [];
    }, [brandsData, categoriesData, openPanel]);

    const homeRowSections = useMemo(() => {
        const groupedProducts = new Map();

        allProducts.forEach((product) => {
            const categoryName = normalizeLabel(product?.category, 'Uncategorized');
            const normalizedProduct = {
                ...product,
                categoryName,
                displayName: normalizeLabel(product?.title || product?.name, 'Untitled Product')
            };

            if (!groupedProducts.has(categoryName)) {
                groupedProducts.set(categoryName, []);
            }

            groupedProducts.get(categoryName).push(normalizedProduct);
        });

        const orderedCategoryNames = [
            ...categories
                .map((category) => normalizeLabel(category?.name, ''))
                .filter((name) => name && groupedProducts.has(name)),
            ...Array.from(groupedProducts.keys()).filter((name) => !categories.some((category) => normalizeLabel(category?.name, '') === name))
        ];

        return orderedCategoryNames.map((categoryName, categoryIndex) => ({
            id: `${categoryName}-${categoryIndex}`,
            categoryName,
            products: sortProductsForHomeRow(groupedProducts.get(categoryName) || [])
        }));
    }, [allProducts, categories]);

    useEffect(() => {
        if (openPanel === 'reorder') {
            setReorderSections(homeRowSections);
        }
    }, [homeRowSections, openPanel]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(ADMIN_TOOLBAR_ORDER_STORAGE_KEY, JSON.stringify(toolbarOrderIds));
    }, [toolbarOrderIds]);

    const settingsLinks = [
        { label: 'WhatsApp', href: derivedSettings.whatsappUrl },
        { label: 'Facebook', href: derivedSettings.facebookUrl },
        { label: 'Maps', href: derivedSettings.mapsUrl },
        { label: 'Channel', href: derivedSettings.whatsappChannelUrl }
    ].filter((linkItem) => Boolean(linkItem.href));

    const quickActions = [
        {
            id: 'toolbar-collapse',
            title: toolbarCollapsed ? 'Expand Toolbar' : 'Collapse Toolbar',
            onClick: () => {
                setToolbarCollapsed((currentValue) => !currentValue);
                setOpenPanel(null);
            },
            active: toolbarCollapsed,
            icon: toolbarCollapsed
                ? <IconLayoutSidebarLeftExpand className="h-full w-full" />
                : <IconLayoutSidebarLeftCollapse className="h-full w-full" />
        },
        {
            id: 'theme-toggle',
            title: isDark ? 'Light Theme' : 'Dark Theme',
            onClick: () => {},
            active: isDark,
            icon: <IconMoonStars className="h-full w-full" />
        },
        {
            id: 'users',
            title: 'Users',
            href: usersHref,
            active: pathname === usersHref,
            icon: <IconUsersGroup className="h-full w-full" />,
            adminOnly: true
        },
        {
            id: 'settings',
            title: 'Settings',
            onClick: () => setOpenPanel((currentValue) => currentValue === 'settings' ? null : 'settings'),
            active: openPanel === 'settings',
            icon: <IconSettings className="h-full w-full" />,
            adminOnly: true
        },
        {
            id: 'server-status',
            title: 'Server Status',
            href: healthHref,
            active: pathname === healthHref,
            icon: <IconChecklist className="h-full w-full" />,
            adminOnly: true
        },
        {
            id: 'whatsapp-server',
            title: 'WhatsApp Server',
            href: supportHref,
            active: pathname === supportHref,
            icon: <IconMessageCircle className="h-full w-full" />
        },
        {
            id: 'stock-sync',
            title: 'Stock Sync',
            href: stockHref,
            active: pathname === stockHref,
            icon: <IconAdjustmentsCog className="h-full w-full" />
        }
    ].filter((item) => !item.adminOnly || isStrictAdmin);

    const handleThemeToggle = () => {
        const isCurrentlyDark = document.documentElement.classList.contains('dark');
        const nextDark = !isCurrentlyDark;

        document.documentElement.classList.toggle('dark', nextDark);
        localStorage.setItem('darkMode', nextDark ? 'true' : 'false');
        localStorage.setItem('autoThemeEnabled', 'false');
        localStorage.setItem('themeOverrideTime', String(Date.now()));
        setIsDark(nextDark);
    };

    quickActions[1].onClick = handleThemeToggle;

    const updateSettingsField = (fieldName, value) => {
        setSettingsForm((currentValue) => ({
            ...currentValue,
            [fieldName]: value
        }));
    };

    const handleSaveSettings = async (event) => {
        event.preventDefault();
        setIsSavingSettings(true);
        setSettingsFeedback(null);

        try {
            const payload = normalizeSiteSettings(settingsForm);
            await setDoc(doc(db, 'settings', 'contact'), payload, { merge: true });
            setSettingsFeedback({
                type: 'success',
                message: 'Site settings updated successfully.'
            });
        } catch (error) {
            setSettingsFeedback({
                type: 'error',
                message: error?.message || 'Failed to update site settings.'
            });
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        sessionStorage.removeItem('isAdmin');
        sessionStorage.removeItem('userRole');
        router.push('/login');
    };

    const pushManagerFeedback = (type, message) => {
        setManagerFeedback({ type, message });
    };

    const hasDuplicateManagerName = (value, excludedId = null) => {
        const normalizedValue = normalizeLabel(value, '').toLowerCase();
        return managerItems.some((item) => item.id !== excludedId && normalizeLabel(item.name, '').toLowerCase() === normalizedValue);
    };

    const handleManagerAdd = async () => {
        if (!managerConfig) return;

        const nextName = normalizeLabel(managerInput, '');
        if (!nextName) return;

        if (hasDuplicateManagerName(nextName)) {
            pushManagerFeedback('error', managerConfig.duplicateMessage);
            return;
        }

        try {
            const nextOrder = managerItems.length > 0
                ? Math.max(...managerItems.map((item) => Number(item.order) || 0)) + 1
                : 0;

            await addDoc(collection(db, managerConfig.collectionName), {
                name: nextName,
                order: nextOrder
            });

            setManagerInput('');
            pushManagerFeedback('success', managerConfig.addedMessage);
        } catch (error) {
            pushManagerFeedback('error', error?.message || `Failed to add ${managerConfig.title.toLowerCase()}.`);
        }
    };

    const handleManagerRename = async (entry) => {
        if (!managerConfig || !entry) return;

        const nextNameRaw = window.prompt(managerConfig.renamePrompt, entry.name);
        const nextName = normalizeLabel(nextNameRaw, '');

        if (!nextName || nextName === entry.name) return;

        if (hasDuplicateManagerName(nextName, entry.id)) {
            pushManagerFeedback('error', managerConfig.duplicateMessage);
            return;
        }

        const isConfirmed = window.confirm(`Rename ${managerConfig.title.slice(0, -1).toLowerCase()} "${entry.name}" to "${nextName}"?\nThis will update all associated products.`);
        if (!isConfirmed) return;

        try {
            await updateDoc(doc(db, managerConfig.collectionName, entry.id), { name: nextName });

            const productsSnapshot = await getDocs(query(collection(db, 'products'), where(managerConfig.productField, '==', entry.name)));
            const updates = productsSnapshot.docs.map((productDoc) => updateDoc(doc(db, 'products', productDoc.id), { [managerConfig.productField]: nextName }));
            await Promise.all(updates);

            pushManagerFeedback('success', managerConfig.renamedMessage);
        } catch (error) {
            pushManagerFeedback('error', error?.message || `Failed to rename ${managerConfig.title.toLowerCase()}.`);
        }
    };

    const handleManagerDelete = async (entry) => {
        if (!managerConfig || !entry) return;

        const isConfirmed = window.confirm(`Delete ${managerConfig.title.slice(0, -1).toLowerCase()} "${entry.name}"?`);
        if (!isConfirmed) return;

        try {
            await deleteDoc(doc(db, managerConfig.collectionName, entry.id));
            pushManagerFeedback('success', managerConfig.deletedMessage);
        } catch (error) {
            pushManagerFeedback('error', error?.message || `Failed to delete ${managerConfig.title.toLowerCase()}.`);
        }
    };

    const handleSaveReorder = async () => {
        setIsSavingReorder(true);
        setReorderFeedback(null);

        try {
            const pendingUpdates = reorderSections.flatMap((section, categoryIndex) => section.products.map((product, productIndex) => ({
                id: product.id,
                currentOrder: Number.isFinite(Number(product.order)) ? Number(product.order) : Number.MAX_SAFE_INTEGER,
                nextOrder: categoryIndex * 1000 + productIndex
            })));

            const changedUpdates = pendingUpdates.filter((entry) => entry.currentOrder !== entry.nextOrder);
            await Promise.all(changedUpdates.map((entry) => updateDoc(doc(db, 'products', entry.id), { order: entry.nextOrder })));

            setReorderFeedback({ type: 'success', message: 'Home rows reordered successfully.' });
        } catch (error) {
            setReorderFeedback({ type: 'error', message: error?.message || 'Failed to save row ordering.' });
        } finally {
            setIsSavingReorder(false);
        }
    };

    useEffect(() => {
        if (!isManagerPanel || !managerListRef.current || typeof window === 'undefined' || !window.Sortable || !managerConfig) {
            return undefined;
        }

        if (sortableRef.current) {
            sortableRef.current.destroy();
            sortableRef.current = null;
        }

        const listElement = managerListRef.current;
        const setItems = openPanel === 'brands' ? setBrandsData : setCategoriesData;
        const sortable = new window.Sortable(listElement, {
            animation: 180,
            handle: '.drag-handle',
            ghostClass: 'legacy-taxonomy-ghost',
            chosenClass: 'legacy-taxonomy-chosen',
            dragClass: 'legacy-taxonomy-drag',
            direction: 'vertical',
            forceFallback: true,
            fallbackOnBody: false,
            scroll: listElement,
            scrollSensitivity: 60,
            scrollSpeed: 15,
            delay: 0,
            touchStartThreshold: 3,
            onStart: () => {
                listElement.classList.add('is-dragging');
                document.body.style.overflow = 'hidden';
            },
            onEnd: async () => {
                listElement.classList.remove('is-dragging');
                document.body.style.overflow = '';

                const nextOrderData = Array.from(listElement.querySelectorAll('[data-id]')).map((item, index) => ({
                    id: item.dataset.id,
                    order: index
                }));

                setItems((currentItems) => currentItems
                    .map((item) => {
                        const matchedOrder = nextOrderData.find((orderEntry) => orderEntry.id === item.id);
                        return matchedOrder ? { ...item, order: matchedOrder.order } : item;
                    })
                    .sort((left, right) => left.order - right.order));

                try {
                    await Promise.all(nextOrderData.map((item) => updateDoc(doc(db, managerConfig.collectionName, item.id), { order: item.order })));
                } catch (error) {
                    pushManagerFeedback('error', error?.message || `Failed to reorder ${managerConfig.title.toLowerCase()}.`);
                }
            }
        });

        sortableRef.current = sortable;

        return () => {
            listElement.classList.remove('is-dragging');
            document.body.style.overflow = '';
            sortable.destroy();
            if (sortableRef.current === sortable) {
                sortableRef.current = null;
            }
        };
    }, [isManagerPanel, managerConfig, managerItems, openPanel]);

    useEffect(() => {
        if (openPanel !== 'reorder' || typeof window === 'undefined' || !window.Sortable) {
            Object.values(reorderSortableRefs.current).forEach((sortableInstance) => sortableInstance?.destroy?.());
            reorderSortableRefs.current = {};
            return undefined;
        }

        Object.values(reorderSortableRefs.current).forEach((sortableInstance) => sortableInstance?.destroy?.());
        reorderSortableRefs.current = {};

        reorderSections.forEach((section) => {
            const listElement = reorderSectionRefs.current[section.id];
            if (!listElement) return;

            reorderSortableRefs.current[section.id] = new window.Sortable(listElement, {
                animation: 180,
                handle: '.reorder-drag-handle',
                ghostClass: 'legacy-taxonomy-ghost',
                chosenClass: 'legacy-taxonomy-chosen',
                dragClass: 'legacy-taxonomy-drag',
                direction: 'horizontal',
                forceFallback: true,
                fallbackOnBody: false,
                onEnd: () => {
                    const orderedIds = Array.from(listElement.querySelectorAll('[data-product-id]')).map((node) => node.dataset.productId);

                    setReorderSections((currentSections) => currentSections.map((currentSection) => {
                        if (currentSection.id !== section.id) return currentSection;

                        const nextProducts = orderedIds
                            .map((productId) => currentSection.products.find((product) => product.id === productId))
                            .filter(Boolean);

                        return {
                            ...currentSection,
                            products: nextProducts
                        };
                    }));
                }
            });
        });

        return () => {
            Object.values(reorderSortableRefs.current).forEach((sortableInstance) => sortableInstance?.destroy?.());
            reorderSortableRefs.current = {};
        };
    }, [openPanel, reorderSections]);

    const mainToolbarItems = toolbarCollapsed ? [] : [
        {
            id: 'brands',
            title: 'Brands',
            onClick: () => setOpenPanel((currentValue) => currentValue === 'brands' ? null : 'brands'),
            active: openPanel === 'brands',
            icon: <IconTags className="h-full w-full" />
        },
        {
            id: 'categories',
            title: 'Categories',
            onClick: () => setOpenPanel((currentValue) => currentValue === 'categories' ? null : 'categories'),
            active: openPanel === 'categories',
            icon: <IconCategory className="h-full w-full" />
        },
        {
            id: 'orders',
            title: 'Orders',
            href: ordersHref,
            active: pathname === ordersHref,
            icon: <IconClipboardList className="h-full w-full" />
        },
        {
            id: 'reorder-rows',
            title: 'Reorder Rows',
            onClick: () => setOpenPanel((currentValue) => currentValue === 'reorder' ? null : 'reorder'),
            active: openPanel === 'reorder',
            icon: <IconArrowsSort className="h-full w-full" />
        },
        {
            id: 'add-product',
            title: 'Add Product',
            onClick: onAddProduct,
            icon: <IconCirclePlus className="h-full w-full" />
        }
    ];

    const reorderableToolbarItems = useMemo(() => orderToolbarItems([
        ...quickActions,
        ...mainToolbarItems,
        {
            id: 'view-site',
            title: 'View Site',
            href: homeHref,
            active: pathname === homeHref,
            icon: <img src="/logo.png" alt="House Of Glass" className="h-6 w-6 object-contain" />,
            renderFullSize: true,
            render: ({ hovered, active }) => {
                const isHighlighted = hovered || active;

                return (
                    <div className="flex h-full w-full items-center justify-center">
                        <div className={`flex items-center justify-center rounded-full transition-all duration-200 ${isHighlighted ? 'h-full w-full bg-[#e0be00] shadow-[0_10px_24px_rgba(224,190,0,0.35)]' : 'h-[88%] w-[88%] border-[1px] border-brandGold/95 bg-[#2a2d24] shadow-[inset_0_0_0_999px_rgba(16,22,34,0.08)]'}`}>
                            <img
                                src="/logo.png"
                                alt="House Of Glass"
                                className={`object-contain transition-all duration-200 ${isHighlighted ? 'h-full w-full scale-[1.99]' : 'h-full w-full scale-[1.90]'}`}
                            />
                        </div>
                    </div>
                );
            }
        },
        {
            id: 'logout',
            title: 'Logout',
            onClick: handleLogout,
            icon: <IconLogout2 className="h-full w-full" />
        }
    ], toolbarOrderIds), [quickActions, mainToolbarItems, pathname, homeHref, toolbarOrderIds]);

    useEffect(() => {
        if (openPanel !== 'tool-order' || typeof window === 'undefined' || !window.Sortable || !toolbarEditorRef.current) {
            if (toolbarEditorSortableRef.current) {
                toolbarEditorSortableRef.current.destroy();
                toolbarEditorSortableRef.current = null;
            }
            return undefined;
        }

        if (toolbarEditorSortableRef.current) {
            toolbarEditorSortableRef.current.destroy();
        }

        const listElement = toolbarEditorRef.current;
        const sortable = new window.Sortable(listElement, {
            animation: 180,
            handle: '.tool-order-drag-handle',
            ghostClass: 'legacy-taxonomy-ghost',
            chosenClass: 'legacy-taxonomy-chosen',
            dragClass: 'legacy-taxonomy-drag',
            direction: 'vertical',
            forceFallback: true,
            fallbackOnBody: false,
            onEnd: () => {
                const orderedIds = Array.from(listElement.querySelectorAll('[data-tool-id]')).map((node) => node.dataset.toolId);
                setToolbarEditorItems((currentItems) => orderedIds
                    .map((toolId) => currentItems.find((item) => item.id === toolId))
                    .filter(Boolean));
            }
        });

        toolbarEditorSortableRef.current = sortable;

        return () => {
            sortable.destroy();
            if (toolbarEditorSortableRef.current === sortable) {
                toolbarEditorSortableRef.current = null;
            }
        };
    }, [openPanel, toolbarEditorItems]);

    const handleSaveToolbarOrder = () => {
        setToolbarOrderIds(toolbarEditorItems.map((item) => item.id));
        setOpenPanel(null);
    };

    const handleOpenToolOrderEditor = () => {
        setToolbarEditorItems(reorderableToolbarItems);
        setOpenPanel('tool-order');
    };

    const toolbarItems = reorderableToolbarItems.map((item) => {
        if (item.id !== 'view-site') return item;

        return {
            ...item,
            secondaryAction: {
                title: 'Edit Tools',
                onClick: handleOpenToolOrderEditor,
                icon: <IconEdit className="h-full w-full" />
            }
        };
    });

    return (
        <div className="space-y-2">
            <div className="hidden lg:block h-[84px]" aria-hidden="true"></div>
            <div className="lg:fixed lg:left-7 lg:right-7 lg:top-4 lg:z-40">
                <div className="overflow-x-auto md:overflow-visible hide-scroll">
                    <FloatingDock
                        items={toolbarItems}
                        desktopClassName="mx-auto h-auto w-fit shrink-0 items-center justify-center rounded-[1.85rem] border border-white/10 bg-[linear-gradient(180deg,#1e2436_0%,#181d2b_100%)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        mobileClassName="fixed bottom-5 right-5 z-40"
                    />
                </div>
            </div>

            {openPanel === 'settings' ? (
                <div className="rounded-[1.55rem] border border-white/10 bg-[linear-gradient(180deg,#1a2235_0%,#141c2e_100%)] p-4 shadow-[0_18px_40px_rgba(4,8,20,0.24)]">
                    <form className="space-y-5" onSubmit={handleSaveSettings}>
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brandGold/75">General Settings</p>
                                    <h3 className="mt-1 text-lg font-black text-white">Live website links and contact data</h3>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-300">
                                        settings/contact
                                    </span>
                                    {isSettingsLoading ? (
                                        <span className="rounded-full border border-brandGold/20 bg-brandGold/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-brandGold">
                                            Loading...
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
                                Restored from the legacy admin flow. Saving here updates the same Firestore document used for the public WhatsApp, Facebook, maps, and contact links.
                            </p>

                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">WhatsApp Number</span>
                                    <input
                                        type="text"
                                        value={settingsForm.whatsapp}
                                        onChange={(event) => updateSettingsField('whatsapp', event.target.value)}
                                        placeholder="201026600350"
                                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/50"
                                    />
                                </label>

                                <label className="space-y-2">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Global Price Increase (%)</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={settingsForm.priceIncrease}
                                        onChange={(event) => updateSettingsField('priceIncrease', event.target.value)}
                                        placeholder="0"
                                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/50"
                                    />
                                </label>

                                <label className="space-y-2 md:col-span-2">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Calling Phone Number(s)</span>
                                    <input
                                        type="text"
                                        value={settingsForm.phone}
                                        onChange={(event) => updateSettingsField('phone', event.target.value)}
                                        placeholder="01000000000, 0220000000"
                                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/50"
                                    />
                                </label>

                                <label className="space-y-2 md:col-span-2">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Facebook Page Link</span>
                                    <input
                                        type="url"
                                        value={settingsForm.facebook}
                                        onChange={(event) => updateSettingsField('facebook', event.target.value)}
                                        placeholder="https://www.facebook.com/..."
                                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/50"
                                    />
                                </label>

                                <label className="space-y-2 md:col-span-2">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">WhatsApp Channel Link</span>
                                    <input
                                        type="url"
                                        value={settingsForm.whatsappChannel}
                                        onChange={(event) => updateSettingsField('whatsappChannel', event.target.value)}
                                        placeholder="https://whatsapp.com/channel/..."
                                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/50"
                                    />
                                </label>

                                <label className="space-y-2 md:col-span-2">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Google Maps Link</span>
                                    <input
                                        type="url"
                                        value={settingsForm.maps}
                                        onChange={(event) => updateSettingsField('maps', event.target.value)}
                                        placeholder="https://maps.google.com/..."
                                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/50"
                                    />
                                </label>
                            </div>

                            {settingsFeedback ? (
                                <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${settingsFeedback.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
                                    {settingsFeedback.message}
                                </div>
                            ) : null}

                            <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/80">Live Preview</p>
                                        <p className="mt-1 text-sm text-slate-300">Open the current links exactly as the storefront will use them.</p>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isSavingSettings}
                                        className="rounded-full border border-brandGold/35 bg-brandGold px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-brandBlue transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSavingSettings ? 'Saving...' : 'Save Settings'}
                                    </button>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2.5">
                                    {settingsLinks.map((linkItem) => (
                                        <a
                                            key={linkItem.label}
                                            href={linkItem.href}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-full border border-white/10 bg-[#1e2436] px-4 py-2 text-sm font-bold text-slate-200 transition-colors hover:bg-white/[0.08]"
                                        >
                                            {linkItem.label}
                                        </a>
                                    ))}

                                    {derivedSettings.phoneUrl ? (
                                        <a
                                            href={derivedSettings.phoneUrl}
                                            className="rounded-full border border-white/10 bg-[#1e2436] px-4 py-2 text-sm font-bold text-slate-200 transition-colors hover:bg-white/[0.08]"
                                        >
                                            Call
                                        </a>
                                    ) : null}
                                </div>
                            </div>
                    </form>
                </div>
            ) : null}

            {isManagerPanel && managerConfig ? (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#09101d]/78 px-4 py-6 backdrop-blur-sm" onClick={() => setOpenPanel(null)}>
                    <div className="legacy-taxonomy-modal max-h-[88vh] w-full max-w-[720px] overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,#1b2436_0%,#131b2c_100%)] shadow-[0_24px_70px_rgba(0,0,0,0.45)]" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-white/8 px-8 py-7">
                            <h3 className="text-[2rem] font-black italic text-brandGold">{managerConfig.title}</h3>
                            <button
                                type="button"
                                onClick={() => setOpenPanel(null)}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                                aria-label={`Close ${managerConfig.title} manager`}
                            >
                                <i className="fa-solid fa-xmark text-[1.8rem]"></i>
                            </button>
                        </div>

                        <div className="space-y-5 px-8 py-7">
                            <div className="flex items-center gap-4">
                                <input
                                    type="text"
                                    value={managerInput}
                                    onChange={(event) => setManagerInput(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            handleManagerAdd();
                                        }
                                    }}
                                    placeholder={managerConfig.addPlaceholder}
                                    className="h-16 flex-1 rounded-[1.15rem] border border-white/14 bg-white/[0.06] px-6 text-[1.05rem] font-semibold text-white outline-none transition-colors placeholder:text-slate-400 focus:border-brandGold/45"
                                />
                                <button
                                    type="button"
                                    onClick={handleManagerAdd}
                                    className="inline-flex h-16 min-w-[96px] items-center justify-center rounded-[1.1rem] px-6 text-[1.2rem] font-black text-white transition-colors hover:bg-white/5"
                                >
                                    Add
                                </button>
                            </div>

                            {managerFeedback ? (
                                <div className={`rounded-[1.1rem] border px-4 py-3 text-sm font-bold ${managerFeedback.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
                                    {managerFeedback.message}
                                </div>
                            ) : null}

                            <div ref={managerListRef} className="legacy-taxonomy-scroll max-h-[54vh] overflow-y-auto pr-2">
                                {managerItems.map((entry) => (
                                    <div key={entry.id} data-id={entry.id} className="legacy-taxonomy-row mb-4 flex items-center justify-between rounded-[1.35rem] border border-white/8 bg-[#273044] px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-brandGold/25">
                                        <div className="flex min-w-0 items-center gap-5">
                                            <button type="button" className="drag-handle inline-flex cursor-grab items-center justify-center text-slate-400 transition-colors hover:text-brandGold active:cursor-grabbing" aria-label={`Reorder ${entry.name}`}>
                                                <i className="fa-solid fa-grip-lines text-[1.7rem]"></i>
                                            </button>
                                            <span className="truncate text-[1.05rem] font-black text-brandGold">{entry.name}</span>
                                        </div>

                                        <div className="ml-4 flex shrink-0 items-center gap-4">
                                            <button
                                                type="button"
                                                onClick={() => handleManagerRename(entry)}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-blue-400 transition-colors hover:bg-blue-500/10 hover:text-blue-300"
                                                aria-label={`Edit ${entry.name}`}
                                            >
                                                <i className="fa-solid fa-pen text-sm"></i>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleManagerDelete(entry)}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                                                aria-label={`Delete ${entry.name}`}
                                            >
                                                <i className="fa-solid fa-xmark text-base"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {managerItems.length === 0 ? (
                                    <div className="rounded-[1.35rem] border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center text-sm font-bold text-slate-400">
                                        No {managerConfig.title.toLowerCase()} found yet.
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {openPanel === 'reorder' ? (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#09101d]/78 px-4 py-6 backdrop-blur-sm" onClick={() => setOpenPanel(null)}>
                    <div className="legacy-taxonomy-modal max-h-[86vh] w-full max-w-[1040px] overflow-hidden rounded-[1.45rem] border border-white/8 bg-[linear-gradient(180deg,#1b2436_0%,#131b2c_100%)] shadow-[0_24px_70px_rgba(0,0,0,0.45)]" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4.5">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brandGold/75">Home Page Rows</p>
                                <h3 className="mt-1 text-[1.5rem] font-black italic text-brandGold">Reorder Row Products</h3>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleSaveReorder}
                                    disabled={isSavingReorder}
                                    className="rounded-full border border-brandGold/35 bg-brandGold px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-brandBlue transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSavingReorder ? 'Saving...' : 'Save Order'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpenPanel(null)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                                    aria-label="Close reorder manager"
                                >
                                    <i className="fa-solid fa-xmark text-[1.35rem]"></i>
                                </button>
                            </div>
                        </div>

                        <div className="legacy-taxonomy-scroll max-h-[calc(86vh-78px)] space-y-3.5 overflow-y-auto px-5 py-4">
                            <p className="text-[12px] leading-relaxed text-slate-300">رتب المنتجات جوه كل row زي اللي ظاهر على الهوم. اسحب الكارت يمين وشمال داخل نفس الصف، وبعدها اضغط Save Order.</p>

                            {reorderFeedback ? (
                                <div className={`rounded-[1.1rem] border px-4 py-3 text-sm font-bold ${reorderFeedback.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
                                    {reorderFeedback.message}
                                </div>
                            ) : null}

                            <div className="space-y-5">
                                {reorderSections.map((section) => (
                                    <section key={section.id} className="space-y-3">
                                        <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-2">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brandGold/70">Visible Home Row</p>
                                                <h4 className="mt-0.5 text-[1rem] font-black text-white">{section.categoryName}</h4>
                                            </div>
                                            <span className="rounded-full border border-brandGold/20 bg-brandGold/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-brandGold">{section.products.length} items</span>
                                        </div>

                                        <div
                                            ref={(node) => {
                                                if (node) {
                                                    reorderSectionRefs.current[section.id] = node;
                                                } else {
                                                    delete reorderSectionRefs.current[section.id];
                                                }
                                            }}
                                            className="flex gap-2.5 overflow-x-auto pb-2 hide-scroll"
                                        >
                                            {section.products.map((product, productIndex) => {
                                                const imageEntry = Array.isArray(product.images) ? product.images[0] : null;
                                                const imageUrl = imageEntry?.url || imageEntry?.primaryUrl || imageEntry || '';

                                                return (
                                                    <article key={product.id} data-product-id={product.id} className="min-h-[210px] w-[168px] flex-none rounded-[1.2rem] border border-white/10 bg-[#20293c] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                                        <div className="mb-2.5 flex items-center justify-between gap-2">
                                                            <button type="button" className="reorder-drag-handle inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-300 transition-colors hover:border-brandGold/30 hover:text-brandGold active:cursor-grabbing">
                                                                <i className="fa-solid fa-grip-lines text-[11px]"></i>
                                                            </button>
                                                            <span className="rounded-full border border-brandGold/15 bg-brandGold/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-brandGold">#{productIndex + 1}</span>
                                                        </div>

                                                        <div className="aspect-[4/5] overflow-hidden rounded-[0.95rem] border border-white/6 bg-white/[0.04]">
                                                            {imageUrl ? (
                                                                <img src={imageUrl} alt={product.displayName} className="h-full w-full object-cover" loading="lazy" />
                                                            ) : (
                                                                <div className="flex h-full w-full items-center justify-center text-slate-500">
                                                                    <i className="fa-regular fa-image text-3xl"></i>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="mt-2.5 space-y-1">
                                                            <h5 className="line-clamp-2 text-[11px] font-black leading-4.5 text-white" dir="rtl">{product.displayName}</h5>
                                                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{normalizeLabel(product.code || product.barcode, 'No Code')}</p>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {openPanel === 'tool-order' ? (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#09101d]/78 px-4 py-6 backdrop-blur-sm" onClick={() => setOpenPanel(null)}>
                    <div className="legacy-taxonomy-modal max-h-[82vh] w-full max-w-[760px] overflow-hidden rounded-[1.45rem] border border-white/8 bg-[linear-gradient(180deg,#1b2436_0%,#131b2c_100%)] shadow-[0_24px_70px_rgba(0,0,0,0.45)]" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4.5">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brandGold/75">Tools Bar</p>
                                <h3 className="mt-1 text-[1.5rem] font-black italic text-brandGold">Edit Tool Order</h3>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleSaveToolbarOrder}
                                    className="rounded-full border border-brandGold/35 bg-brandGold px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-brandBlue transition-all hover:bg-white"
                                >
                                    Save Tools
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpenPanel(null)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                                    aria-label="Close tool editor"
                                >
                                    <i className="fa-solid fa-xmark text-[1.35rem]"></i>
                                </button>
                            </div>
                        </div>

                        <div className="legacy-taxonomy-scroll max-h-[calc(82vh-78px)] space-y-3.5 overflow-y-auto px-5 py-4">
                            <p className="text-[12px] leading-relaxed text-slate-300">اسحب الأدوات بالترتيب اللي تحبه، وبعدها اضغط Save Tools. الترتيب الجديد بيتطبق مباشرة على شريط الأدوات.</p>

                            <div ref={toolbarEditorRef} className="space-y-3">
                                {toolbarEditorItems.map((item, index) => (
                                    <article key={item.id} data-tool-id={item.id} className="flex items-center justify-between gap-3 rounded-[1.15rem] border border-white/10 bg-[#20293c] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <button type="button" className="tool-order-drag-handle inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-300 transition-colors hover:border-brandGold/30 hover:text-brandGold active:cursor-grabbing">
                                                <i className="fa-solid fa-grip-lines text-[11px]"></i>
                                            </button>
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,#202945_0%,#1a2238_100%)] text-slate-100">
                                                {item.icon}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-white">{item.title}</p>
                                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Position #{index + 1}</p>
                                            </div>
                                        </div>
                                        <span className="rounded-full border border-brandGold/15 bg-brandGold/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-brandGold">Drag</span>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
