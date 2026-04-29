'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { adminDeleteRoleDefinition, adminUpsertRoleDefinition } from '@/lib/account-api';
import { useAdminAccess } from '@/lib/use-admin-access';
import { useRoleDefinitions } from '@/lib/use-role-definitions';
import {
    ROLE_PERMISSION_GROUPS,
    ROLE_PERMISSION_KEYS,
    getDefaultResellerRoleDefinition,
    getUserRoleBadgeTone,
    normalizeRoleKey,
    normalizeRolePermissions
} from '@/lib/user-roles';

function buildRoleFormState(roleDefinition = null) {
    return {
        key: roleDefinition?.key || '',
        label: roleDefinition?.label || '',
        description: roleDefinition?.description || '',
        permissions: normalizeRolePermissions(roleDefinition?.permissions || {})
    };
}

function getPermissionLabel(permissionKey) {
    for (const permissionGroup of ROLE_PERMISSION_GROUPS) {
        const permission = permissionGroup.permissions.find((entry) => entry.key === permissionKey);
        if (permission) return permission.label;
    }

    return permissionKey;
}

function applyPermissionDependencies(currentPermissions, permissionKey, nextValue) {
    const nextPermissions = {
        ...normalizeRolePermissions(currentPermissions),
        [permissionKey]: nextValue === true
    };

    if (permissionKey === ROLE_PERMISSION_KEYS.ACCESS_ADMIN && nextValue !== true) {
        return normalizeRolePermissions({
            [ROLE_PERMISSION_KEYS.ACCESS_ADMIN]: false
        });
    }

    if (nextPermissions[ROLE_PERMISSION_KEYS.MANAGE_USERS]) {
        nextPermissions[ROLE_PERMISSION_KEYS.VIEW_USERS] = true;
        nextPermissions[ROLE_PERMISSION_KEYS.ACCESS_ADMIN] = true;
    }

    if (nextPermissions[ROLE_PERMISSION_KEYS.MANAGE_ROLES]) {
        nextPermissions[ROLE_PERMISSION_KEYS.VIEW_ROLES] = true;
        nextPermissions[ROLE_PERMISSION_KEYS.ACCESS_ADMIN] = true;
    }

    if (nextPermissions[ROLE_PERMISSION_KEYS.VIEW_PRICE_PACK]) {
        nextPermissions[ROLE_PERMISSION_KEYS.VIEW_PRICE_DISCOUNT] = true;
    }

    if (
        nextPermissions[ROLE_PERMISSION_KEYS.VIEW_DASHBOARD]
        || nextPermissions[ROLE_PERMISSION_KEYS.VIEW_PRODUCTS]
        || nextPermissions[ROLE_PERMISSION_KEYS.VIEW_STOCK]
        || nextPermissions[ROLE_PERMISSION_KEYS.VIEW_ORDERS]
        || nextPermissions[ROLE_PERMISSION_KEYS.VIEW_USERS]
        || nextPermissions[ROLE_PERMISSION_KEYS.VIEW_ROLES]
    ) {
        nextPermissions[ROLE_PERMISSION_KEYS.ACCESS_ADMIN] = true;
    }

    return nextPermissions;
}

function getEnabledPermissionLabels(permissions = {}) {
    return Object.entries(normalizeRolePermissions(permissions))
        .filter(([, value]) => value === true)
        .map(([permissionKey]) => getPermissionLabel(permissionKey));
}

export default function AdminRolesPage() {
    const {
        checking: isCheckingAccess,
        allowed: canViewRolesPage,
        user: currentUser,
        permissions: currentPermissions
    } = useAdminAccess({
        requiredPermission: ROLE_PERMISSION_KEYS.VIEW_ROLES,
        unauthorizedRedirect: '/admin'
    });
    const canManageRoles = currentPermissions.manageRoles === true;
    const {
        roleDefinitions,
        isLoading: isLoadingRoleDefinitions,
        error: roleDefinitionsError,
        refresh
    } = useRoleDefinitions(currentUser, { enabled: canViewRolesPage });
    const [selectedRoleKey, setSelectedRoleKey] = useState('');
    const [formState, setFormState] = useState(() => buildRoleFormState(getDefaultResellerRoleDefinition()));
    const [isSavingRole, setIsSavingRole] = useState(false);
    const [deletingRoleKey, setDeletingRoleKey] = useState('');
    const [confirmState, setConfirmState] = useState(null);
    const [toast, setToast] = useState(null);

    const systemRoles = useMemo(() => roleDefinitions.filter((roleDefinition) => roleDefinition.isSystem), [roleDefinitions]);
    const customRoles = useMemo(() => roleDefinitions.filter((roleDefinition) => !roleDefinition.isSystem), [roleDefinitions]);
    const selectedRole = useMemo(() => roleDefinitions.find((roleDefinition) => roleDefinition.key === selectedRoleKey) || null, [roleDefinitions, selectedRoleKey]);

    useEffect(() => {
        if (!selectedRole && customRoles.length > 0) {
            setSelectedRoleKey(customRoles[0].key);
            setFormState(buildRoleFormState(customRoles[0]));
        }
    }, [customRoles, selectedRole]);

    useEffect(() => {
        if (!toast) return undefined;
        const timeoutId = window.setTimeout(() => setToast(null), 3200);
        return () => window.clearTimeout(timeoutId);
    }, [toast]);

    const startNewRole = () => {
        setSelectedRoleKey('');
        setFormState(buildRoleFormState(getDefaultResellerRoleDefinition()));
    };

    const handleEditRole = (roleDefinition) => {
        setSelectedRoleKey(roleDefinition.key);
        setFormState(buildRoleFormState(roleDefinition));
    };

    const handlePermissionToggle = (permissionKey, nextValue) => {
        setFormState((currentValue) => ({
            ...currentValue,
            permissions: applyPermissionDependencies(currentValue.permissions, permissionKey, nextValue)
        }));
    };

    const handleSaveRole = async () => {
        if (!currentUser) {
            setToast({ tone: 'error', message: 'Authentication is required.' });
            return;
        }

        if (!canManageRoles) {
            setToast({ tone: 'error', message: 'Role management permission is required.' });
            return;
        }

        const nextKey = normalizeRoleKey(selectedRoleKey || formState.label || formState.key);
        const nextLabel = String(formState.label || '').trim();

        if (!nextKey) {
            setToast({ tone: 'error', message: 'Role name is required.' });
            return;
        }

        if (!nextLabel) {
            setToast({ tone: 'error', message: 'Role label is required.' });
            return;
        }

        try {
            setIsSavingRole(true);
            await adminUpsertRoleDefinition(currentUser, {
                key: nextKey,
                label: nextLabel,
                description: formState.description,
                permissions: formState.permissions
            });
            await refresh();
            setSelectedRoleKey(nextKey);
            setToast({ tone: 'success', message: `${nextLabel} saved successfully.` });
        } catch (error) {
            console.error('Failed to save role definition:', error);
            setToast({ tone: 'error', message: error.message || 'Failed to save the role.' });
        } finally {
            setIsSavingRole(false);
        }
    };

    const requestDeleteRole = (roleDefinition) => {
        setConfirmState({
            key: roleDefinition.key,
            label: roleDefinition.label,
            message: `Delete ${roleDefinition.label}? Users assigned to this role must be reassigned first.`
        });
    };

    const handleDeleteRole = async () => {
        if (!currentUser || !confirmState?.key) return;

        try {
            setDeletingRoleKey(confirmState.key);
            await adminDeleteRoleDefinition(currentUser, confirmState.key);
            await refresh();
            setToast({ tone: 'success', message: `${confirmState.label} deleted successfully.` });
            setConfirmState(null);

            if (selectedRoleKey === confirmState.key) {
                startNewRole();
            }
        } catch (error) {
            console.error('Failed to delete role definition:', error);
            setToast({ tone: 'error', message: error.message || 'Failed to delete the role.' });
        } finally {
            setDeletingRoleKey('');
        }
    };

    if (isCheckingAccess || isLoadingRoleDefinitions) {
        return <div className="p-8 text-center">Loading roles...</div>;
    }

    if (!canViewRolesPage) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6">
            {toast ? <FloatingToast tone={toast.tone} message={toast.message} onClose={() => setToast(null)} /> : null}
            {confirmState ? (
                <FloatingConfirmDialog
                    title="Delete Role"
                    message={confirmState.message}
                    confirmLabel="Delete Role"
                    busy={deletingRoleKey === confirmState.key}
                    onCancel={() => setConfirmState(null)}
                    onConfirm={handleDeleteRole}
                />
            ) : null}

            <header className="rounded-[1.8rem] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(193,155,78,0.14),transparent_34%),linear-gradient(180deg,rgba(22,31,53,0.98),rgba(13,19,34,0.98))] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Role Controls</p>
                        <h1 className="mt-2.5 text-[2rem] font-black text-brandGold md:text-[2.35rem]">Roles Page</h1>
                        <p className="mt-2 max-w-3xl text-sm text-slate-400">Create custom roles like Reseller, decide which admin pages they can open, and control user-management visibility from one place.</p>
                        {roleDefinitionsError ? <p className="mt-3 text-sm text-amber-300">{roleDefinitionsError}</p> : null}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link href="/admin/users" className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white transition-colors hover:border-brandGold/30 hover:text-brandGold">
                            Back to Users
                        </Link>
                        {canManageRoles ? (
                            <button type="button" onClick={startNewRole} className="inline-flex items-center justify-center gap-2 rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2.5 text-sm font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue">
                                <i className="fa-solid fa-user-plus"></i>
                                New Role
                            </button>
                        ) : null}
                    </div>
                </div>
            </header>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                <section className="space-y-6">
                    <div className="rounded-[1.8rem] border border-white/8 bg-[#0e1628] p-5 shadow-[0_18px_40px_rgba(4,8,20,0.28)]">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brandGold/70">Custom Roles</p>
                                <h2 className="mt-2 text-xl font-black text-white">Editable Roles</h2>
                            </div>
                            <span className="rounded-full border border-brandGold/20 bg-brandGold/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-brandGold">
                                {customRoles.length} role{customRoles.length === 1 ? '' : 's'}
                            </span>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            {customRoles.length === 0 ? (
                                <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400 md:col-span-2">
                                    No custom roles yet. Start with a Reseller role or build your own permission set.
                                </div>
                            ) : customRoles.map((roleDefinition) => {
                                const enabledPermissionLabels = getEnabledPermissionLabels(roleDefinition.permissions);
                                const isSelected = selectedRoleKey === roleDefinition.key;

                                return (
                                    <article key={roleDefinition.key} className={`rounded-[1.4rem] border p-4 transition-colors ${isSelected ? 'border-brandGold/35 bg-brandGold/8' : 'border-white/8 bg-white/[0.03]'}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getUserRoleBadgeTone(roleDefinition.key, roleDefinitions)}`}>
                                                    {roleDefinition.label}
                                                </span>
                                                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Key: {roleDefinition.key}</p>
                                            </div>
                                            <button type="button" onClick={() => handleEditRole(roleDefinition)} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:border-brandGold/30 hover:text-brandGold">
                                                <i className="fa-solid fa-pen"></i>
                                            </button>
                                        </div>

                                        <p className="mt-4 min-h-[48px] text-sm leading-6 text-slate-300">{roleDefinition.description || 'No description yet. Use this role to control admin visibility and management rights.'}</p>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {enabledPermissionLabels.length > 0 ? enabledPermissionLabels.map((label) => (
                                                <span key={label} className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-sky-200">
                                                    {label}
                                                </span>
                                            )) : (
                                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                                                    No admin permissions
                                                </span>
                                            )}
                                        </div>

                                        {canManageRoles ? (
                                            <div className="mt-5 flex items-center justify-end gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => requestDeleteRole(roleDefinition)}
                                                    disabled={deletingRoleKey === roleDefinition.key}
                                                    className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-200 transition-colors hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    <i className={`fa-solid ${deletingRoleKey === roleDefinition.key ? 'fa-spinner fa-spin' : 'fa-trash'}`}></i>
                                                    Delete
                                                </button>
                                            </div>
                                        ) : null}
                                    </article>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-[1.8rem] border border-white/8 bg-[#0e1628] p-5 shadow-[0_18px_40px_rgba(4,8,20,0.28)]">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brandGold/70">System Roles</p>
                                <h2 className="mt-2 text-xl font-black text-white">Built-in Roles</h2>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-slate-300">
                                Locked
                            </span>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            {systemRoles.map((roleDefinition) => (
                                <article key={roleDefinition.key} className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4">
                                    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getUserRoleBadgeTone(roleDefinition.key, roleDefinitions)}`}>
                                        {roleDefinition.label}
                                    </span>
                                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Key: {roleDefinition.key}</p>
                                    <p className="mt-4 text-sm leading-6 text-slate-300">{roleDefinition.description}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="rounded-[1.8rem] border border-white/8 bg-[#0e1628] p-5 shadow-[0_18px_40px_rgba(4,8,20,0.28)] xl:sticky xl:top-6 xl:self-start">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brandGold/70">Role Editor</p>
                            <h2 className="mt-2 text-xl font-black text-white">{selectedRole ? `Edit ${selectedRole.label}` : 'Create Role'}</h2>
                        </div>
                        {selectedRole ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                                {selectedRole.key}
                            </span>
                        ) : null}
                    </div>

                    <div className="mt-6 space-y-5">
                        <label className="block space-y-2">
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Role Name</span>
                            <input
                                type="text"
                                value={formState.label}
                                onChange={(event) => setFormState((currentValue) => ({ ...currentValue, label: event.target.value }))}
                                disabled={!canManageRoles}
                                placeholder="Reseller"
                                className="h-12 w-full rounded-[1rem] border border-white/8 bg-[#111b31] px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/35 disabled:cursor-not-allowed disabled:opacity-70"
                            />
                        </label>

                        <label className="block space-y-2">
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Role Key</span>
                            <input
                                type="text"
                                value={normalizeRoleKey(selectedRoleKey || formState.label || formState.key)}
                                readOnly
                                className="h-12 w-full rounded-[1rem] border border-white/8 bg-[#0b1221] px-4 text-sm text-slate-300 outline-none"
                            />
                        </label>

                        <label className="block space-y-2">
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Description</span>
                            <textarea
                                rows={4}
                                value={formState.description}
                                onChange={(event) => setFormState((currentValue) => ({ ...currentValue, description: event.target.value }))}
                                disabled={!canManageRoles}
                                placeholder="Describe what this role can access."
                                className="w-full rounded-[1rem] border border-white/8 bg-[#111b31] px-4 py-3 text-sm leading-6 text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/35 disabled:cursor-not-allowed disabled:opacity-70"
                            />
                        </label>

                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Permissions</p>
                                <p className="mt-2 text-sm text-slate-400">Choose exactly which admin surfaces this role can open or manage.</p>
                            </div>

                            {ROLE_PERMISSION_GROUPS.map((permissionGroup) => (
                                <div key={permissionGroup.id} className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                                    <h3 className="text-sm font-black text-white">{permissionGroup.title}</h3>
                                    <div className="mt-4 space-y-3">
                                        {permissionGroup.permissions.map((permission) => (
                                            <label key={permission.key} className="flex items-start gap-3 rounded-[1rem] border border-white/6 bg-[#111b31] px-4 py-3 text-sm text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={formState.permissions[permission.key] === true}
                                                    onChange={(event) => handlePermissionToggle(permission.key, event.target.checked)}
                                                    disabled={!canManageRoles}
                                                    className="mt-1 h-4 w-4 rounded border-white/15 bg-transparent text-brandGold focus:ring-brandGold/40 disabled:cursor-not-allowed"
                                                />
                                                <span>
                                                    <span className="block font-bold text-white">{permission.label}</span>
                                                    <span className="mt-1 block text-xs leading-5 text-slate-400">{permission.description}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {canManageRoles ? (
                            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={startNewRole}
                                    className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black text-slate-300 transition-colors hover:bg-white/10"
                                >
                                    Reset Form
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveRole}
                                    disabled={isSavingRole}
                                    className="inline-flex items-center gap-2 rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2.5 text-sm font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <i className={`fa-solid ${isSavingRole ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                                    {isSavingRole ? 'Saving' : selectedRole ? 'Update Role' : 'Create Role'}
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-[1.2rem] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                This account can view roles but cannot modify them.
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

function FloatingToast({ tone = 'success', message, onClose }) {
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

function FloatingConfirmDialog({ title, message, confirmLabel, busy = false, onCancel, onConfirm }) {
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
                        className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm font-black text-red-200 transition-colors hover:bg-red-500/22 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-trash'}`}></i>
                        {busy ? 'Processing' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}