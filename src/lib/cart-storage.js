export const CART_STORAGE_KEY = 'houseOfGlassCart';
export const WHOLESALE_CART_STORAGE_KEY = 'houseOfGlassWholesaleCart';

function normalizeTitle(item = {}) {
    return item.title || item.name || 'Unnamed Product';
}

function normalizeCartId(item = {}) {
    return item.productId || item.productCode || normalizeTitle(item);
}

function normalizePrice(item = {}, orderType = 'retail') {
    const rawValue = orderType === 'wholesale'
        ? (item.wholesalePrice ?? item.price)
        : (item.price ?? item.wholesalePrice);

    const parsed = Number(rawValue || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeOrderItemsToCartItems(items = [], orderType = 'retail') {
    return items.map((item) => ({
        cartId: normalizeCartId(item),
        productId: item.productId || '',
        productCode: item.productCode || '',
        name: normalizeTitle(item),
        title: normalizeTitle(item),
        category: item.category || '',
        image: item.image || item.imageUrl || '/logo.png',
        price: normalizePrice(item, orderType),
        quantity: Math.max(1, Number(item.quantity) || 1),
        addedAt: Date.now()
    }));
}

function getStorageKey(orderType = 'retail') {
    return orderType === 'wholesale' ? WHOLESALE_CART_STORAGE_KEY : CART_STORAGE_KEY;
}

export function mergeOrderItemsIntoStorage(items = [], orderType = 'retail') {
    if (typeof window === 'undefined') return 0;

    const storageKey = getStorageKey(orderType);
    const normalizedItems = normalizeOrderItemsToCartItems(items, orderType);
    const currentItems = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    const nextItems = [...currentItems];

    normalizedItems.forEach((item) => {
        const existingIndex = nextItems.findIndex((entry) => entry.cartId === item.cartId);
        if (existingIndex >= 0) {
            nextItems[existingIndex] = {
                ...nextItems[existingIndex],
                quantity: (Number(nextItems[existingIndex].quantity) || 0) + item.quantity,
                price: item.price || nextItems[existingIndex].price,
                image: item.image || nextItems[existingIndex].image,
                category: item.category || nextItems[existingIndex].category
            };
            return;
        }

        nextItems.push(item);
    });

    window.localStorage.setItem(storageKey, JSON.stringify(nextItems));
    return normalizedItems.length;
}