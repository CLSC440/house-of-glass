'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAdminAccess } from '@/lib/use-admin-access';

const DEFAULT_SERVER_BASE = 'https://whapp.hg-alshour.online';
const PAIRING_CODE_TTL_MS = 170000;

function buildChatId(numberValue, countryCode) {
    const rawValue = String(numberValue || '').trim();
    if (!rawValue) {
        throw new Error('Phone number is required');
    }

    if (/@c\.us$/i.test(rawValue)) {
        return rawValue;
    }

    const prefix = String(countryCode || '+20').replace(/\D/g, '');
    let digits = rawValue.replace(/\D/g, '');

    if (!digits) {
        throw new Error('Phone number is required');
    }

    if (digits.startsWith(prefix)) {
        return `${digits}@c.us`;
    }

    if (prefix === '20' && digits.startsWith('0')) {
        digits = digits.slice(1);
    }

    return `${prefix}${digits}@c.us`;
}

function buildPairingPhoneNumber(numberValue, countryCode) {
    const prefix = String(countryCode || '+20').replace(/\D/g, '');
    let digits = String(numberValue || '').trim().replace(/\D/g, '');

    if (!digits) {
        throw new Error('Phone number is required');
    }

    if (digits.startsWith(prefix)) {
        return digits;
    }

    if (prefix === '20' && digits.startsWith('0')) {
        digits = digits.slice(1);
    }

    return `${prefix}${digits}`;
}

function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getDotClassName(status) {
    if (status === 'online') return 'bg-emerald-500 shadow-[0_0_0_6px_rgba(34,197,94,0.14)]';
    if (status === 'waiting') return 'bg-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.14)]';
    return 'bg-rose-500 shadow-[0_0_0_6px_rgba(239,68,68,0.12)]';
}

function GlassPanel({ children, className = '' }) {
    return (
        <section className={`rounded-[2rem] border border-brandGold/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,255,255,0.72))] p-6 shadow-[0_22px_60px_rgba(18,25,38,0.08)] backdrop-blur-xl dark:bg-[linear-gradient(135deg,rgba(17,24,39,0.96),rgba(17,24,39,0.84))] dark:shadow-[0_22px_60px_rgba(0,0,0,0.35)] md:p-8 ${className}`}>
            {children}
        </section>
    );
}

function SummaryTile({ label, value }) {
    return (
        <div className="min-w-[120px] rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70">
            <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">{label}</div>
            <div className="mt-2 text-lg font-black text-brandBlue dark:text-white">{value}</div>
        </div>
    );
}

function StatusCard({ label, value, hint, status }) {
    return (
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400">{label}</span>
                <span className={`inline-block h-[0.7rem] w-[0.7rem] rounded-full ${getDotClassName(status)}`} />
            </div>
            <div className="mt-4 text-xl font-black text-brandBlue dark:text-white">{value}</div>
            <p className="mt-2 text-xs text-gray-400">{hint}</p>
        </div>
    );
}

function ResultConsole({ tone = 'text-emerald-300', value, minHeight = 'min-h-[180px]' }) {
    return (
        <pre className={`overflow-auto rounded-[1.5rem] bg-gray-950 p-4 text-xs ${tone} ${minHeight}`}>{value}</pre>
    );
}

function AccessStatePanel({ title, message }) {
    return (
        <div className="mx-auto max-w-xl px-4 py-12 text-center">
            <div className="rounded-[1.75rem] border border-white/10 bg-[#121a2c] p-8 shadow-[0_24px_60px_rgba(3,7,18,0.32)]">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.3em] text-brandGold">Admin Access</p>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">{title}</h2>
                <p className="mt-4 text-sm text-slate-400">{message}</p>
            </div>
        </div>
    );
}

export default function WhatsappServerPage() {
    const { checking, allowed, error } = useAdminAccess({ unauthorizedRedirect: '/admin' });
    const [serverBase, setServerBase] = useState(DEFAULT_SERVER_BASE);
    const [serverBaseInput, setServerBaseInput] = useState(DEFAULT_SERVER_BASE);
    const [authMode, setAuthMode] = useState('qr');
    const [isLogsAutoRefreshEnabled, setIsLogsAutoRefreshEnabled] = useState(true);

    const [healthState, setHealthState] = useState({
        ok: false,
        ready: false,
        hasQr: false,
        sessionVerified: false,
        sessionError: '',
        checkedAt: ''
    });
    const [dashboardValues, setDashboardValues] = useState({
        server: 'Checking',
        session: 'Unknown',
        qr: 'Unknown',
        lastSync: 'Waiting'
    });
    const [qrState, setQrState] = useState({
        image: '',
        title: 'Waiting For QR',
        text: 'Click Reload QR or open the direct QR page if the code has not appeared yet.'
    });
    const [logsState, setLogsState] = useState({
        text: 'Waiting for service logs...',
        source: 'Waiting...',
        updatedAt: 'Waiting',
        lineCount: 0
    });
    const [textForm, setTextForm] = useState({ countryCode: '+20', chatId: '', message: '' });
    const [imageForm, setImageForm] = useState({ countryCode: '+20', chatId: '', url: '', caption: '' });
    const [pairingForm, setPairingForm] = useState({ countryCode: '+20', phoneNumber: '' });
    const [textResult, setTextResult] = useState('Waiting for text test...');
    const [imageResult, setImageResult] = useState('Waiting for image test...');
    const [pairingResult, setPairingResult] = useState('Waiting for pairing code request...');
    const [pairingNormalizedPhone, setPairingNormalizedPhone] = useState('Waiting');
    const [pairingCodeValue, setPairingCodeValue] = useState('Waiting');
    const [pairingCountdown, setPairingCountdown] = useState('Waiting');
    const [pairingCountdownHint, setPairingCountdownHint] = useState('A new countdown will appear after a code is generated.');
    const [pairingExpiresAt, setPairingExpiresAt] = useState(null);

    const directQrLink = useMemo(() => `${serverBase}/qr`, [serverBase]);
    const healthJsonLink = useMemo(() => `${serverBase}/api/health`, [serverBase]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const storedBase = (localStorage.getItem('whatsappServerBase') || DEFAULT_SERVER_BASE).replace(/\/$/, '');
        setServerBase(storedBase);
        setServerBaseInput(storedBase);
    }, []);

    useEffect(() => {
        if (!pairingExpiresAt) return undefined;

        const intervalId = window.setInterval(() => {
            const remainingMs = pairingExpiresAt - Date.now();
            if (remainingMs <= 0) {
                setPairingCountdown('Expired');
                setPairingCountdownHint('This code likely expired. Generate a new code before trying again.');
                setPairingExpiresAt(null);
                window.clearInterval(intervalId);
                return;
            }

            setPairingCountdown(formatCountdown(remainingMs));
            setPairingCountdownHint(`Code expires around ${new Date(pairingExpiresAt).toLocaleTimeString()}.`);
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [pairingExpiresAt]);

    async function fetchJson(url, options) {
        const response = await fetch(url, options);
        const responseText = await response.text();

        let parsedBody = null;
        try {
            parsedBody = responseText ? JSON.parse(responseText) : null;
        } catch {
            parsedBody = { raw: responseText };
        }

        if (!response.ok) {
            throw new Error(parsedBody?.error || parsedBody?.message || parsedBody?.raw || `Request failed: ${response.status}`);
        }

        return parsedBody;
    }

    function updateLastSync() {
        setDashboardValues((currentValue) => ({
            ...currentValue,
            lastSync: new Date().toLocaleTimeString()
        }));
    }

    function resetPairingCountdown(message = 'Waiting', hint = 'A new countdown will appear after a code is generated.') {
        setPairingExpiresAt(null);
        setPairingCountdown(message);
        setPairingCountdownHint(hint);
    }

    function setServerCards(health) {
        const online = Boolean(health?.ok);
        const ready = Boolean(health?.ready);
        const hasQr = Boolean(health?.hasQr);

        setHealthState({
            ok: online,
            ready,
            hasQr,
            sessionVerified: Boolean(health?.sessionVerified),
            sessionError: health?.sessionError || '',
            checkedAt: new Date().toISOString()
        });

        setDashboardValues((currentValue) => ({
            ...currentValue,
            server: online ? 'Online' : 'Offline',
            session: ready ? 'Ready' : 'Waiting',
            qr: hasQr ? 'Live' : (ready ? 'Done' : 'None')
        }));

        if (ready || !hasQr) {
            resetPairingCountdown(
                ready ? 'Linked' : 'Waiting',
                ready
                    ? 'The session is already connected, so the pairing code is no longer needed.'
                    : 'A new countdown will appear after a code is generated.'
            );
        }
    }

    function showQrImage(src) {
        setQrState({
            image: src,
            title: 'QR Available',
            text: 'Scan the QR from Linked Devices in WhatsApp to connect the server.'
        });
    }

    function showQrPlaceholder(title, text) {
        setQrState({ image: '', title, text });
    }

    async function validateSession(base, health) {
        if (!health?.ok || !health?.ready) {
            return health;
        }

        try {
            const chats = await fetchJson(`${base}/api/chats`);
            const isSessionVerified = chats?.success === true && Array.isArray(chats?.chats);
            if (isSessionVerified) {
                return {
                    ...health,
                    sessionVerified: true
                };
            }
        } catch (sessionError) {
            return {
                ...health,
                ready: false,
                hasQr: false,
                sessionVerified: false,
                sessionError: sessionError.message
            };
        }

        return {
            ...health,
            ready: false,
            hasQr: false,
            sessionVerified: false,
            sessionError: 'Session validation failed'
        };
    }

    async function refreshDashboard() {
        try {
            const rawHealth = await fetchJson(`${serverBase}/api/health`);
            const health = await validateSession(serverBase, rawHealth);

            setServerCards(health);
            updateLastSync();

            if (health.hasQr) {
                await refreshQrCode(false);
            } else if (health.ready) {
                showQrPlaceholder('Session Connected', 'The session is linked successfully. If you want to create a new session, clear the auth data on the server or relink it.');
            } else {
                showQrPlaceholder('Waiting For QR', health.sessionError || 'The service is running, but the current session is invalid or needs to be linked again. Try Reload QR.');
            }
        } catch (dashboardError) {
            setServerCards({ ok: false, ready: false, hasQr: false });
            showQrPlaceholder('Server Offline', dashboardError.message);
            setDashboardValues((currentValue) => ({
                ...currentValue,
                server: 'Error',
                session: 'Offline',
                qr: 'Error'
            }));
        }
    }

    async function refreshQrCode(alsoRefreshHealth = true) {
        try {
            const qrResponse = await fetchJson(`${serverBase}/api/qr`);
            if (qrResponse?.qr) {
                showQrImage(qrResponse.qr);
                setHealthState((currentValue) => ({ ...currentValue, hasQr: true }));
                setDashboardValues((currentValue) => ({ ...currentValue, qr: 'Live' }));
                updateLastSync();
                return;
            }

            showQrPlaceholder('QR Missing', 'The API responded without a QR image.');
        } catch (qrError) {
            if (alsoRefreshHealth) {
                await refreshDashboard();
                return;
            }
            showQrPlaceholder('QR Not Available', qrError.message);
        }
    }

    async function refreshLogs() {
        try {
            const logs = await fetchJson(`${serverBase}/api/logs?limit=160`);
            const logText = logs?.text?.trim() || 'No logs yet.';
            setLogsState({
                text: logText,
                source: logs?.source || `${serverBase}/api/logs`,
                updatedAt: logs?.updatedAt ? new Date(logs.updatedAt).toLocaleTimeString() : new Date().toLocaleTimeString(),
                lineCount: Number(logText.split('\n').filter(Boolean).length || logs?.lineCount || 0)
            });
        } catch (logsError) {
            setLogsState({
                text: `Error loading logs: ${logsError.message}`,
                source: `${serverBase}/api/logs`,
                updatedAt: new Date().toLocaleTimeString(),
                lineCount: 0
            });
        }
    }

    async function sendRequest(endpoint, payload, setResult) {
        setResult('Sending...');

        try {
            const result = await fetchJson(`${serverBase}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            setResult(JSON.stringify(result, null, 2));
        } catch (requestError) {
            setResult(`Error: ${requestError.message}`);
        } finally {
            await refreshDashboard();
            await refreshLogs();
        }
    }

    function saveServerBase() {
        const normalizedBase = serverBaseInput.trim().replace(/\/$/, '');
        if (!normalizedBase) return;

        localStorage.setItem('whatsappServerBase', normalizedBase);
        setServerBase(normalizedBase);
        setServerBaseInput(normalizedBase);
    }

    function toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', isDark ? 'true' : 'false');
        localStorage.setItem('autoThemeEnabled', 'false');
        localStorage.setItem('themeOverrideTime', String(Date.now()));
    }

    function openQrPage() {
        window.open(directQrLink, '_blank', 'noopener,noreferrer');
    }

    function fillTextExample() {
        setTextForm({
            countryCode: '+20',
            chatId: '01001234567',
            message: 'test from whatsapp server dashboard'
        });
    }

    function fillImageExample() {
        setImageForm({
            countryCode: '+20',
            chatId: '01001234567',
            url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
            caption: 'test image from dashboard'
        });
    }

    function fillPairingExample() {
        const phoneNumber = buildPairingPhoneNumber('01001234567', '+20');
        setPairingForm({ countryCode: '+20', phoneNumber: '01001234567' });
        setPairingNormalizedPhone(phoneNumber);
        setPairingCodeValue('Waiting');
        setPairingResult('Example number loaded. Click Generate Code to request a pairing code.');
        resetPairingCountdown();
    }

    useEffect(() => {
        if (!allowed || !serverBase) return undefined;

        refreshDashboard();
        refreshLogs();

        const dashboardTimer = window.setInterval(refreshDashboard, 15000);
        return () => window.clearInterval(dashboardTimer);
    }, [allowed, serverBase]);

    useEffect(() => {
        if (!allowed || !serverBase || !isLogsAutoRefreshEnabled) return undefined;

        const logsTimer = window.setInterval(refreshLogs, 5000);
        return () => window.clearInterval(logsTimer);
    }, [allowed, serverBase, isLogsAutoRefreshEnabled]);

    if (checking && !allowed) {
        return (
            <AccessStatePanel
                title="Checking access..."
                message="Please wait while your admin or moderator session is verified."
            />
        );
    }

    if (!allowed) {
        return (
            <AccessStatePanel
                title={error || 'Admin access required'}
                message="You do not have permission to open this page. Redirecting..."
            />
        );
    }

    const healthStatus = healthState.ok ? 'online' : 'offline';
    const sessionStatus = healthState.ready ? 'online' : 'waiting';
    const qrStatus = healthState.hasQr ? 'waiting' : (healthState.ready ? 'online' : 'offline');

    return (
        <div className="min-h-screen overflow-x-hidden bg-white text-brandBlue transition-colors duration-300 dark:bg-[#030712] dark:text-white">
            <header className="sticky top-0 z-50 border-b bg-white dark:border-gray-800 dark:bg-brandBlue">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:h-20">
                    <Link href="/admin" className="group flex items-center gap-3">
                        <img src="/logo.png" alt="Logo" className="h-16 w-auto transition-transform group-hover:scale-105 md:h-20" />
                        <div className="flex flex-col">
                            <span className="text-xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold md:text-2xl">WhatsApp</span>
                            <span className="block text-[8px] font-medium uppercase tracking-[0.2em] text-brandBlue/60 dark:text-brandGold/60 md:text-[10px]">Server Dashboard</span>
                        </div>
                    </Link>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-600 shadow-sm transition-colors hover:text-brandGold dark:bg-[#111827] dark:text-gray-300"
                            aria-label="Toggle theme"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="4" strokeWidth="2" /><path strokeLinecap="round" strokeWidth="2" d="M12 2v2m0 16v2m8-10h2M2 12h2m14.14-7.07l-1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M4.93 4.93l1.41 1.41" /></svg>
                            <svg xmlns="http://www.w3.org/2000/svg" className="hidden h-5 w-5 dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                        </button>
                        <Link href="/admin" className="rounded-full bg-brandBlue px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow-lg dark:bg-brandGold dark:text-brandBlue">
                            Back To Admin
                        </Link>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:py-12">
                <GlassPanel className="relative overflow-hidden">
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-brandGold/10 to-transparent" />
                    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl space-y-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-brandGold">Local WhatsApp Control</p>
                            <h1 className="text-3xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold md:text-5xl">WhatsApp Server</h1>
                            <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400 md:text-base">Monitor the local server status, display the QR code, and test sending messages and images before connecting it to n8n automation.</p>
                        </div>
                        <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-4 lg:w-auto">
                            <SummaryTile label="Server" value={dashboardValues.server} />
                            <SummaryTile label="Session" value={dashboardValues.session} />
                            <SummaryTile label="QR" value={dashboardValues.qr} />
                            <SummaryTile label="Last Sync" value={dashboardValues.lastSync} />
                        </div>
                    </div>
                </GlassPanel>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <GlassPanel className="space-y-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Connection</p>
                                <h2 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold">Server Status</h2>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={refreshDashboard} className="rounded-full border border-brandGold px-4 py-2 text-xs font-black uppercase tracking-widest text-brandGold transition-colors hover:bg-brandGold hover:text-white">Refresh</button>
                                <button type="button" onClick={openQrPage} className="rounded-full bg-brandBlue px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow-lg dark:bg-brandGold dark:text-brandBlue">Open QR Page</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <StatusCard label="API Health" value={healthState.ok ? 'Online' : 'Offline'} hint={<>Reads from <span className="break-all">{serverBase}</span></>} status={healthStatus} />
                            <StatusCard label="WhatsApp" value={healthState.ready ? 'Connected' : 'Waiting'} hint="Ready becomes true after a successful scan." status={sessionStatus} />
                            <StatusCard label="QR Status" value={healthState.hasQr ? 'Available' : (healthState.ready ? 'Hidden' : 'Unavailable')} hint="If QR is hidden and ready is true, the session is already linked." status={qrStatus} />
                        </div>

                        <div className="rounded-[2rem] bg-gradient-to-br from-brandBlue to-slate-900 p-5 text-white shadow-2xl shadow-brandBlue/20 md:p-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-[0.35em] text-white/60">Connection Target</p>
                                    <h3 className="text-xl font-black uppercase italic tracking-tighter">Server Endpoint</h3>
                                    <p className="text-sm text-white/70">You can update this address if the IP changes or if you move the service to another server.</p>
                                </div>
                                <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-[420px]">
                                    <input
                                        type="text"
                                        value={serverBaseInput}
                                        onChange={(event) => setServerBaseInput(event.target.value)}
                                        className="flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/45"
                                        placeholder={DEFAULT_SERVER_BASE}
                                    />
                                    <button type="button" onClick={saveServerBase} className="rounded-2xl bg-brandGold px-5 py-3 text-xs font-black uppercase tracking-widest text-brandBlue shadow-lg">Save</button>
                                </div>
                            </div>
                        </div>
                    </GlassPanel>

                    <GlassPanel className="space-y-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Authentication</p>
                                <h2 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold">Login Options</h2>
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Choose either QR code login or phone-number pairing from the same authentication area.</p>
                            </div>
                            <div className="inline-flex rounded-full border border-brandGold/40 bg-white p-1 dark:bg-gray-900">
                                <button type="button" onClick={() => setAuthMode('qr')} className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest ${authMode === 'qr' ? 'bg-brandBlue text-white dark:bg-brandGold dark:text-brandBlue' : 'text-brandGold'}`}>QR Code</button>
                                <button type="button" onClick={() => setAuthMode('pairing')} className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest ${authMode === 'pairing' ? 'bg-brandBlue text-white dark:bg-brandGold dark:text-brandBlue' : 'text-brandGold'}`}>Phone Number</button>
                            </div>
                        </div>

                        {authMode === 'qr' ? (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Method 1</div>
                                        <h3 className="mt-2 text-lg font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold">Scan QR Code</h3>
                                    </div>
                                    <button type="button" onClick={() => refreshQrCode(true)} className="rounded-full border border-brandGold px-4 py-2 text-xs font-black uppercase tracking-widest text-brandGold transition-colors hover:bg-brandGold hover:text-white">Reload QR</button>
                                </div>

                                <div className="flex min-h-[420px] flex-col items-center justify-center overflow-hidden rounded-[2rem] border border-dashed border-brandGold/35 bg-gray-50/80 p-5 text-center dark:bg-gray-900/60">
                                    {qrState.image ? (
                                        <img src={qrState.image} alt="WhatsApp QR" className="w-full max-w-[320px] rounded-3xl bg-white p-4 shadow-xl shadow-brandBlue/10" />
                                    ) : (
                                        <div className="max-w-sm space-y-3">
                                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brandGold/10 text-brandGold">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3m0 0v3m0-3L3 8m18-3a2 2 0 00-2-2h-3m0 0v3m0-3l5 5M3 19a2 2 0 002 2h3m0 0v-3m0 3l-5-5m18 3a2 2 0 01-2 2h-3m0 0v-3m0 3l5-5" /></svg>
                                            </div>
                                            <h3 className="text-xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold">{qrState.title}</h3>
                                            <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">{qrState.text}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-3 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-2">
                                    <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                                        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Direct QR</div>
                                        <a href={directQrLink} target="_blank" rel="noreferrer" className="break-all transition-colors hover:text-brandGold">{directQrLink}</a>
                                    </div>
                                    <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                                        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Health JSON</div>
                                        <a href={healthJsonLink} target="_blank" rel="noreferrer" className="break-all transition-colors hover:text-brandGold">{healthJsonLink}</a>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 rounded-[2rem] border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                                <div>
                                    <div className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Method 2</div>
                                    <h3 className="mt-2 text-lg font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold">Pair With Phone Number</h3>
                                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Generate a WhatsApp pairing code using your phone number, then enter that code from Linked Devices on your phone.</p>
                                </div>

                                <form
                                    className="space-y-4"
                                    onSubmit={async (event) => {
                                        event.preventDefault();

                                        try {
                                            const phoneNumber = buildPairingPhoneNumber(pairingForm.phoneNumber, pairingForm.countryCode);
                                            setPairingNormalizedPhone(phoneNumber);
                                            setPairingCodeValue('Loading');
                                            setPairingResult('Requesting pairing code...');

                                            const result = await fetchJson(`${serverBase}/api/pairing-code`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ phoneNumber })
                                            });

                                            setPairingCodeValue(result?.code || 'Unavailable');
                                            setPairingResult(JSON.stringify(result, null, 2));

                                            const createdAtMs = Date.parse(result?.createdAt || result?.checkedAt || new Date().toISOString());
                                            setPairingExpiresAt((Number.isFinite(createdAtMs) ? createdAtMs : Date.now()) + PAIRING_CODE_TTL_MS);
                                            await refreshDashboard();
                                            await refreshLogs();
                                        } catch (pairingError) {
                                            setPairingCodeValue('Error');

                                            let errorMessage = `Error: ${pairingError.message}`;
                                            if (pairingError.message.includes('detached Frame') || pairingError.message.includes('execution context was destroyed')) {
                                                errorMessage = 'WhatsApp Web crashed on the server. The API is rebooting to recover the session. Please wait around 15 seconds and try generating the code again.';
                                            }

                                            setPairingResult(errorMessage);
                                            resetPairingCountdown('Error', 'The timer could not be started because the request failed.');
                                            await refreshDashboard();
                                            await refreshLogs();
                                        }
                                    }}
                                >
                                    <div>
                                        <label className="mb-2 block text-sm font-bold">Phone Number</label>
                                        <div className="flex gap-3">
                                            <select value={pairingForm.countryCode} onChange={(event) => setPairingForm((currentValue) => ({ ...currentValue, countryCode: event.target.value }))} className="min-w-[110px] rounded-2xl border border-gray-100 bg-white px-4 py-3 outline-none dark:border-gray-800 dark:bg-gray-950">
                                                <option value="+20">+20 EG</option>
                                                <option value="+1">+1 US</option>
                                            </select>
                                            <input value={pairingForm.phoneNumber} onChange={(event) => setPairingForm((currentValue) => ({ ...currentValue, phoneNumber: event.target.value }))} type="text" inputMode="numeric" className="flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3 outline-none dark:border-gray-800 dark:bg-gray-950" placeholder="01001234567" />
                                        </div>
                                        <p className="mt-2 text-[11px] text-gray-400">Enter only the local number. We will format it for phone-number pairing automatically.</p>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        <button type="submit" className="rounded-2xl bg-brandBlue px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg dark:bg-brandGold dark:text-brandBlue">Generate Code</button>
                                        <button type="button" onClick={fillPairingExample} className="rounded-2xl border border-brandGold px-5 py-3 text-xs font-black uppercase tracking-widest text-brandGold transition-colors hover:bg-brandGold hover:text-white">Load Example</button>
                                    </div>
                                </form>

                                <div className="grid grid-cols-1 gap-3 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-3">
                                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                                        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Formatted Number</div>
                                        <div className="text-sm font-black text-brandBlue dark:text-white">{pairingNormalizedPhone}</div>
                                    </div>
                                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                                        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Generated Code</div>
                                        <div className="break-all text-xl font-black tracking-[0.35em] text-brandBlue dark:text-white">{pairingCodeValue}</div>
                                    </div>
                                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                                        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Expires In</div>
                                        <div className="text-xl font-black text-brandBlue dark:text-white">{pairingCountdown}</div>
                                        <div className="mt-2 text-[11px] text-gray-400">{pairingCountdownHint}</div>
                                    </div>
                                </div>

                                <ResultConsole tone="text-violet-300" value={pairingResult} minHeight="min-h-[140px]" />
                            </div>
                        )}
                    </GlassPanel>
                </section>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
                    <GlassPanel className="space-y-6">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Testing</p>
                            <h2 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold">Send Text Test</h2>
                        </div>

                        <form
                            className="space-y-4"
                            onSubmit={async (event) => {
                                event.preventDefault();
                                await sendRequest('/api/sendText', {
                                    chatId: buildChatId(textForm.chatId, textForm.countryCode),
                                    text: textForm.message
                                }, setTextResult);
                            }}
                        >
                            <div>
                                <label className="mb-2 block text-sm font-bold">Phone Number</label>
                                <div className="flex gap-3">
                                    <select value={textForm.countryCode} onChange={(event) => setTextForm((currentValue) => ({ ...currentValue, countryCode: event.target.value }))} className="min-w-[110px] rounded-2xl border border-gray-100 bg-white px-4 py-3 outline-none dark:border-gray-800 dark:bg-gray-900">
                                        <option value="+20">+20 EG</option>
                                        <option value="+1">+1 US</option>
                                    </select>
                                    <input value={textForm.chatId} onChange={(event) => setTextForm((currentValue) => ({ ...currentValue, chatId: event.target.value }))} type="text" inputMode="numeric" className="flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3 outline-none dark:border-gray-800 dark:bg-gray-900" placeholder="01001234567" />
                                </div>
                                <p className="mt-2 text-[11px] text-gray-400">Enter only the local number. The selected country code and <span className="font-black">@c.us</span> will be added automatically.</p>
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-bold">Message</label>
                                <textarea value={textForm.message} onChange={(event) => setTextForm((currentValue) => ({ ...currentValue, message: event.target.value }))} rows="6" className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 outline-none dark:border-gray-800 dark:bg-gray-900" placeholder="test from whatsapp server dashboard" />
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button type="submit" className="rounded-2xl bg-brandBlue px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg dark:bg-brandGold dark:text-brandBlue">Send Text</button>
                                <button type="button" onClick={fillTextExample} className="rounded-2xl border border-brandGold px-5 py-3 text-xs font-black uppercase tracking-widest text-brandGold transition-colors hover:bg-brandGold hover:text-white">Load Example</button>
                            </div>
                        </form>

                        <ResultConsole tone="text-emerald-300" value={textResult} />
                    </GlassPanel>

                    <GlassPanel className="space-y-6">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Testing</p>
                            <h2 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold">Send Image Test</h2>
                        </div>

                        <form
                            className="space-y-4"
                            onSubmit={async (event) => {
                                event.preventDefault();
                                await sendRequest('/api/sendImage', {
                                    chatId: buildChatId(imageForm.chatId, imageForm.countryCode),
                                    file: imageForm.url.trim(),
                                    caption: imageForm.caption
                                }, setImageResult);
                            }}
                        >
                            <div>
                                <label className="mb-2 block text-sm font-bold">Phone Number</label>
                                <div className="flex gap-3">
                                    <select value={imageForm.countryCode} onChange={(event) => setImageForm((currentValue) => ({ ...currentValue, countryCode: event.target.value }))} className="min-w-[110px] rounded-2xl border border-gray-100 bg-white px-4 py-3 outline-none dark:border-gray-800 dark:bg-gray-900">
                                        <option value="+20">+20 EG</option>
                                        <option value="+1">+1 US</option>
                                    </select>
                                    <input value={imageForm.chatId} onChange={(event) => setImageForm((currentValue) => ({ ...currentValue, chatId: event.target.value }))} type="text" inputMode="numeric" className="flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3 outline-none dark:border-gray-800 dark:bg-gray-900" placeholder="01001234567" />
                                </div>
                                <p className="mt-2 text-[11px] text-gray-400">Enter only the local number. The selected country code and <span className="font-black">@c.us</span> will be added automatically.</p>
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-bold">Image URL</label>
                                <input value={imageForm.url} onChange={(event) => setImageForm((currentValue) => ({ ...currentValue, url: event.target.value }))} type="text" className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 outline-none dark:border-gray-800 dark:bg-gray-900" placeholder="https://..." />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-bold">Caption</label>
                                <textarea value={imageForm.caption} onChange={(event) => setImageForm((currentValue) => ({ ...currentValue, caption: event.target.value }))} rows="4" className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 outline-none dark:border-gray-800 dark:bg-gray-900" placeholder="test image from dashboard" />
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button type="submit" className="rounded-2xl bg-brandBlue px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg dark:bg-brandGold dark:text-brandBlue">Send Image</button>
                                <button type="button" onClick={fillImageExample} className="rounded-2xl border border-brandGold px-5 py-3 text-xs font-black uppercase tracking-widest text-brandGold transition-colors hover:bg-brandGold hover:text-white">Load Example</button>
                            </div>
                        </form>

                        <ResultConsole tone="text-cyan-300" value={imageResult} />
                    </GlassPanel>
                </section>

                <GlassPanel className="space-y-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Monitoring</p>
                            <h2 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-brandBlue dark:text-brandGold">Service Logs</h2>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Live view of the latest logs coming from the WhatsApp service on the server.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={refreshLogs} className="rounded-full border border-brandGold px-4 py-2 text-xs font-black uppercase tracking-widest text-brandGold transition-colors hover:bg-brandGold hover:text-white">Refresh Logs</button>
                            <button type="button" onClick={() => setIsLogsAutoRefreshEnabled((currentValue) => !currentValue)} className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest shadow-lg ${isLogsAutoRefreshEnabled ? 'bg-brandBlue text-white dark:bg-brandGold dark:text-brandBlue' : 'border border-brandGold bg-transparent text-brandGold shadow-none'}`}>
                                {isLogsAutoRefreshEnabled ? 'Auto Refresh On' : 'Auto Refresh Off'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-3">
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Log Source</div>
                            <div className="break-all text-xs text-gray-600 dark:text-gray-300">{logsState.source}</div>
                        </div>
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Last Log Update</div>
                            <div className="text-sm font-black text-brandBlue dark:text-white">{logsState.updatedAt}</div>
                        </div>
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-brandGold">Visible Lines</div>
                            <div className="text-sm font-black text-brandBlue dark:text-white">{logsState.lineCount}</div>
                        </div>
                    </div>

                    <ResultConsole tone="text-amber-200" value={logsState.text} minHeight="min-h-[320px] max-h-[560px] whitespace-pre-wrap break-words" />
                </GlassPanel>
            </main>
        </div>
    );
}