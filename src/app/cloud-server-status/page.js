'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAdminAccess } from '@/lib/use-admin-access';

function parseNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function parseStructuredValue(value, fallbackValue) {
    if (value === null || value === undefined || value === '') {
        return fallbackValue;
    }

    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return fallbackValue;
        }
    }

    return value;
}

function formatTimestamp(value) {
    if (!value) {
        return new Date().toLocaleString();
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
        return String(value);
    }

    return parsedDate.toLocaleString();
}

function formatPercent(value) {
    const numericValue = parseNumber(value);
    if (numericValue === null) return '--';
    return `${numericValue.toFixed(1)}%`;
}

function formatCpuStatus(value) {
    const numericValue = parseNumber(value);
    if (numericValue === null) return '--';
    if (numericValue < 50) return '(Excellent)';
    if (numericValue < 80) return '(Moderate)';
    return '(High Load)';
}

function formatMetricAmount(value, unit) {
    const numericValue = parseNumber(value);
    if (numericValue === null) return '--';
    return `${numericValue} ${unit}`;
}

function formatUsageText(used, total, unit) {
    const usedValue = formatMetricAmount(used, unit);
    const totalValue = formatMetricAmount(total, unit);

    if (usedValue === '--' || totalValue === '--') {
        return '-- / --';
    }

    return `${usedValue} / ${totalValue}`;
}

function formatDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(parseNumber(totalSeconds) || 0));
    const days = Math.floor(safeSeconds / 86400);
    const hours = Math.floor((safeSeconds % 86400) / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

function timeAgo(dateString) {
    if (!dateString) return 'Waiting...';

    const now = new Date();
    const past = new Date(dateString);
    if (Number.isNaN(past.getTime())) return 'Unknown';

    const diffInMinutes = Math.floor(Math.abs(now - past) / (1000 * 60));
    const hours = Math.floor(diffInMinutes / 60);
    const days = Math.floor(hours / 24);

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (hours < 24) return `${hours}h ${diffInMinutes % 60}m ago`;
    return `${days}d ${hours % 24}h ago`;
}

function normalizeCloudSnapshot(payload) {
    const rawPayload = parseStructuredValue(payload, payload) || {};
    const extendedMetrics = parseStructuredValue(
        rawPayload.extended_metrics ?? rawPayload.extendedMetrics,
        {}
    );
    const syncInfo = parseStructuredValue(extendedMetrics?.sync_info, null);
    const recentActivity = Array.isArray(extendedMetrics?.recent_activity)
        ? extendedMetrics.recent_activity
        : [];
    const topCpu = Array.isArray(extendedMetrics?.top_cpu) ? extendedMetrics.top_cpu : [];
    const topRam = Array.isArray(extendedMetrics?.top_ram) ? extendedMetrics.top_ram : [];

    return {
        raw: rawPayload,
        timestamp: rawPayload.timestamp,
        cpuLoad: parseNumber(rawPayload.cpu_load ?? rawPayload.cpuLoad),
        ramUsedMb: parseNumber(rawPayload.ram_used_mb ?? rawPayload.ramUsedMb),
        ramTotalMb: parseNumber(rawPayload.ram_total_mb ?? rawPayload.ramTotalMb),
        diskUsedGb: parseNumber(rawPayload.disk_used_gb ?? rawPayload.diskUsedGb),
        diskTotalGb: parseNumber(rawPayload.disk_total_gb ?? rawPayload.diskTotalGb),
        network: parseStructuredValue(extendedMetrics?.network, null),
        syncInfo,
        recentActivity,
        topCpu,
        topRam
    };
}

function AccessStatePanel({ title, message }) {
    return (
        <div className="mx-auto max-w-xl px-4 py-12 text-center">
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-darkCard">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.3em] text-[#ff9900]">Admin Only</p>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-[#ff9900]">{title}</h2>
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{message}</p>
            </div>
        </div>
    );
}

function OverviewCard({ title, value, subtitle, progress, barClassName, icon }) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-darkCard">
            <div className="relative z-10 mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>
                <div className="text-[#ff9900]">{icon}</div>
            </div>
            <div className="relative z-10 text-3xl font-black text-brandBlue dark:text-white">{value}</div>
            {subtitle ? <p className="relative z-10 mt-2 text-xs text-gray-400">{subtitle}</p> : null}
            {typeof progress === 'number' ? (
                <div className="relative z-10 mt-4 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                        className={`h-2 rounded-full transition-all duration-500 ${barClassName}`}
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                    />
                </div>
            ) : null}
        </div>
    );
}

function ProcessTable({ title, rows, accentClassName, ramAccentClassName }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-darkCard">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800/50">
                <h3 className="font-bold text-gray-800 dark:text-gray-200">{title}</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-left text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        <tr>
                            <th className="px-6 py-3">PID</th>
                            <th className="px-6 py-3">Name</th>
                            <th className="px-6 py-3">CPU %</th>
                            <th className="px-6 py-3">RAM %</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {rows.length ? rows.map((processItem, index) => (
                            <tr key={`${processItem.pid || 'process'}-${processItem.name || index}-${index}`} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-6 py-3 font-mono text-gray-500">{processItem.pid ?? '--'}</td>
                                <td className="px-6 py-3 font-bold text-gray-800 dark:text-gray-200">{processItem.name || '--'}</td>
                                <td className={`px-6 py-3 font-bold ${accentClassName}`}>{processItem.cpu ?? '--'}%</td>
                                <td className={`px-6 py-3 ${ramAccentClassName}`}>{processItem.ram ?? '--'}%</td>
                            </tr>
                        )) : (
                            <tr>
                                <td className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400" colSpan="4">
                                    No process data available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function CloudServerStatusPage() {
    const { checking, allowed, user, error } = useAdminAccess({
        adminOnly: true,
        unauthorizedRedirect: '/admin'
    });
    const [payload, setPayload] = useState(null);
    const [requestError, setRequestError] = useState('');
    const [lastUpdated, setLastUpdated] = useState('Waiting for data...');
    const [displayUptime, setDisplayUptime] = useState('--:--:--');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const metrics = useMemo(() => normalizeCloudSnapshot(payload), [payload]);

    useEffect(() => {
        const uptimeSeconds = parseNumber(metrics.raw?.uptime_seconds ?? metrics.raw?.uptimeSeconds);

        if (uptimeSeconds === null) {
            setDisplayUptime(metrics.raw?.uptime || '--:--:--');
            return undefined;
        }

        let currentSeconds = uptimeSeconds;
        setDisplayUptime(formatDuration(currentSeconds));

        const intervalId = window.setInterval(() => {
            currentSeconds += 1;
            setDisplayUptime(formatDuration(currentSeconds));
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [metrics.raw]);

    async function fetchServerStatus(currentUser, showLoading = false) {
        if (!currentUser) return;

        if (showLoading) {
            setIsRefreshing(true);
        }

        try {
            const idToken = await currentUser.getIdToken();
            const response = await fetch('/api/server-status', {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${idToken}`
                },
                cache: 'no-store'
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result?.error || 'Network response was not ok');
            }

            setPayload(result);
            setRequestError('');
            setLastUpdated(`Last Updated: ${formatTimestamp(result?.timestamp)}`);
        } catch (fetchError) {
            setRequestError(fetchError.message || 'Failed to reach the cloud server status endpoint');
            setLastUpdated('Fetch failed');
        } finally {
            if (showLoading) {
                setIsRefreshing(false);
            }
        }
    }

    useEffect(() => {
        if (!allowed || !user) return undefined;

        fetchServerStatus(user, true);
        const refreshTimer = window.setInterval(() => {
            fetchServerStatus(user, false);
        }, 30000);

        return () => window.clearInterval(refreshTimer);
    }, [allowed, user]);

    if (checking && !allowed) {
        return (
            <AccessStatePanel
                title="Checking access..."
                message="Please wait while your admin session is verified."
            />
        );
    }

    if (!allowed) {
        return (
            <AccessStatePanel
                title={error || 'Admin access only'}
                message="You do not have permission to open this page. Redirecting..."
            />
        );
    }

    const isHealthy = !requestError;
    const bannerClassName = isHealthy
        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
        : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
    const pulseClassName = isHealthy ? 'bg-green-500' : 'bg-red-500';
    const headingClassName = isHealthy ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400';
    const hasExtendedMetrics = Boolean(
        metrics.syncInfo
        || metrics.recentActivity.length
        || metrics.topCpu.length
        || metrics.topRam.length
        || metrics.network
    );

    const syncInfo = metrics.syncInfo && typeof metrics.syncInfo === 'object' ? metrics.syncInfo : {};
    const network = metrics.network && typeof metrics.network === 'object' ? metrics.network : {};

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800 transition-colors duration-300 dark:bg-darkBg dark:text-gray-200">
            <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-brandBlue">
                <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:h-20">
                    <div className="flex items-center space-x-2 md:space-x-4">
                        <Link href="/admin" className="group flex items-center space-x-2 md:space-x-3">
                            <Image src="/logo.png" alt="Logo" width={96} height={96} className="h-16 w-auto transition-all group-hover:scale-105 md:h-20" />
                            <div className="flex flex-col">
                                <span className="text-xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold md:text-2xl">Admin</span>
                                <span className="block text-[8px] font-medium uppercase tracking-[0.2em] text-brandBlue/60 dark:text-brandGold/60 md:text-[10px]">AWS Cloud Server</span>
                            </div>
                        </Link>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/admin" className="rounded-full bg-brandBlue px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brandGold dark:bg-brandGold dark:text-brandBlue">
                            &larr; Back to Admin
                        </Link>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-8">
                <h1 className="mb-4 text-center text-3xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-[#ff9900]" dir="rtl">
                    Cloud Server Status
                    <span className="mt-2 block text-sm font-arabic font-medium not-italic tracking-normal text-gray-500 dark:text-gray-400">حالة السيرفر السحابي (AWS)</span>
                </h1>

                <div className="mb-8 flex justify-center">
                    <div className="inline-flex gap-1 rounded-xl bg-gray-200 p-1.5 dark:bg-gray-800">
                        <Link href="/server-status" className="rounded-lg px-6 py-2 text-sm font-bold text-gray-500 transition-all hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            Local Server
                        </Link>
                        <span className="pointer-events-none rounded-lg bg-white px-6 py-2 text-sm font-bold text-[#ff9900] shadow-sm dark:bg-darkCard">
                            AWS Server
                        </span>
                    </div>
                </div>

                <div className={`mb-8 flex flex-col gap-4 rounded-2xl border p-6 transition-all md:flex-row md:items-center ${bannerClassName}`}>
                    <div className={`h-4 w-4 flex-shrink-0 rounded-full animate-pulse ${pulseClassName}`} />
                    <div>
                        <h3 className={`text-lg font-bold ${headingClassName}`}>
                            {isHealthy ? 'AWS Connected & Operational' : 'Connection Failed / Server Offline'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{isHealthy ? lastUpdated : 'Fetch failed'}</p>
                    </div>
                    <div className="md:ml-auto">
                        <button
                            type="button"
                            onClick={() => fetchServerStatus(user, true)}
                            className="rounded-xl bg-[#ff9900] px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isRefreshing || !user}
                        >
                            {isRefreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>
                </div>

                <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:mb-12 lg:grid-cols-4">
                    <OverviewCard
                        title="CPU Load"
                        value={formatPercent(metrics.cpuLoad)}
                        subtitle={formatCpuStatus(metrics.cpuLoad)}
                        progress={metrics.cpuLoad ?? undefined}
                        barClassName="bg-[#ff9900]"
                        icon={<svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>}
                    />
                    <OverviewCard
                        title="Memory (RAM)"
                        value={formatUsageText(metrics.ramUsedMb, metrics.ramTotalMb, 'MB')}
                        subtitle={formatPercent(metrics.ramTotalMb ? (metrics.ramUsedMb / metrics.ramTotalMb) * 100 : null) + ' used'}
                        progress={metrics.ramTotalMb ? (metrics.ramUsedMb / metrics.ramTotalMb) * 100 : undefined}
                        barClassName="bg-teal-400"
                        icon={<svg className="h-6 w-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
                    />
                    <OverviewCard
                        title="Disk Storage"
                        value={formatUsageText(metrics.diskUsedGb, metrics.diskTotalGb, 'GB')}
                        subtitle={formatPercent(metrics.diskTotalGb ? (metrics.diskUsedGb / metrics.diskTotalGb) * 100 : null) + ' used'}
                        progress={metrics.diskTotalGb ? (metrics.diskUsedGb / metrics.diskTotalGb) * 100 : undefined}
                        barClassName="bg-rose-500"
                        icon={<svg className="h-6 w-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>}
                    />
                    <OverviewCard
                        title="Network Traffic"
                        value={`${parseNumber(network.rx_kbs) ?? '--'} KB/s`}
                        subtitle={`${parseNumber(network.tx_kbs) ?? '--'} KB/s upload`}
                        barClassName="bg-indigo-500"
                        icon={<svg className="h-6 w-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
                    />
                </div>

                {hasExtendedMetrics ? (
                    <div className="mb-8 grid grid-cols-1 gap-4 md:gap-6 lg:mb-12 lg:grid-cols-2">
                        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-darkCard lg:col-span-2">
                            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800/50">
                                <h3 className="font-bold text-gray-800 dark:text-gray-200">Database Sync Status</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-3">
                                <div className="flex items-center gap-4">
                                    <div className="rounded-xl bg-teal-50 p-3 dark:bg-teal-900/20">
                                        <span className="text-2xl">📄</span>
                                    </div>
                                    <div>
                                        <p className="mb-1 text-xs font-bold text-gray-500">Total Rows</p>
                                        <p className="text-xl font-black text-teal-600 dark:text-teal-400">{syncInfo.total_rows ? Number(syncInfo.total_rows).toLocaleString() : '--'}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="rounded-xl bg-[#ff9900]/10 p-3">
                                        <span className="text-2xl">📦</span>
                                    </div>
                                    <div>
                                        <p className="mb-1 text-xs font-bold text-gray-500">Database Size</p>
                                        <p className="text-xl font-black text-[#ff9900]">{syncInfo.db_size || '--'}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="rounded-xl bg-yellow-50 p-3 dark:bg-yellow-900/20">
                                        <span className="text-2xl">⏱️</span>
                                    </div>
                                    <div>
                                        <p className="mb-1 text-xs font-bold text-gray-500">Last Sync</p>
                                        <p className="text-md font-black text-brandGold">
                                            {metrics.recentActivity[0]?.raw_time ? timeAgo(metrics.recentActivity[0].raw_time) : 'No Sync Yet'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {metrics.recentActivity.length ? (
                                <div className="px-6 pb-6 pt-2">
                                    <h4 className="flex items-center gap-2 border-t border-gray-100 pt-4 text-xs font-bold uppercase tracking-wider text-gray-500 dark:border-gray-800">
                                        Latest Synced Data (Top 20)
                                    </h4>
                                    <div className="custom-scrollbar mt-4 max-h-[400px] space-y-3 overflow-y-auto pr-2">
                                        {metrics.recentActivity.map((activity, index) => {
                                            let borderColor = 'border-gray-300 dark:border-gray-600';
                                            let badgeColor = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';

                                            if (activity.action_type === 'Invoice') {
                                                borderColor = 'border-brandGold';
                                                badgeColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-brandGold';
                                            } else if (activity.action_type === 'Cash In') {
                                                borderColor = 'border-green-500';
                                                badgeColor = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
                                            } else if (activity.action_type) {
                                                borderColor = 'border-rose-500';
                                                badgeColor = 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
                                            }

                                            return (
                                                <div
                                                    key={`${activity.raw_time || activity.time || 'activity'}-${index}`}
                                                    className={`flex flex-col justify-between rounded-xl border-l-4 bg-gray-50 p-3 transition-all hover:shadow-sm dark:bg-gray-800/50 sm:flex-row sm:items-center ${borderColor}`}
                                                >
                                                    <div className="mb-2 flex items-center gap-3 sm:mb-0">
                                                        <span className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${badgeColor}`}>
                                                            {activity.action_type || 'Activity'}
                                                        </span>
                                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{activity.description || 'No description available'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 font-mono text-xs text-gray-500">
                                                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        <span>{activity.time || 'Unknown time'}</span>
                                                        {activity.raw_time ? <span className="text-[10px] text-gray-400">({timeAgo(activity.raw_time)})</span> : null}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <ProcessTable
                            title="Top CPU Processes"
                            rows={metrics.topCpu}
                            accentClassName="text-[#ff9900]"
                            ramAccentClassName="text-gray-500"
                        />
                        <ProcessTable
                            title="Top RAM Processes"
                            rows={metrics.topRam}
                            accentClassName="text-gray-500"
                            ramAccentClassName="font-bold text-teal-400"
                        />
                    </div>
                ) : null}

                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-darkCard">
                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800/50">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">Raw Data Payload</h3>
                    </div>
                    <div className="p-6">
                        <pre className="h-64 overflow-x-auto rounded-xl bg-gray-900 p-4 font-mono text-sm text-[#ff9900]">{JSON.stringify(metrics.raw || { status: 'Loading data...' }, null, 2)}</pre>
                    </div>
                </div>
            </main>
        </div>
    );
}