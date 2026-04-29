'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRoleDefinitions } from '@/lib/account-api';
import { mergeRoleDefinitions } from '@/lib/user-roles';

const DEFAULT_MERGED_ROLE_DEFINITIONS = mergeRoleDefinitions([]);

export function useRoleDefinitions(currentUser, options = {}) {
    const { enabled = true } = options;
    const [roleDefinitions, setRoleDefinitions] = useState(DEFAULT_MERGED_ROLE_DEFINITIONS);
    const [error, setError] = useState('');
    const [resolvedRequestKey, setResolvedRequestKey] = useState('');
    const [reloadToken, setReloadToken] = useState(0);
    const requestKey = enabled && currentUser ? `${currentUser.uid}:${reloadToken}` : '';

    const refresh = useCallback(() => {
        setReloadToken((currentValue) => currentValue + 1);
    }, []);

    useEffect(() => {
        let isCancelled = false;

        if (!enabled || !currentUser) {
            return undefined;
        }

        getRoleDefinitions(currentUser)
            .then((roles) => {
                if (isCancelled) return;
                setRoleDefinitions(mergeRoleDefinitions(roles));
                setError('');
            })
            .catch((requestError) => {
                if (isCancelled) return;
                setRoleDefinitions(DEFAULT_MERGED_ROLE_DEFINITIONS);
                setError(requestError.message || 'Failed to load roles.');
            })
            .finally(() => {
                if (isCancelled) return;
                setResolvedRequestKey(requestKey);
            });

        return () => {
            isCancelled = true;
        };
    }, [currentUser, enabled, requestKey]);

    const isResolved = requestKey !== '' && resolvedRequestKey === requestKey;

    return {
        roleDefinitions: enabled && currentUser
            ? (isResolved ? roleDefinitions : DEFAULT_MERGED_ROLE_DEFINITIONS)
            : DEFAULT_MERGED_ROLE_DEFINITIONS,
        isLoading: enabled && currentUser ? !isResolved : false,
        error: enabled && currentUser && isResolved ? error : '',
        refresh
    };
}