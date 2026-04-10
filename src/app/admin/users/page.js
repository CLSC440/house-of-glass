'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, onSnapshot, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseTimestamp } from '@/lib/utils/format';
import { adminDeleteUserAccount, adminUpdateUserRole } from '@/lib/account-api';
import { getUserRoleBadgeTone, getUserRoleLabel, MANAGEABLE_USER_ROLES, normalizeUserRole, USER_ROLE_VALUES } from '@/lib/user-roles';

const ROLE_MENU_OPTIONS = MANAGEABLE_USER_ROLES.map((role) => ({
    value: role,
    label: getUserRoleLabel(role)
}));

const USER_ROLE_SORT_PRIORITY = {
    [USER_ROLE_VALUES.ADMIN]: 0,
    [USER_ROLE_VALUES.MODERATOR]: 1,
    [USER_ROLE_VALUES.CST_WHOLESALE]: 2,
    [USER_ROLE_VALUES.CST_RETAIL]: 3
};

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [currentUserRole, setCurrentUserRole] = useState(USER_ROLE_VALUES.MODERATOR);
    const [openRoleMenuId, setOpenRoleMenuId] = useState(null);
    const [savingUserId, setSavingUserId] = useState(null);
    const [deletingUserId, setDeletingUserId] = useState(null);
    const [confirmState, setConfirmState] = useState(null);
    const [toast, setToast] = useState(null);
    const [isNormalizingRetailRoles, setIsNormalizingRetailRoles] = useState(false);
    const [isRebuildingLoginLookup, setIsRebuildingLoginLookup] = useState(false);
    const roleMenuRef = useRef(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setCurrentUserRole(normalizeUserRole(sessionStorage.getItem('userRole')) || USER_ROLE_VALUES.MODERATOR);
        }

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                setCurrentUserRole(USER_ROLE_VALUES.MODERATOR);
                return;
            }

            try {
                const currentUserSnap = await getDoc(doc(db, 'users', currentUser.uid));
                const resolvedRole = normalizeUserRole(currentUserSnap.exists() ? currentUserSnap.data()?.role : '');
                setCurrentUserRole(resolvedRole || USER_ROLE_VALUES.MODERATOR);

                if (typeof window !== 'undefined') {
                    sessionStorage.setItem('userRole', resolvedRole || USER_ROLE_VALUES.MODERATOR);
                    sessionStorage.setItem('isAdmin', resolvedRole === USER_ROLE_VALUES.ADMIN || resolvedRole === USER_ROLE_VALUES.MODERATOR ? 'true' : 'false');
                }
            } catch (error) {
                console.error('Failed to resolve current admin role:', error);
            }
        });

        const q = query(collection(db, 'users'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let usersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            usersData.sort((a, b) => {
                const roleA = normalizeUserRole(a.role);
                const roleB = normalizeUserRole(b.role);

                const rolePriorityA = USER_ROLE_SORT_PRIORITY[roleA] ?? Number.MAX_SAFE_INTEGER;
                const rolePriorityB = USER_ROLE_SORT_PRIORITY[roleB] ?? Number.MAX_SAFE_INTEGER;

                if (rolePriorityA !== rolePriorityB) {
                    return rolePriorityA - rolePriorityB;
                }

                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });
            
            setUsers(usersData);
            setLoading(false);
        });

        return () => {
            unsubscribeAuth();
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        const handlePointerDown = (event) => {
            if (!roleMenuRef.current?.contains(event.target)) {
                setOpenRoleMenuId(null);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, []);

    useEffect(() => {
        if (!toast) return undefined;

        const timeoutId = window.setTimeout(() => setToast(null), 3200);
        return () => window.clearTimeout(timeoutId);
    }, [toast]);

    const showToast = (message, tone = 'success') => {
        setToast({ message, tone });
    };

    const closeConfirm = () => {
        setConfirmState(null);
    };

    const canManageUsers = normalizeUserRole(currentUserRole) === USER_ROLE_VALUES.ADMIN;
    const legacyRetailUsers = users.filter((user) => String(user.role || '').trim().toLowerCase() === 'cst_retail');

    const filteredUsers = useMemo(() => {
        const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
        if (!normalizedQuery) return users;

        return users.filter((user) => {
            const searchValues = [
                user.id,
                user.name,
                user.email,
                user.authEmail,
                user.emailLowercase,
                user.authEmailLowercase,
                user.username,
                user.usernameLowercase,
                user.phone,
                user.role,
                getUserRoleLabel(user.role),
                parseTimestamp(user.createdAt)
            ];

            return searchValues.some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
        });
    }, [searchQuery, users]);

    const normalizeEmailForLookup = (value) => String(value || '').trim().toLowerCase();
    const normalizeUsernameForLookup = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    const normalizePhoneForLookup = (value) => {
        const rawValue = String(value || '').trim();
        const digits = rawValue.replace(/\D/g, '');

        if (/^01[0125]\d{8}$/.test(digits)) return `+20${digits.slice(1)}`;
        if (/^1[0125]\d{8}$/.test(digits)) return `+20${digits}`;
        if (/^20\d{10}$/.test(digits)) return `+${digits}`;
        if (/^\+20\d{10}$/.test(rawValue)) return rawValue;

        return '';
    };

    const handleRebuildLoginLookup = () => {
        if (!auth.currentUser) {
            showToast('Authentication is required.', 'error');
            return;
        }

        if (!canManageUsers) {
            showToast('Only Admin accounts can rebuild login lookup data.', 'error');
            return;
        }

        setConfirmState({
            kind: 'rebuild-login-lookup',
            title: 'Rebuild Login Lookup',
            message: `Create or refresh login lookup entries for ${users.length} user account${users.length === 1 ? '' : 's'}? This enables username and phone login reliably.`,
            confirmLabel: 'Rebuild Lookup',
            tone: 'brand',
            onConfirm: async () => {
                try {
                    setIsRebuildingLoginLookup(true);

                    for (const user of users) {
                        const authEmail = normalizeEmailForLookup(user.authEmail || user.authEmailLowercase || user.email || user.emailLowercase);
                        if (!authEmail) continue;

                        const username = normalizeUsernameForLookup(user.usernameLowercase || user.username);
                        const phone = normalizePhoneForLookup(user.phone);
                        const email = normalizeEmailForLookup(user.emailLowercase || user.email || user.authEmailLowercase || user.authEmail);

                        const lookupEntries = [
                            username ? { id: `username:${username}`, type: 'username', value: username } : null,
                            phone ? { id: `phone:${phone}`, type: 'phone', value: phone } : null,
                            email ? { id: `email:${email}`, type: 'email', value: email } : null
                        ].filter(Boolean);

                        for (const entry of lookupEntries) {
                            await setDoc(doc(db, 'login_lookup', entry.id), {
                                uid: user.id,
                                type: entry.type,
                                value: entry.value,
                                authEmail,
                                updatedAt: serverTimestamp()
                            }, { merge: true });
                        }
                    }

                    setConfirmState(null);
                    showToast('Login lookup rebuilt successfully.', 'success');
                } catch (error) {
                    console.error('Login lookup rebuild failed:', error);
                    showToast(error.message || 'Failed to rebuild login lookup', 'error');
                } finally {
                    setIsRebuildingLoginLookup(false);
                }
            }
        });
    };

    const updateRoleWithFallback = async (userId, newRole) => {
        try {
            await adminUpdateUserRole(auth.currentUser, userId, newRole);
            return;
        } catch (error) {
            const message = String(error?.message || '');
            const canUseClientFallback = /firebase[_ ]service[_ ]account/i.test(message);

            if (!canUseClientFallback) {
                throw error;
            }

            await updateDoc(doc(db, 'users', userId), {
                role: normalizeUserRole(newRole),
                updatedAt: serverTimestamp()
            });
        }
    };

    const executeRoleChange = async (userId, newRole) => {
        const targetUser = users.find((entry) => entry.id === userId);
        const nextRoleLabel = getUserRoleLabel(newRole);

        try {
            setSavingUserId(userId);
            await updateRoleWithFallback(userId, newRole);
            setOpenRoleMenuId(null);
            setConfirmState(null);
            showToast(`Role updated successfully to ${nextRoleLabel}.`, 'success');
        } catch (error) {
            console.error('Error updating role:', error);
            showToast(error.message || 'Failed to update user role', 'error');
            if (targetUser) {
                setOpenRoleMenuId(targetUser.id);
            }
        } finally {
            setSavingUserId(null);
        }
    };

    const handleNormalizeLegacyRetailRoles = () => {
        if (!auth.currentUser) {
            showToast('Authentication is required.', 'error');
            return;
        }

        if (!canManageUsers) {
            showToast('Only Admin accounts can run this migration.', 'error');
            return;
        }

        if (legacyRetailUsers.length === 0) {
            showToast('No legacy cst_retail roles were found.', 'success');
            return;
        }

        setConfirmState({
            kind: 'normalize-retail-roles',
            title: 'Normalize Legacy Retail Roles',
            message: `Convert ${legacyRetailUsers.length} user role${legacyRetailUsers.length === 1 ? '' : 's'} from cst_retail to customer for old-site compatibility?`,
            confirmLabel: 'Run Migration',
            tone: 'brand',
            onConfirm: async () => {
                try {
                    setIsNormalizingRetailRoles(true);

                    for (const user of legacyRetailUsers) {
                        await updateDoc(doc(db, 'users', user.id), {
                            role: USER_ROLE_VALUES.CST_RETAIL,
                            updatedAt: serverTimestamp()
                        });
                    }

                    setConfirmState(null);
                    showToast(`Normalized ${legacyRetailUsers.length} retail role${legacyRetailUsers.length === 1 ? '' : 's'} to customer.`, 'success');
                } catch (error) {
                    console.error('Retail role normalization failed:', error);
                    showToast(error.message || 'Retail role migration failed', 'error');
                } finally {
                    setIsNormalizingRetailRoles(false);
                }
            }
        });
    };

    const handleRoleChange = async (userId, newRole) => {
        if (!auth.currentUser) {
            showToast('Authentication is required.', 'error');
            return;
        }

        if (!canManageUsers) {
            showToast('Only Admin accounts can change user roles.', 'error');
            return;
        }

        const targetUser = users.find((entry) => entry.id === userId);
        const currentRoleLabel = getUserRoleLabel(targetUser?.role);
        const nextRoleLabel = getUserRoleLabel(newRole);

        if (normalizeUserRole(targetUser?.role) === normalizeUserRole(newRole)) {
            setOpenRoleMenuId(null);
            return;
        }

        setConfirmState({
            kind: 'role-change',
            title: 'Confirm Role Change',
            message: `Change ${targetUser?.name || 'this user'} from ${currentRoleLabel} to ${nextRoleLabel}?`,
            confirmLabel: 'Confirm Change',
            tone: 'brand',
            onConfirm: () => executeRoleChange(userId, newRole)
        });
    };

    const handleDelete = async (userId) => {
        if (!auth.currentUser) {
            showToast('Authentication is required.', 'error');
            return;
        }

        if (!canManageUsers) {
            showToast('Only Admin accounts can delete users.', 'error');
            return;
        }

        const targetUser = users.find((entry) => entry.id === userId);
        setConfirmState({
            kind: 'delete-user',
            title: 'Confirm User Deletion',
            message: `Delete ${targetUser?.name || 'this user'} permanently? This action cannot be undone.`,
            confirmLabel: 'Delete User',
            tone: 'danger',
            onConfirm: async () => {
                try {
                    setDeletingUserId(userId);
                    await adminDeleteUserAccount(auth.currentUser, userId);
                    setConfirmState(null);
                    showToast('User deleted successfully.', 'success');
                } catch (error) {
                    console.error('Error deleting user:', error);
                    showToast(error.message || 'Failed to delete user', 'error');
                } finally {
                    setDeletingUserId(null);
                }
            }
        });
    };

    if (loading) return <div className="p-8 text-center">Loading users...</div>;

    return (
        <div className="max-w-7xl mx-auto">
            {toast ? <FloatingToast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} /> : null}
            {confirmState ? (
                <FloatingConfirmDialog
                    title={confirmState.title}
                    message={confirmState.message}
                    confirmLabel={confirmState.confirmLabel}
                    tone={confirmState.tone}
                    busy={confirmState.kind === 'role-change'
                        ? Boolean(savingUserId)
                        : confirmState.kind === 'normalize-retail-roles'
                            ? isNormalizingRetailRoles
                            : confirmState.kind === 'rebuild-login-lookup'
                                ? isRebuildingLoginLookup
                            : Boolean(deletingUserId)}
                    onCancel={closeConfirm}
                    onConfirm={confirmState.onConfirm}
                />
            ) : null}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-brandBlue dark:text-white mb-2">User Management</h1>
                    <p className="text-gray-500 dark:text-gray-400">View registered users and manage their access roles.</p>
                </div>
                {canManageUsers ? (
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleRebuildLoginLookup}
                            disabled={isRebuildingLoginLookup || users.length === 0}
                            className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-black text-sky-300 transition-colors hover:bg-sky-500/18 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <i className={`fa-solid ${isRebuildingLoginLookup ? 'fa-spinner fa-spin' : 'fa-key'}`}></i>
                            Rebuild Login Lookup
                        </button>
                        {legacyRetailUsers.length > 0 ? (
                            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-amber-300">
                                {legacyRetailUsers.length} legacy retail role{legacyRetailUsers.length === 1 ? '' : 's'}
                            </span>
                        ) : null}
                        <button
                            type="button"
                            onClick={handleNormalizeLegacyRetailRoles}
                            disabled={isNormalizingRetailRoles || legacyRetailUsers.length === 0}
                            className="inline-flex items-center gap-2 rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2.5 text-sm font-black text-brandGold transition-colors hover:bg-brandGold/18 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <i className={`fa-solid ${isNormalizingRetailRoles ? 'fa-spinner fa-spin' : 'fa-shield-halved'}`}></i>
                            Normalize Retail Roles
                        </button>
                    </div>
                ) : null}
            </div>

            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <label className="relative block w-full lg:max-w-md">
                    <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search by name, email, phone, role, ID..."
                        className="h-12 w-full rounded-[1rem] border border-white/8 bg-[#1a2337] pl-12 pr-4 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/35"
                    />
                </label>

                <div className="inline-flex items-center gap-3 self-start rounded-full border border-brandGold/15 bg-brandGold/8 px-4 py-2 text-sm font-black text-slate-200">
                    <span className="uppercase tracking-[0.2em] text-brandGold">Results</span>
                    <span className="text-slate-300">Showing {filteredUsers.length} of {users.length} users</span>
                </div>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-darkCard overflow-visible">
                <div className="overflow-x-auto overflow-y-visible rounded-3xl">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-500 dark:text-gray-400">
                                <th className="p-4">User</th>
                                <th className="p-4">Email Details</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Joined Date</th>
                                <th className="p-4">Role</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="align-top min-h-[520px]">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-gray-400">{searchQuery.trim() ? 'No users matched your search.' : 'No users found.'}</td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => (
                                    <tr key={user.id} className={`border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20 ${openRoleMenuId === user.id ? 'relative z-20' : 'relative z-0'}`}>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-900 dark:text-white">{user.name || 'Anonymous User'}</div>
                                            <div className="text-xs text-gray-500 font-mono mt-0.5">ID: {user.id.slice(0, 8)}...</div>
                                        </td>
                                        <td className="p-4 text-sm font-medium text-brandBlue dark:text-gray-300">
                                            {user.email || 'No email'}
                                        </td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">
                                            {user.phone || ''}
                                        </td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">
                                            {parseTimestamp(user.createdAt)}
                                        </td>
                                        <td className="p-4">
                                            {normalizeUserRole(currentUserRole) === USER_ROLE_VALUES.ADMIN ? (
                                                <div ref={openRoleMenuId === user.id ? roleMenuRef : null} className="relative inline-flex">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenRoleMenuId((currentValue) => currentValue === user.id ? null : user.id)}
                                                        disabled={savingUserId === user.id}
                                                        className={`inline-flex min-w-[170px] items-center justify-between gap-3 rounded-full border px-4 py-2 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${getUserRoleBadgeTone(user.role)}`}
                                                    >
                                                        <span>{getUserRoleLabel(user.role)}</span>
                                                        <i className={`fa-solid ${savingUserId === user.id ? 'fa-spinner fa-spin' : openRoleMenuId === user.id ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]`}></i>
                                                    </button>

                                                    {openRoleMenuId === user.id ? (
                                                        <div className="absolute left-0 top-[calc(100%+0.55rem)] z-30 min-w-[190px] overflow-hidden rounded-2xl border border-white/10 bg-[#10192d] p-2 shadow-[0_18px_40px_rgba(4,8,20,0.45)] backdrop-blur-xl">
                                                            {ROLE_MENU_OPTIONS.map((option) => {
                                                                const isActive = normalizeUserRole(user.role) === option.value;
                                                                return (
                                                                    <button
                                                                        key={option.value}
                                                                        type="button"
                                                                        onClick={() => handleRoleChange(user.id, option.value)}
                                                                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/6 hover:text-white'}`}
                                                                    >
                                                                        <span>{option.label}</span>
                                                                        {isActive ? <i className="fa-solid fa-check text-[10px] text-brandGold"></i> : null}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-black tracking-wider ${getUserRoleBadgeTone(user.role)}`}>
                                                    {getUserRoleLabel(user.role)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right flex justify-end">
                                            <button 
                                                onClick={() => handleDelete(user.id)}
                                                disabled={!canManageUsers || deletingUserId === user.id}
                                                className={'w-8 h-8 rounded-xl flex items-center justify-center transition-colors ' + (canManageUsers ? 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-gray-50 text-gray-400 cursor-not-allowed dark:bg-gray-800')}
                                                title="Delete User"
                                            >
                                                <i className={`fa-solid ${deletingUserId === user.id ? 'fa-spinner fa-spin' : 'fa-trash'} text-sm`}></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                            {filteredUsers.length > 0 && filteredUsers.length < 6 ? (
                                <tr aria-hidden="true">
                                    <td colSpan="6" className="h-[320px] border-0 p-0"></td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function FloatingToast({ message, tone = 'success', onClose }) {
    const toneClasses = tone === 'error'
        ? 'border-red-400/30 bg-[#2a1117] text-red-200'
        : 'border-emerald-400/30 bg-[#10251a] text-emerald-200';

    return (
        <div className="fixed right-6 top-6 z-[210] w-full max-w-sm">
            <div className={`rounded-[1.4rem] border px-4 py-4 shadow-[0_18px_40px_rgba(4,8,20,0.35)] backdrop-blur-xl ${toneClasses}`}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] opacity-75">{tone === 'error' ? 'Action Failed' : 'Success'}</p>
                        <p className="mt-2 text-sm font-semibold leading-6">{message}</p>
                    </div>
                    <button type="button" onClick={onClose} className="mt-0.5 text-sm opacity-70 transition-opacity hover:opacity-100">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
        </div>
    );
}

function FloatingConfirmDialog({ title, message, confirmLabel, tone = 'brand', busy = false, onCancel, onConfirm }) {
    const confirmClasses = tone === 'danger'
        ? 'border-red-500/30 bg-red-500/15 text-red-200 hover:bg-red-500/22'
        : 'border-brandGold/30 bg-brandGold/12 text-brandGold hover:bg-brandGold/18';

    return (
        <div className="fixed inset-0 z-[205] flex items-center justify-center bg-[#050914]/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[1.8rem] border border-white/10 bg-[#0f1729]/95 p-6 shadow-[0_25px_60px_rgba(4,8,20,0.45)]">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Confirmation</p>
                <h3 className="mt-3 text-2xl font-black text-white">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{message}</p>
                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${confirmClasses}`}
                    >
                        <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : tone === 'danger' ? 'fa-trash' : 'fa-check'}`}></i>
                        {busy ? 'Processing' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}


