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

    const fetchStock = async (force = false) => {
        setIsSyncing(true);
        try {
            // Note: Since this is a static exported frontend, this fetches from the backend serverless function
            // Ensure you migrate '/api/dc/stock' to Next.js API Routes ('src/app/api/dc/stock/route.js') later.
            const res = await fetch('/api/dc/stock' + (force ? '?cache_bypass=true' : ''));
            if (!res.ok) throw new Error('Fetch failed');
            const data = await res.json();
            
            const map = {};
            if (data.data) {
                data.data.forEach(item => {
                    const code = (item.code || item.barcode || '').trim().toLowerCase();
                    if (code) {
                        map[code] = {
                            barcode: item.barcode,
                            retailStock: parseInt(item.retail_qty || 0, 10),
                            wholesaleStock: parseInt(item.wholesale_qty || 0, 10),
                        };
                    }
                });
            }
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

    const normalizeCode = (val) => (val || '').trim().toLowerCase();

    // Map Stock to Products
    const mergedRows = useMemo(() => {
        return allProducts.map(product => {
            const pCode = normalizeCode(product.code);
            const parentStock = pCode ? stockMap[pCode] : null;

            const variants = Array.isArray(product.variants) ? product.variants.map((v, i) => {
                const vCode = normalizeCode(v.code || v.barcode);
                const vStock = vCode ? stockMap[vCode] : null;
                return {
                    id: `${product.id}-v${i}`,
                    name: v.name || `Variant ${i+1}`,
                    code: vCode,
                    matchedBarcode: vStock?.barcode || '-',
                    retailStock: vStock?.retailStock || 0,
                    wholesaleStock: vStock?.wholesaleStock || 0,
                    linked: !!vStock
                };
            }) : [];

            const hasVariants = variants.length > 0;
            
            let retailStock = parentStock ? parentStock.retailStock : 0;
            let wholesaleStock = parentStock ? parentStock.wholesaleStock : 0;
            let isLinked = !!parentStock;

            if (hasVariants) {
                retailStock = variants.reduce((sum, v) => sum + v.retailStock, 0);
                wholesaleStock = variants.reduce((sum, v) => sum + v.wholesaleStock, 0);
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
                variants
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
                            <span>Last Sync: </span>
                            <span className="font-bold text-brandBlue dark:text-brandGold">{lastSyncAt ? lastSyncAt.toLocaleTimeString() : '-'}</span>
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
                                                    <button onClick={() => toggleExpand(row.id)} className="w-8 h-8 rounded-full border border-brandGold/30 bg-brandGold/10 text-brandGold flex items-center justify-center hover:bg-brandGold hover:text-white transition-colors">
                                                        <i className={'fa-solid fa-chevron-right transition-transform ' + (expandedIds.has(row.id) ? 'rotate-90' : '')}></i>
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 font-bold text-brandBlue dark:text-white">
                                                {row.title || row.name}
                                                {row.hasVariants && <span className="ml-2 text-[10px] bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-md text-gray-600 dark:text-gray-300">{row.variants.length} Variants</span>}
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
                                        {row.hasVariants && expandedIds.has(row.id) && row.variants.map((v, idx) => (
                                            <tr key={v.id || idx} className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800/50">
                                                <td className="px-4 py-3 border-l-2 border-brandGold/30"></td>
                                                <td className="px-4 py-3 pl-8 text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                                    <i className="fa-solid fa-turn-up rotate-90 text-gray-300 dark:text-gray-600 text-xs"></i>
                                                    {v.name}
                                                </td>
                                                <td className="px-4 py-3 text-xs font-mono text-gray-500">{v.code || '-'}</td>
                                                <td className="px-4 py-3 text-xs font-mono text-gray-500">{v.matchedBarcode || '-'}</td>
                                                <td className="px-4 py-3">
                                                    {v.retailStock > 0 
                                                        ? <span className="inline-flex min-w-[3rem] justify-center px-3 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 text-xs font-black">{v.retailStock}</span>
                                                        : <span className="inline-flex justify-center px-3 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300 text-[10px] font-black uppercase tracking-wider">Out</span>
                                                    }
                                                </td>
                                                <td className="px-4 py-3 text-gray-400 text-xs text-center">-</td>
                                                <td className="px-4 py-3">
                                                    <span className={'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ' + (v.linked ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400')}>
                                                        {v.linked ? 'Linked' : 'Unlinked'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
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












