'use client';
import { useGallery } from '@/contexts/GalleryContext';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

export default function AdminStock() {
    const { allProducts, isLoading: productsLoading } = useGallery();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    
    const [stockMap, setStockMap] = useState({});
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncAt, setLastSyncAt] = useState(null);
    const [expandedIds, setExpandedIds] = useState(new Set());

    const formatLastResponseTimestamp = (value) => {
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
            return '-';
        }

        return value.toLocaleString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const normalizeCode = (val) => String(val || '').trim().toLowerCase();

    const getProductMatchCodes = (product = {}) => {
        return Array.from(new Set([
            product.code,
            product.barcode,
            product.productCode,
            product.sku,
            product.itemCode
        ].map(normalizeCode).filter(Boolean)));
    };

    const normalizeWarehouseName = (name) => String(name || '').replace(/\s+/g, '');

    const getWarehouseBuckets = (item = {}) => {
        let retailStock = 0;
        let wholesaleStock = 0;

        (item.stock_by_warehouse || item.stockByWarehouse || []).forEach((warehouse) => {
            const warehouseId = Number(warehouse?.warehouse_id || warehouse?.warehouseId || 0);
            const normalizedName = normalizeWarehouseName(warehouse?.warehouse_name || warehouse?.warehouseName);
            const quantity = Number(warehouse?.quantity || 0);

            if (warehouseId === 1) {
                retailStock += quantity;
                return;
            }

            if (warehouseId === 2) {
                wholesaleStock += quantity;
                return;
            }

            if (!normalizedName) return;

            if (normalizedName.includes('مخزنالمعرض') || normalizedName.includes('showroom')) {
                retailStock += quantity;
                return;
            }

            if (normalizedName.includes('المخزنالرئيسي') || normalizedName.includes('warehouse')) {
                wholesaleStock += quantity;
            }
        });

        if (retailStock === 0 && wholesaleStock === 0) {
            const totalStock = Number(item.total_stock || item.totalStock || 0);
            if (Number.isFinite(totalStock) && totalStock > 0) {
                wholesaleStock = totalStock;
            }
        }

        return { retailStock, wholesaleStock };
    };

    const getStockItems = (payload) => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.products)) return payload.products;
        if (Array.isArray(payload?.data)) return payload.data;
        return [];
    };

    const fetchStock = async (force = false) => {
        setIsSyncing(true);
        try {
            const requestUrl = new URL('/api/dc/stock', window.location.origin);
            requestUrl.searchParams.set('admin_live', '1');
            requestUrl.searchParams.set('ts', String(Date.now()));

            if (force) {
                requestUrl.searchParams.set('refresh', '1');
            }

            const res = await fetch(requestUrl.toString(), {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, max-age=0',
                    Pragma: 'no-cache'
                }
            });
            if (!res.ok) throw new Error('Fetch failed');
            const data = await res.json();
            
            const map = {};
            getStockItems(data).forEach((item) => {
                const buckets = getWarehouseBuckets(item);
                const stockEntry = {
                    barcode: item.barcode || item.code || '-',
                    retailStock: buckets.retailStock,
                    wholesaleStock: buckets.wholesaleStock,
                    totalStock: Number(item.total_stock || item.totalStock || 0)
                };

                [item.barcode, item.code, item.product_code, item.productCode, item.id]
                    .map(normalizeCode)
                    .filter(Boolean)
                    .forEach((key) => {
                        if (!map[key]) {
                            map[key] = stockEntry;
                        }
                    });
            });

            setStockMap(map);
            setLastSyncAt(new Date());
        } catch (err) {
            console.error('Failed to grab stock:', err);
            // Non-blocking error for preview mode
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        if (!productsLoading && allProducts.length > 0) {
            fetchStock();
        }
    }, [productsLoading, allProducts.length]);

    // Map Stock to Products
    const mergedRows = useMemo(() => {
        return allProducts.map(product => {
            const parentCodes = getProductMatchCodes(product);
            const parentStock = parentCodes.map((code) => stockMap[code]).find(Boolean) || null;

            const variants = Array.isArray(product.variants) ? product.variants.map((v, i) => {
                const variantCodes = getProductMatchCodes(v);
                const vStock = variantCodes.map((code) => stockMap[code]).find(Boolean) || null;
                return {
                    id: `${product.id}-v${i}`,
                    name: v.name || `Variant ${i+1}`,
                    code: variantCodes[0] || '',
                    matchedBarcode: vStock?.barcode || '-',
                    retailStock: vStock?.retailStock || 0,
                    wholesaleStock: vStock?.wholesaleStock || 0,
                    linked: !!vStock
                };
            }) : [];

            const hasVariants = variants.length > 0;
            const uniqueVariantStockRows = [];
            const seenVariantKeys = new Set();

            variants.forEach((variant, index) => {
                const variantKey = variant.code || (variant.linked ? normalizeCode(variant.matchedBarcode) : `${product.id}-variant-${index}`);
                if (!variantKey || seenVariantKeys.has(variantKey)) {
                    return;
                }

                seenVariantKeys.add(variantKey);
                uniqueVariantStockRows.push(variant);
            });
            
            let retailStock = parentStock ? parentStock.retailStock : 0;
            let wholesaleStock = parentStock ? parentStock.wholesaleStock : 0;
            let isLinked = !!parentStock;

            if (hasVariants) {
                retailStock = uniqueVariantStockRows.reduce((sum, v) => sum + v.retailStock, 0);
                wholesaleStock = uniqueVariantStockRows.reduce((sum, v) => sum + v.wholesaleStock, 0);
                isLinked = variants.some(v => v.linked);
            }

            const totalStock = retailStock + wholesaleStock;
            
            let statusTone = 'missing';
            let statusText = 'Unlinked';
            
            if (isLinked) {
                if (hasVariants) {
                    const allLinked = variants.every(v => v.linked);
                    statusTone = allLinked ? 'linked' : 'partial';
                    statusText = allLinked ? 'Linked' : 'Partially Linked';
                } else {
                    statusTone = 'linked';
                    statusText = 'Linked';
                }
            }

            return {
                ...product,
                matchedBarcode: parentStock?.barcode || '-',
                retailStock,
                wholesaleStock,
                totalStock,
                isLinked,
                statusTone,
                statusText,
                hasVariants,
                variants,
                uniqueVariantCodeCount: uniqueVariantStockRows.length,
                hasSharedVariantCode: hasVariants && uniqueVariantStockRows.length < variants.length
            };
        });
    }, [allProducts, stockMap]);

    // Apply Filters
    const filteredRows = useMemo(() => {
        return mergedRows.filter(row => {
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q || 
                (row.name || row.title || '').toLowerCase().includes(q) ||
                (row.code || '').toLowerCase().includes(q) ||
                (row.matchedBarcode || '').toLowerCase().includes(q) ||
                (row.variants || []).some(v => 
                    (v.name || '').toLowerCase().includes(q) || 
                    (v.code || '').toLowerCase().includes(q)
                );
            
            if (!matchesSearch) return false;

            switch(statusFilter) {
                case 'linked': return row.isLinked;
                case 'missing': return !row.isLinked;
                case 'inRetail': return row.retailStock > 0;
                case 'outRetail': return row.retailStock <= 0;
                case 'inWholesale': return row.wholesaleStock > 0;
                case 'outWholesale': return row.wholesaleStock <= 0;
                default: return true;
            }
        });
    }, [mergedRows, searchQuery, statusFilter]);

    // Compute Stats
    const stats = useMemo(() => {
        let totalRetail = 0, totalWholesale = 0, totalLinked = 0;
        mergedRows.forEach(r => {
            if (r.isLinked) totalLinked++;
            totalRetail += r.retailStock;
            totalWholesale += r.wholesaleStock;
        });
        return { totalProducts: mergedRows.length, totalLinked, totalRetail, totalWholesale };
    }, [mergedRows]);

    const toggleExpand = (id) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6 md:space-y-8">       
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-2">
                <div className="flex items-center gap-3">
                    <Link href="/admin" className="w-11 h-11 rounded-full border border-brandGold/30 bg-brandGold/10 text-brandGold flex items-center justify-center hover:bg-brandGold hover:text-white transition-all"> 
                        <i className="fa-solid fa-arrow-left"></i>
                    </Link>
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.35em] text-gray-400">Admin Stock Sync</p>
                        <h1 className="text-2xl md:text-3xl font-black text-brandBlue dark:text-brandGold">Showroom and Warehouse Stock</h1>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => fetchStock(true)} className="px-4 py-2 rounded-full bg-brandBlue text-white dark:bg-brandGold dark:text-brandBlue text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2">
                        <i className={`fa-solid fa-rotate ${isSyncing ? "fa-spin" : ""}`}></i> Refresh Now
                    </button>
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            <span className="h-2 w-2 rounded-full bg-current"></span>
                            Live No-Cache
                        </span>
                    <Link href="/" target="_blank" className="px-4 py-2 rounded-full border border-brandGold text-brandGold text-sm font-bold hover:bg-brandGold hover:text-white transition-all flex items-center gap-2">
                        Open Website <i className="fa-solid fa-external-link text-xs"></i>
                    </Link>
                </div>
            </div>

            {/* Stats Row */}
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <div className="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                    <p className="text-xs text-gray-400 mb-2">Website Products</p>
                    <p className="text-3xl font-black">{stats.totalProducts}</p>
                </div>
                <div className="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                    <p className="text-xs text-gray-400 mb-2">Linked Products</p>
                    <p className="text-3xl font-black text-green-600">{stats.totalLinked}</p>     
                </div>
                <div className="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                    <p className="text-xs text-gray-400 mb-2">Total Showroom Stock</p>
                    <p className="text-3xl font-black text-blue-600">{stats.totalRetail}</p>      
                </div>
                <div className="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                    <p className="text-xs text-gray-400 mb-2">Total Warehouse Stock</p>
                    <p className="text-3xl font-black text-amber-500">{stats.totalWholesale}</p>     
                </div>
            </section>

            {/* Filters Section */}
            <section className="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 p-4 md:p-5 shadow-sm mb-6">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                    <div className="flex-1 flex flex-col md:flex-row gap-3">    
                        <div className="relative flex-1">
                            <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input
                                type="text"
                                placeholder="Search by name, code, or barcode"      
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-brandGold outline-none"  
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}   
                            className="px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-brandGold outline-none"
                        >
                            <option value="all">All Products ({stats.totalProducts})</option>
                            <option value="linked">Linked ({stats.totalLinked})</option>
                            <option value="missing">Unlinked ({stats.totalProducts - stats.totalLinked})</option>      
                            <option value="inRetail">Showroom Has Stock</option>
                            <option value="outRetail">Showroom Out of Stock</option>
                            <option value="inWholesale">Warehouse Has Stock</option>
                            <option value="outWholesale">Warehouse Out of Stock</option>
                        </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                        <div>
                            <span>Matching: </span>
                            <span className="font-black text-brandBlue dark:text-brandGold">{filteredRows.length}</span>
                        </div>
                        <div>
                            <span>Last Response: </span>
                            <span className="font-bold text-brandBlue dark:text-brandGold">{formatLastResponseTimestamp(lastSyncAt)}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Table Section */}
            <section className="rounded-3xl bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-300">
                            <tr>
                                <th className="px-4 py-4 text-left font-black w-12"></th>
                                <th className="px-4 py-4 text-left font-black">Product</th>
                                <th className="px-4 py-4 text-left font-black">Code</th>
                                <th className="px-4 py-4 text-left font-black">Barcode</th>
                                <th className="px-4 py-4 text-left font-black">Showroom</th>
                                <th className="px-4 py-4 text-left font-black">Warehouse</th>
                                <th className="px-4 py-4 text-left font-black">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {productsLoading || isSyncing ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-16 text-center text-gray-400">
                                        <div className="flex flex-col items-center">
                                            <i className="fa-solid fa-spinner fa-spin text-3xl mb-4 text-brandGold"></i>        
                                            <p className="text-sm font-bold">Loading website products and matching them with system stock...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-16 text-center text-gray-400 font-bold">
                                        No products match the current filters.
                                    </td>
                                </tr>
                            ) : (
                                                                filteredRows.map(row => (
                                    <React.Fragment key={row.id}>
                                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                            <td className="px-4 py-4">
                                                {row.hasVariants && (
                                                    <button onClick={() => toggleExpand(row.id)} className="w-10 h-10 rounded-full border-2 border-white/20 bg-gradient-to-b from-white/10 to-black/10 text-brandGold flex items-center justify-center hover:border-brandGold/40 hover:bg-brandGold/10 hover:text-white transition-colors shadow-[0_0_0_3px_rgba(255,255,255,0.06)]">
                                                        <i className={'fa-solid fa-chevron-right transition-transform ' + (expandedIds.has(row.id) ? 'rotate-90' : '')}></i>
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 font-bold text-brandBlue dark:text-white">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span>{row.title || row.name}</span>
                                                    {row.hasVariants ? (
                                                        <>
                                                            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-700/80 dark:text-slate-200">
                                                                {row.variants.length} Variants
                                                            </span>
                                                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${row.hasSharedVariantCode ? 'bg-brandGold/15 text-brandGold' : 'bg-blue-500/10 text-blue-400'}`}>
                                                                {row.hasSharedVariantCode ? 'Shared Code' : `${row.uniqueVariantCodeCount} Codes`}
                                                            </span>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 font-mono text-xs">{row.code || '-'}</td>
                                            <td className="px-4 py-4 font-mono text-xs">{row.matchedBarcode || '-'}</td>
                                            <td className="px-4 py-4">
                                                {row.retailStock > 0
                                                    ? <span className="inline-flex min-w-[3rem] justify-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 font-black">{row.retailStock}</span>
                                                    : <span className="inline-flex justify-center px-3 py-1 rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300 text-xs font-black">Out</span>
                                                }
                                            </td>
                                            <td className="px-4 py-4">
                                                {row.wholesaleStock > 0
                                                    ? <span className="inline-flex min-w-[3rem] justify-center px-3 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 font-black">{row.wholesaleStock}</span>   
                                                    : <span className="inline-flex justify-center px-3 py-1 rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300 text-xs font-black">Out</span>
                                                }
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={'inline-flex px-3 py-1 rounded-full text-xs font-black ' + 
                                                    (row.statusTone === 'linked' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 
                                                    row.statusTone === 'partial' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' : 
                                                    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')
                                                }>
                                                    {row.statusText}
                                                </span>
                                            </td>
                                        </tr>
                                        {row.hasVariants && expandedIds.has(row.id) && (
                                            <tr className="bg-[#121a2d] border-b border-gray-100 dark:border-gray-800/50">
                                                <td colSpan="7" className="px-6 py-5">
                                                    <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.02] p-4 md:p-5">
                                                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brandGold">Variant Breakdown</p>
                                                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                                    {row.hasSharedVariantCode
                                                                        ? 'These variants share the same inventory code, so the parent stock is counted once.'
                                                                        : 'Each variant uses its own inventory code, so parent stock is the total of all variant codes.'}
                                                                </p>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                <span className="rounded-full bg-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-700/80 dark:text-slate-200">
                                                                    {row.variants.length} variants
                                                                </span>
                                                                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${row.hasSharedVariantCode ? 'bg-brandGold/15 text-brandGold' : 'bg-blue-500/10 text-blue-400'}`}>
                                                                    {row.hasSharedVariantCode ? '1 shared inventory code' : `${row.uniqueVariantCodeCount} unique inventory codes`}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="grid gap-3">
                                                            {row.variants.map((v, idx) => (
                                                                <div key={v.id || idx} className="grid gap-3 rounded-[1.15rem] border border-white/8 bg-[#18223a] px-4 py-3 text-sm md:grid-cols-[minmax(0,1.6fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_110px_110px_120px] md:items-center">
                                                                    <div className="flex items-center gap-3 min-w-0">
                                                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-slate-400">
                                                                            <i className="fa-solid fa-code-branch text-xs"></i>
                                                                        </span>
                                                                        <div className="min-w-0">
                                                                            <p className="truncate font-bold text-white">{v.name}</p>
                                                                            <p className="mt-0.5 text-[11px] text-slate-500">Variant {idx + 1}</p>
                                                                        </div>
                                                                    </div>

                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 md:hidden">Code</p>
                                                                        <p className="font-mono text-xs text-slate-300">{v.code || '-'}</p>
                                                                    </div>

                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 md:hidden">Barcode</p>
                                                                        <p className="font-mono text-xs text-slate-400">{v.matchedBarcode || '-'}</p>
                                                                    </div>

                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 md:hidden">Showroom</p>
                                                                        {v.retailStock > 0
                                                                            ? <span className="inline-flex min-w-[3.4rem] justify-center rounded-full bg-blue-500/12 px-3 py-1 text-xs font-black text-blue-400">{v.retailStock}</span>
                                                                            : <span className="inline-flex justify-center rounded-full bg-red-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-300">Out</span>}
                                                                    </div>

                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 md:hidden">Warehouse</p>
                                                                        {v.wholesaleStock > 0
                                                                            ? <span className="inline-flex min-w-[3.4rem] justify-center rounded-full bg-amber-500/12 px-3 py-1 text-xs font-black text-amber-300">{v.wholesaleStock}</span>
                                                                            : <span className="inline-flex justify-center rounded-full bg-red-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-300">Out</span>}
                                                                    </div>

                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 md:hidden">Status</p>
                                                                        <span className={'inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ' + (v.linked ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-slate-400')}>
                                                                            {v.linked ? 'Linked' : 'Unlinked'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}












