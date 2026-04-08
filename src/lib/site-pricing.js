import { normalizeUserRole, USER_ROLE_VALUES } from '@/lib/user-roles';

export function parsePercentage(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

export function shouldApplyGlobalRetailIncrease(userRole = '') {
    return normalizeUserRole(userRole) === USER_ROLE_VALUES.CST_RETAIL;
}

export function applyGlobalRetailIncrease(amount, percentage) {
    const numericAmount = Number(amount);
    const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
    const safePercentage = parsePercentage(percentage);

    if (safeAmount <= 0 || safePercentage <= 0) {
        return safeAmount;
    }

    return Math.round((safeAmount * (1 + (safePercentage / 100)) + Number.EPSILON) * 100) / 100;
}

export function getGlobalRetailDisplayPrice(amount, percentage, userRole = '') {
    if (!shouldApplyGlobalRetailIncrease(userRole)) {
        return Number.isFinite(Number(amount)) ? Number(amount) : 0;
    }

    return applyGlobalRetailIncrease(amount, percentage);
}