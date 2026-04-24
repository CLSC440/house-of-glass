'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAdminAccess } from '@/lib/use-admin-access';

function parseNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function formatPercent(value) {
    const numericValue = parseNumber(value);
    if (numericValue === null) return '--';
    return `${Math.max(0, Math.min(100, Math.round(numericValue)))}%`;
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

function formatResourceAmount(value, unitFallback = 'GB') {
    if (value === null || value === undefined || value === '') return '--';

    if (typeof value === 'string') {
        const trimmedValue = value.trim();
        return trimmedValue || '--';
    }

    const numericValue = parseNumber(value);
    if (numericValue === null) return '--';

    if (numericValue >= 1024) {
        return `${(numericValue / 1024).toFixed(1)} TB`;
    }

    return `${numericValue.toFixed(numericValue >= 10 ? 0 : 1)} ${unitFallback}`;
}

function normalizeResourceBlock(source, fallbackKeys = {}) {
    const objectSource = source && typeof source === 'object' ? source : null;

    const used = objectSource
        ? objectSource.used ?? objectSource.usedGb ?? objectSource.usedGB ?? objectSource.current
        : fallbackKeys.used;
    const total = objectSource
        ? objectSource.total ?? objectSource.totalGb ?? objectSource.totalGB ?? objectSource.capacity
        : fallbackKeys.total;
    const percent = objectSource
        ? objectSource.percent ?? objectSource.usage ?? objectSource.percentage
        : fallbackKeys.percent;

    return {
        used: formatResourceAmount(used),
        total: formatResourceAmount(total),
        percent: parseNumber(percent)
    };
}

function resolveStatusSnapshot(payload) {
    const cpuUsage = parseNumber(
        payload?.cpu?.percent
        ?? payload?.cpu?.usage
        ?? payload?.cpu_usage
        ?? payload?.cpuUsage
        ?? payload?.cpu
    );

    const ram = normalizeResourceBlock(payload?.ram ?? payload?.memory, {
        used: payload?.ram_used,
        total: payload?.ram_total,
        percent: payload?.ram_percent
    });

    const disk = normalizeResourceBlock(payload?.disk ?? payload?.storage, {
        used: payload?.disk_used,
        total: payload?.disk_total,
        percent: payload?.disk_percent
    });

    return {
        cpuUsage,
        ram,
        disk,
        uptimeSeconds: parseNumber(payload?.uptime_seconds ?? payload?.uptimeSeconds),
        uptimeText: payload?.uptime,
        raw: payload
    };
}

function AccessStatePanel({ title, message }) {
    return (
        <div className="mx-auto max-w-xl px-4 py-12 text-center">
            <div className="rounded-[1.75rem] border border-white/10 bg-[#121a2c] p-8 shadow-[0_24px_60px_rgba(3,7,18,0.32)]">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.3em] text-brandGold">Admin Only</p>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">{title}</h2>
                <p className="mt-4 text-sm text-slate-400">{message}</p>
            </div>
        </div>
    );
}

function MetricCard({ title, value, subtitle, progress, accent = 'gold', icon }) {
    const barClassName = accent === 'blue' ? 'bg-brandBlue dark:bg-brandGold' : 'bg-brandGold';

    return (
        <div className="rounded-[1.65rem] border border-white/8 bg-white/95 p-6 shadow-sm dark:bg-[#111827]">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h3>
                <div className="text-brandGold">{icon}</div>
            </div>
            <div className="text-3xl font-black text-brandBlue dark:text-white">{value}</div>
            <p className="mt-2 text-xs text-slate-400">{subtitle}</p>
            {typeof progress === 'number' ? (
                <div className="mt-4 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                        className={`h-2 rounded-full transition-all duration-500 ${barClassName}`}
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                    />
                </div>
            ) : null}
        </div>
    );
}

export default function ServerStatusPage() {
    const { checking, allowed, user, error } = useAdminAccess({
        adminOnly: true,
        unauthorizedRedirect: '/admin'
    });
    const [payload, setPayload] = useState(null);
    const [requestError, setRequestError] = useState('');
    const [lastUpdated, setLastUpdated] = useState('');
    const [displayUptime, setDisplayUptime] = useState('--:--:--');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const metrics = useMemo(() => resolveStatusSnapshot(payload), [payload]);

    useEffect(() => {
        if (metrics.uptimeSeconds === null) {
            setDisplayUptime(metrics.uptimeText || '--:--:--');
            return undefined;
        }

        let currentSeconds = metrics.uptimeSeconds;
        setDisplayUptime(formatDuration(currentSeconds));

        const intervalId = window.setInterval(() => {
            currentSeconds += 1;
            setDisplayUptime(formatDuration(currentSeconds));
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [metrics.uptimeSeconds, metrics.uptimeText]);

    async function fetchServerStatus(currentUser, showLoading = false) {
        if (!currentUser) return;

        if (showLoading) {
            setIsRefreshing(true);
        }

        try {
            const idToken = await currentUser.getIdToken();
            const response = await fetch('/api/local-server-status', {
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
            setLastUpdated(new Date().toLocaleTimeString());
        } catch (fetchError) {
            setRequestError(fetchError.message || 'Could not fetch local server status');
        } finally {
            if (showLoading) {
                setIsRefreshing(false);
            }
        }
    }

    useEffect(() => {
        if (!allowed || !user) return undefined;

        const refreshIfVisible = (showLoading = false) => {
            if (document.visibilityState !== 'visible') {
                return;
            }

            fetchServerStatus(user, showLoading);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchServerStatus(user, false);
            }
        };

        refreshIfVisible(true);
        const refreshTimer = window.setInterval(() => {
            refreshIfVisible(false);
        }, 30000);

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(refreshTimer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
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
    const statusBannerClassName = isHealthy
        ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
        : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400';
    const indicatorClassName = isHealthy ? 'bg-green-500' : 'bg-red-500';

    return (
        <div className="min-h-screen bg-gray-50 text-gray-800 transition-colors duration-300 dark:bg-[#030712] dark:text-gray-200">
            <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-brandBlue">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:h-20">
                    <Link href="/admin" className="group flex items-center gap-3">
                        <img src="/logo.png" alt="Logo" className="h-16 w-auto transition-transform group-hover:scale-105 md:h-20" />
                        <div className="flex flex-col">
                            <span className="text-xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold md:text-2xl">Admin</span>
                            <span className="block text-[8px] font-medium uppercase tracking-[0.2em] text-brandBlue/60 dark:text-brandGold/60 md:text-[10px]">Server Status</span>
                        </div>
                    </Link>

                    <Link href="/admin" className="rounded-full bg-brandBlue px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brandGold dark:bg-brandGold dark:text-brandBlue">
                        Back to Admin
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-8">
                <h1 className="mb-4 text-center text-3xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold" dir="rtl">
                    Local Server Status
                    <span className="mt-2 block text-sm font-medium not-italic tracking-normal text-gray-500 dark:text-gray-400">حالة السيرفر المحلي</span>
                </h1>

                <div className="mb-8 flex justify-center">
                    <div className="inline-flex gap-1 rounded-xl bg-gray-200 p-1.5 dark:bg-gray-800">
                        <span className="pointer-events-none rounded-lg bg-white px-6 py-2 text-sm font-bold text-brandBlue shadow-sm dark:bg-[#111827] dark:text-brandGold">
                            Local Server
                        </span>
                        <Link href="/cloud-server-status" className="rounded-lg px-6 py-2 text-sm font-bold text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            AWS Server
                        </Link>
                    </div>
                </div>

                <div className={`mb-8 flex flex-col gap-4 rounded-[1.6rem] border p-6 transition-all md:flex-row md:items-center ${statusBannerClassName}`}>
                    <div className={`h-4 w-4 flex-shrink-0 rounded-full animate-pulse ${indicatorClassName}`} />
                    <div>
                        <h3 className="text-lg font-bold">{isHealthy ? 'All Systems Operational' : 'Local Server Unavailable'}</h3>
                        <p className="text-sm opacity-80">
                            {isHealthy
                                ? `Last updated: ${lastUpdated || 'just now'}`
                                : requestError}
                        </p>
                    </div>
                    <div className="md:ml-auto">
                        <button
                            type="button"
                            onClick={() => fetchServerStatus(user, true)}
                            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isRefreshing}
                        >
                            {isRefreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>
                </div>

                <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 md:gap-6 lg:mb-12">
                    <MetricCard
                        title="CPU Usage"
                        value={formatPercent(metrics.cpuUsage)}
                        subtitle="Live usage across the local server"
                        progress={metrics.cpuUsage ?? undefined}
                        icon={<svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>}
                    />
                    <MetricCard
                        title="Memory (RAM)"
                        value={`${metrics.ram.used} / ${metrics.ram.total}`}
                        subtitle={metrics.ram.percent === null ? 'Usage unavailable' : `${Math.round(metrics.ram.percent)}% used`}
                        progress={metrics.ram.percent ?? undefined}
                        accent="blue"
                        icon={<svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
                    />
                    <MetricCard
                        title="Disk Storage"
                        value={`${metrics.disk.used} / ${metrics.disk.total}`}
                        subtitle={metrics.disk.percent === null ? 'Usage unavailable' : `${Math.round(metrics.disk.percent)}% used`}
                        progress={metrics.disk.percent ?? undefined}
                        accent="blue"
                        icon={<svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>}
                    />
                    <MetricCard
                        title="Uptime"
                        value={displayUptime}
                        subtitle={isHealthy ? 'Online' : 'Waiting for a healthy response'}
                        icon={<svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    />
                </div>

                <div className="overflow-hidden rounded-[1.8rem] border border-white/8 bg-white shadow-sm dark:bg-[#111827]">
                    <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800/50">
                        <h3 className="font-bold text-brandBlue dark:text-brandGold">Detailed Server Information</h3>
                    </div>
                    <div className="p-6">
                        <pre className="h-64 overflow-x-auto rounded-xl bg-gray-900 p-4 font-mono text-sm text-green-400">{JSON.stringify(metrics.raw || { status: 'Waiting for data...' }, null, 2)}</pre>
                    </div>
                </div>
            </main>
        </div>
    );
}