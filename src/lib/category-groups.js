const normalizeGroupLabel = (value) => String(value || '').trim();

function normalizeCategoryNames(values = []) {
    const seen = new Set();
    const normalizedValues = [];

    values.forEach((value) => {
        const normalizedValue = normalizeGroupLabel(value);
        const lookupKey = normalizedValue.toLowerCase();

        if (!normalizedValue || seen.has(lookupKey)) {
            return;
        }

        seen.add(lookupKey);
        normalizedValues.push(normalizedValue);
    });

    return normalizedValues;
}

export const CATEGORY_GROUPS_COLLECTION = 'categoryGroups';

export function normalizeCategoryGroupEntry(entry = {}, fallbackOrder = 0) {
    return {
        id: normalizeGroupLabel(entry.id),
        name: normalizeGroupLabel(entry.name),
        order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : fallbackOrder,
        categoryNames: normalizeCategoryNames(entry.categoryNames || entry.categories || [])
    };
}

export function sortCategoryGroupDocs(snapshot) {
    return snapshot.docs
        .map((documentSnapshot, index) => normalizeCategoryGroupEntry({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
        }, index))
        .filter((entry) => entry.name)
        .sort((leftEntry, rightEntry) => leftEntry.order - rightEntry.order || leftEntry.name.localeCompare(rightEntry.name));
}

export function buildGroupedCategoryFacetEntries(categoryFacetEntries = [], categoryGroups = [], selectedCategoryGroupIds = []) {
    const entryLookup = new Map(
        categoryFacetEntries.map((entry) => [normalizeGroupLabel(entry.label).toLowerCase(), entry])
    );
    const assignedLabels = new Set();
    const selectedGroupIdSet = new Set((selectedCategoryGroupIds || []).map((groupId) => normalizeGroupLabel(groupId)));

    const groupedEntries = categoryGroups
        .map((groupEntry) => {
            const entries = groupEntry.categoryNames
                .map((categoryName) => entryLookup.get(normalizeGroupLabel(categoryName).toLowerCase()))
                .filter(Boolean);

            entries.forEach((entry) => assignedLabels.add(normalizeGroupLabel(entry.label).toLowerCase()));

            return {
                id: groupEntry.id,
                label: groupEntry.name,
                entries,
                categoryNames: entries.map((entry) => entry.label),
                count: entries.reduce((total, entry) => total + (Number(entry.count) || 0), 0),
                hasSelectedEntry: entries.some((entry) => Boolean(entry.selected)),
                selected: selectedGroupIdSet.has(groupEntry.id),
                allSelected: false
            };
        })
        .filter((groupEntry) => groupEntry.entries.length > 0);

    const ungroupedEntries = categoryFacetEntries.filter(
        (entry) => !assignedLabels.has(normalizeGroupLabel(entry.label).toLowerCase())
    );

    return {
        groupedEntries,
        ungroupedEntries
    };
}