'use client';
import { useEffect } from 'react';

export default function Page() {
    useEffect(() => {
        const script = document.createElement('script');
        script.type = 'module';
        // We use backticks to retain multi-line template literals, but we have to escape 
        // internal template literals in the script if they use backticks. Or use String.raw?
        // Let's use a safe method: assign via string parts or just escape backticks in the script content
        script.innerHTML = `
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brandBlue: '#121926',
                        brandGold: '#D4AF37',
                        darkBg: '#030712',
                        darkCard: '#111827'
                    },
                    fontFamily: {
                        arabic: ['Cairo', 'sans-serif']
                    }
                }
            }
        };

        function applySmartTheme() {
            var isAutoEnabled = localStorage.getItem('autoThemeEnabled') !== 'false';
            var manualTheme = localStorage.getItem('darkMode');
            var overrideTime = localStorage.getItem('themeOverrideTime');
            var now = Date.now();

            if (!isAutoEnabled) {
                if (manualTheme === 'true') document.documentElement.classList.add('dark');
                else if (manualTheme === 'false') document.documentElement.classList.remove('dark');
                return;
            }

            if (overrideTime && (now - overrideTime > 600000)) {
                localStorage.removeItem('darkMode');
                localStorage.removeItem('themeOverrideTime');
            } else if (manualTheme !== null) {
                if (manualTheme === 'true') document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
                return;
            }

            var hour = new Date().getHours();
            if (hour < 6 || hour >= 18) document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
        }

        applySmartTheme();
    


        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
        import { getFirestore, collection, onSnapshot, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
        import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

        var firebaseConfig = {
            apiKey: 'AIzaSyA_oTePhmWmzuOcZDmc_-7bhoAVbYVhH3Q',
            authDomain: 'houseofglass-440.firebaseapp.com',
            projectId: 'houseofglass-440',
            storageBucket: 'houseofglass-440.firebasestorage.app',
            messagingSenderId: '73082039144',
            appId: '1:73082039144:web:0658e54416293334dc84dd',
            measurementId: 'G-S81YY4Z4RM'
        };

        var app = initializeApp(firebaseConfig);
        var db = getFirestore(app);
        var auth = getAuth(app);

        var STOCK_ENDPOINT = '/api/dc/stock';
        var STOCK_TTL_MS = 120000;

        var loadingState = document.getElementById('loadingState');
        var errorState = document.getElementById('errorState');
        var errorText = document.getElementById('errorText');
        var tableWrapper = document.getElementById('tableWrapper');
        var stockTableBody = document.getElementById('stockTableBody');
        var searchInput = document.getElementById('searchInput');
        var statusFilter = document.getElementById('statusFilter');
        var refreshBtn = document.getElementById('refreshBtn');
        var lastSyncText = document.getElementById('lastSyncText');
        var filteredCountText = document.getElementById('filteredCountText');

        let products = [];
        let mergedRows = [];
        let stockCache = null;
        let stockCacheTime = 0;
        let stockPromise = null;
        let lastSyncAt = null;
        let liveClockTimer = null;
        var expandedProductIds = new Set();

        function setLoading(isLoading) {
            loadingState.classList.toggle('hidden', !isLoading);
            if (isLoading) {
                errorState.classList.add('hidden');
                tableWrapper.classList.add('hidden');
            }
        }

        function setError(message) {
            errorText.textContent = message;
            errorState.classList.remove('hidden');
            loadingState.classList.add('hidden');
            tableWrapper.classList.add('hidden');
        }

        function normalizeCode(value) {
            return String(value || '').trim();
        }

        function normalizeWarehouseName(name) {
            return String(name || '').replace(/\\s+/g, '');
        }

        function getWarehouseBuckets(item) {
            let retailStock = 0;
            let wholesaleStock = 0;

            (item?.stock_by_warehouse || []).forEach((warehouse) => {
                var normalizedName = normalizeWarehouseName(warehouse.warehouse_name);
                var quantity = Number(warehouse.quantity || 0);

                if (!normalizedName) return;

                if (normalizedName.includes('مخزنالمعرض')) {
                    retailStock += quantity;
                    return;
                }

                if (normalizedName.includes('المخزنالرئيسي')) {
                    wholesaleStock += quantity;
                }
            });

            return { retailStock, wholesaleStock };
        }

        async function getStockMap(force = false) {
            var now = Date.now();
            if (!force && stockCache && now - stockCacheTime < STOCK_TTL_MS) {
                return stockCache;
            }

            if (!force && stockPromise) return stockPromise;

            stockPromise = (async () => {
                var response = await fetch(STOCK_ENDPOINT);
                if (!response.ok) throw new Error('Unable to connect to the stock server');

                var payload = await response.json();
                var productList = Array.isArray(payload?.products) ? payload.products : [];
                var stockMap = {};

                productList.forEach((item) => {
                    var barcode = normalizeCode(item.barcode || item.code || item.product_code || item.id);
                    if (!barcode) return;

                    var buckets = getWarehouseBuckets(item);
                    stockMap[barcode] = {
                        barcode,
                        name: item.name || '',
                        retailStock: buckets.retailStock,
                        wholesaleStock: buckets.wholesaleStock,
                        totalStock: Number(item.total_stock || 0)
                    };
                });

                stockCache = stockMap;
                stockCacheTime = Date.now();
                stockPromise = null;
                return stockMap;
            })().catch((error) => {
                stockPromise = null;
                throw error;
            });

            return stockPromise;
        }

        function buildMergedRows(stockMap) {
            return products.map((product) => {
                var code = normalizeCode(product.code);
                var stockInfo = code ? stockMap[code] : null;
                var variants = Array.isArray(product.variants)
                    ? product.variants.map((variant, index) => {
                        var variantCode = normalizeCode(variant.code || variant.barcode);
                        var variantStockInfo = variantCode ? stockMap[variantCode] : null;

                        return {
                            id: \`\${product.id}-variant-\${index}\`,
                            name: variant.name || \`Variant \${index + 1}\`,
                            code: variantCode,
                            matchedBarcode: variantStockInfo?.barcode || '-',
                            retailStock: variantStockInfo?.retailStock || 0,
                            wholesaleStock: variantStockInfo?.wholesaleStock || 0,
                            linked: Boolean(variantStockInfo)
                        };
                    })
                    : [];

                var uniqueVariantStockRows = [];
                var seenVariantStockKeys = new Set();

                variants.forEach((variant, index) => {
                    var stockKey = variant.code || (variant.linked ? normalizeCode(variant.matchedBarcode) : \`\${product.id}-variant-\${index}\`);
                    if (!stockKey || seenVariantStockKeys.has(stockKey)) return;
                    seenVariantStockKeys.add(stockKey);
                    uniqueVariantStockRows.push(variant);
                });

                var hasVariants = variants.length > 0;
                var linkedVariantCount = variants.filter((variant) => variant.linked).length;
                var retailStock = hasVariants
                    ? uniqueVariantStockRows.reduce((sum, variant) => sum + variant.retailStock, 0)
                    : (stockInfo?.retailStock || 0);
                var wholesaleStock = hasVariants
                    ? uniqueVariantStockRows.reduce((sum, variant) => sum + variant.wholesaleStock, 0)
                    : (stockInfo?.wholesaleStock || 0);
                var linked = hasVariants ? linkedVariantCount > 0 : Boolean(stockInfo);
                var statusText = hasVariants
                    ? (linkedVariantCount === 0 ? 'Unlinked' : (linkedVariantCount === variants.length ? 'Linked' : 'Partial'))
                    : (linked ? 'Linked' : 'Unlinked');
                var statusTone = statusText === 'Linked'
                    ? 'linked'
                    : (statusText === 'Partial' ? 'partial' : 'unlinked');

                return {
                    id: product.id,
                    name: product.name || 'Unnamed Product',
                    code,
                    matchedBarcode: hasVariants ? \`\${linkedVariantCount}/\${variants.length} variants\` : (stockInfo?.barcode || '-'),
                    retailStock,
                    wholesaleStock,
                    linked,
                    order: Number(product.order || 0),
                    hasVariants,
                    variants,
                    linkedVariantCount,
                    statusText,
                    statusTone
                };
            }).sort((left, right) => {
                if (left.order !== right.order) return left.order - right.order;
                return left.name.localeCompare(right.name, 'en');
            });
        }

        function updateStats(rows) {
            var linkedRows = rows.filter((row) => row.linked);
            var retailTotal = rows.reduce((sum, row) => sum + row.retailStock, 0);
            var wholesaleTotal = rows.reduce((sum, row) => sum + row.wholesaleStock, 0);

            document.getElementById('totalProductsStat').textContent = String(rows.length);
            document.getElementById('linkedProductsStat').textContent = String(linkedRows.length);
            document.getElementById('retailStockStat').textContent = String(retailTotal);
            document.getElementById('wholesaleStockStat').textContent = String(wholesaleTotal);
        }

        function rowMatchesStatus(row, statusValue) {
            if (statusValue === 'linked') return row.linked;
            if (statusValue === 'missing') return !row.linked;
            if (statusValue === 'inRetail') return row.retailStock > 0;
            if (statusValue === 'outRetail') return row.retailStock <= 0;
            if (statusValue === 'inWholesale') return row.wholesaleStock > 0;
            if (statusValue === 'outWholesale') return row.wholesaleStock <= 0;
            return true;
        }

        function rowMatchesSearch(row, searchValue) {
            return !searchValue
                || row.name.toLowerCase().includes(searchValue)
                || row.code.toLowerCase().includes(searchValue)
                || String(row.matchedBarcode).toLowerCase().includes(searchValue)
                || (row.hasVariants && row.variants.some((variant) => {
                    return variant.name.toLowerCase().includes(searchValue)
                        || variant.code.toLowerCase().includes(searchValue)
                        || String(variant.matchedBarcode).toLowerCase().includes(searchValue);
                }));
        }

        function updateFilterOptionCounts() {
            var searchValue = normalizeCode(searchInput.value).toLowerCase();
            Array.from(statusFilter.options).forEach((option) => {
                var baseLabel = option.dataset.label || option.textContent;
                var count = mergedRows.filter((row) => rowMatchesSearch(row, searchValue) && rowMatchesStatus(row, option.value)).length;
                option.textContent = \`\${baseLabel} (\${count})\`;
            });
        }

        function formatElapsedTime(date) {
            var seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
            if (seconds < 5) return 'just now';
            if (seconds < 60) return \`\${seconds}s ago\`;

            var minutes = Math.floor(seconds / 60);
            if (minutes < 60) return \`\${minutes}m ago\`;

            var hours = Math.floor(minutes / 60);
            if (hours < 24) return \`\${hours}h ago\`;

            var days = Math.floor(hours / 24);
            return \`\${days}d ago\`;
        }

        function renderLiveSyncTime() {
            if (!lastSyncAt) {
                lastSyncText.textContent = '-';
                return;
            }

            var absoluteTime = lastSyncAt.toLocaleString('en-GB');
            var relativeTime = formatElapsedTime(lastSyncAt);
            lastSyncText.textContent = \`\${absoluteTime} (\${relativeTime})\`;
        }

        function ensureLiveSyncClock() {
            if (liveClockTimer) return;
            liveClockTimer = setInterval(renderLiveSyncTime, 1000);
        }

        function getFilteredRows() {
            var searchValue = normalizeCode(searchInput.value).toLowerCase();
            var statusValue = statusFilter.value;

            return mergedRows.filter((row) => {
                var matchesSearch = rowMatchesSearch(row, searchValue);

                if (!matchesSearch) return false;
                return rowMatchesStatus(row, statusValue);
            });
        }

        function renderStockBadge(quantity, stockType) {
            if (quantity > 0) {
                var activeClass = stockType === 'retail'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';

                return \`<span class="inline-flex min-w-[3rem] justify-center px-3 py-1 rounded-full \${activeClass} font-black">\${quantity}</span>\`;
            }

            return '<span class="inline-flex justify-center px-3 py-1 rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300 text-xs font-black">Out of Stock</span>';
        }

        function renderStatusBadge(row) {
            var statusClass = row.statusTone === 'linked'
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                : (row.statusTone === 'partial'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                    : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300');

            return \`<span class="inline-flex px-3 py-1 rounded-full text-xs font-black \${statusClass}">\${row.statusText}</span>\`;
        }

        function renderExpandButton(row) {
            if (!row.hasVariants) {
                return '<span class="inline-flex w-8 h-8"></span>';
            }

            var isExpanded = expandedProductIds.has(row.id);
            return \`
                <button
                    type="button"
                    data-toggle-product-id="\${row.id}"
                    class="inline-flex w-8 h-8 items-center justify-center rounded-full border border-brandGold/25 bg-brandGold/10 text-brandGold hover:bg-brandGold hover:text-white transition-all"
                    aria-expanded="\${isExpanded ? 'true' : 'false'}"
                    title="\${isExpanded ? 'Hide variants' : 'Show variants'}"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 transition-transform \${isExpanded ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            \`;
        }

        function renderVariantRows(row) {
            if (!row.hasVariants || !expandedProductIds.has(row.id)) return '';

            var variantCards = row.variants.map((variant) => {
                var variantStatusClass = variant.linked
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                    : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300';

                return \`
                    <div class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 p-4">
                        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <div class="font-black text-brandBlue dark:text-brandGold">\${variant.name}</div>
                                <div class="mt-2 flex flex-wrap gap-2 text-xs">
                                    <span class="font-mono font-bold bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded-lg">Code: \${variant.code || '-'}</span>
                                    <span class="font-mono text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded-lg">Barcode: \${variant.matchedBarcode}</span>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-3 items-center">
                                \${renderStockBadge(variant.retailStock, 'retail')}
                                \${renderStockBadge(variant.wholesaleStock, 'wholesale')}
                                <span class="inline-flex px-3 py-1 rounded-full text-xs font-black \${variantStatusClass}">\${variant.linked ? 'Linked' : 'Unlinked'}</span>
                            </div>
                        </div>
                    </div>
                \`;
            }).join('');

            return \`
                <tr class="bg-gray-50/70 dark:bg-gray-900/30">
                    <td colspan="7" class="px-4 py-4">
                        <div class="ml-8 rounded-2xl border border-dashed border-brandGold/25 bg-brandGold/5 p-4">
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <div class="text-xs font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Variant Stock Details</div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">\${row.linkedVariantCount}/\${row.variants.length} linked</div>
                            </div>
                            <div class="grid gap-3">\${variantCards}</div>
                        </div>
                    </td>
                </tr>
            \`;
        }

        function renderRows() {
            updateFilterOptionCounts();
            var rows = getFilteredRows();
            updateStats(mergedRows);
            filteredCountText.textContent = String(rows.length);

            if (rows.length === 0) {
                stockTableBody.innerHTML = \`
                    <tr>
                        <td colspan="7" class="px-4 py-16 text-center text-gray-400 font-bold">No products match the current filters.</td>
                    </tr>
                \`;
            } else {
                stockTableBody.innerHTML = rows.map((row) => {
                    return \`
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td class="px-4 py-4 align-top text-left">
                                \${renderExpandButton(row)}
                            </td>
                            <td class="px-4 py-4 align-top text-left">
                                <div class="font-black text-brandBlue dark:text-brandGold">\${row.name}</div>
                                \${row.hasVariants ? \`<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">\${row.variants.length} variants</div>\` : ''}
                            </td>
                            <td class="px-4 py-4 align-top text-left">
                                <span class="font-mono font-bold text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">\${row.code || '-'}</span>
                            </td>
                            <td class="px-4 py-4 align-top text-left">
                                <span class="font-mono text-xs text-gray-500 dark:text-gray-300">\${row.matchedBarcode}</span>
                            </td>
                            <td class="px-4 py-4 align-top text-left">
                                \${renderStockBadge(row.retailStock, 'retail')}
                            </td>
                            <td class="px-4 py-4 align-top text-left">
                                \${renderStockBadge(row.wholesaleStock, 'wholesale')}
                            </td>
                            <td class="px-4 py-4 align-top text-left">
                                \${renderStatusBadge(row)}
                            </td>
                        </tr>
                        \${renderVariantRows(row)}
                    \`;
                }).join('');
            }

            loadingState.classList.add('hidden');
            errorState.classList.add('hidden');
            tableWrapper.classList.remove('hidden');
            lastSyncAt = new Date();
            renderLiveSyncTime();
            ensureLiveSyncClock();
        }

        async function refreshStock(force = false) {
            try {
                if (products.length === 0) return;
                setLoading(true);
                var stockMap = await getStockMap(force);
                mergedRows = buildMergedRows(stockMap);
                renderRows();
            } catch (error) {
                console.error(error);
                setError(error.message || 'An error occurred while loading stock');
            }
        }

        function bindEvents() {
            searchInput.addEventListener('input', renderRows);
            statusFilter.addEventListener('change', renderRows);
            refreshBtn.addEventListener('click', () => refreshStock(true));
            stockTableBody.addEventListener('click', (event) => {
                var toggleButton = event.target.closest('[data-toggle-product-id]');
                if (!toggleButton) return;

                var { toggleProductId } = toggleButton.dataset;
                if (!toggleProductId) return;

                if (expandedProductIds.has(toggleProductId)) expandedProductIds.delete(toggleProductId);
                else expandedProductIds.add(toggleProductId);

                renderRows();
            });
        }

        bindEvents();

        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = 'login.html';
                return;
            }

            var userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) {
                window.location.href = 'index.html';
                return;
            }

            var role = userDoc.data().role;
            if (role !== 'admin' && role !== 'moderator') {
                window.location.href = 'index.html';
                return;
            }

            onSnapshot(collection(db, 'products'), (snapshot) => {
                products = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
                refreshStock(false);
            }, (error) => {
                console.error(error);
                setError('Unable to read website products from Firebase');
            });
        });
    `;
        
        document.body.appendChild(script);
        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, []);

    return (
        <div className="flex-1 flex flex-col w-full" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
    <header class="sticky top-0 z-30 border-b border-gray-200/70 dark:border-gray-800 bg-white/90 dark:bg-darkBg/90 backdrop-blur-xl">
        <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div class="flex items-center gap-3">
                <a href="admin.html" class="w-11 h-11 rounded-full border border-brandGold/30 bg-brandGold/10 text-brandGold flex items-center justify-center hover:bg-brandGold hover:text-white transition-all" title="Back to Admin">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>
                </a>
                <div>
                    <p class="text-[11px] uppercase tracking-[0.35em] text-gray-400">Admin Stock Sync</p>
                    <h1 class="text-2xl md:text-3xl font-black text-brandBlue dark:text-brandGold">Showroom and Warehouse Stock</h1>
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <button id="refreshBtn" class="px-4 py-2 rounded-full bg-brandBlue text-white dark:bg-brandGold dark:text-brandBlue text-sm font-bold hover:opacity-90 transition-all">Refresh Now</button>
                <a href="index.html" class="px-4 py-2 rounded-full border border-brandGold text-brandGold text-sm font-bold hover:bg-brandGold hover:text-white transition-all">Open Website</a>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-6 md:py-10">
        <section class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div class="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                <p class="text-xs text-gray-400 mb-2">Website Products</p>
                <p id="totalProductsStat" class="text-3xl font-black">0</p>
            </div>
            <div class="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                <p class="text-xs text-gray-400 mb-2">Linked Products</p>
                <p id="linkedProductsStat" class="text-3xl font-black text-green-600">0</p>
            </div>
            <div class="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                <p class="text-xs text-gray-400 mb-2">Total Showroom Stock</p>
                <p id="retailStockStat" class="text-3xl font-black text-blue-600">0</p>
            </div>
            <div class="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                <p class="text-xs text-gray-400 mb-2">Total Warehouse Stock</p>
                <p id="wholesaleStockStat" class="text-3xl font-black text-amber-500">0</p>
            </div>
        </section>

        <section class="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-4 md:p-5 shadow-sm mb-6">
            <div class="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                <div class="flex-1 flex flex-col md:flex-row gap-3">
                    <input id="searchInput" type="text" placeholder="Search by name, code, or barcode" class="flex-1 px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-brandGold outline-none">
                    <select id="statusFilter" class="px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-brandGold outline-none">
                        <option value="all" data-label="All Products">All Products</option>
                        <option value="linked" data-label="Linked Only">Linked Only</option>
                        <option value="missing" data-label="Unlinked Only">Unlinked Only</option>
                        <option value="inRetail" data-label="Showroom Has Stock">Showroom Has Stock</option>
                        <option value="outRetail" data-label="Showroom Out of Stock">Showroom Out of Stock</option>
                        <option value="inWholesale" data-label="Warehouse Has Stock">Warehouse Has Stock</option>
                        <option value="outWholesale" data-label="Warehouse Out of Stock">Warehouse Out of Stock</option>
                    </select>
                </div>
                <div class="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                    <div>
                        <span>Matching Products:</span>
                        <span id="filteredCountText" class="font-black text-brandBlue dark:text-brandGold">0</span>
                    </div>
                    <div>
                        <span>Last Sync:</span>
                        <span id="lastSyncText" class="font-bold text-brandBlue dark:text-brandGold">-</span>
                    </div>
                </div>
            </div>
        </section>

        <section class="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div id="loadingState" class="px-6 py-16 text-center text-gray-400">
                <img src="logo.png" alt="Loading" class="w-20 h-20 object-contain mx-auto mb-4 loading-pulse opacity-70">
                <p class="text-sm font-bold">Loading website products and matching them with system stock...</p>
            </div>

            <div id="errorState" class="hidden px-6 py-16 text-center">
                <p id="errorText" class="text-red-500 font-bold"></p>
            </div>

            <div id="tableWrapper" class="hidden overflow-x-auto">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-300">
                        <tr>
                            <th class="px-4 py-4 text-left font-black w-12"></th>
                            <th class="px-4 py-4 text-left font-black">Product</th>
                            <th class="px-4 py-4 text-left font-black">Code</th>
                            <th class="px-4 py-4 text-left font-black">System Barcode</th>
                            <th class="px-4 py-4 text-left font-black">Showroom Stock</th>
                            <th class="px-4 py-4 text-left font-black">Warehouse Stock</th>
                            <th class="px-4 py-4 text-left font-black">Status</th>
                        </tr>
                    </thead>
                    <tbody id="stockTableBody" class="divide-y divide-gray-100 dark:divide-gray-800"></tbody>
                </table>
            </div>
        </section>
    </main>

    
` }} />
    );
}