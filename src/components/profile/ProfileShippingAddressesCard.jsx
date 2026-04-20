'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteCurrentUserShippingAddress, saveCurrentUserShippingAddress } from '@/lib/account-api';
import { GOVERNORATE_OPTIONS } from '@/lib/shipping-zones';

const MAX_SAVED_SHIPPING_ADDRESSES = 3;

function normalizeDistrictLookupValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064b-\u065f\u0670]/g, '')
        .replace(/[^a-z0-9\u0600-\u06ff\s-]/gi, ' ')
        .replace(/\s+/g, ' ');
}

function createEmptyShippingAddressFields() {
    return {
        recipientName: '',
        recipientPhone: '',
        governorate: '',
        district: '',
        districtId: '',
        cityId: '',
        cityName: '',
        zoneId: '',
        zoneName: '',
        streetName: '',
        houseNumber: '',
        floorNumber: '',
        apartmentNumber: '',
        deliveryInstructions: ''
    };
}

function normalizeSavedShippingAddress(rawAddress = {}) {
    return {
        id: String(rawAddress?.id || '').trim(),
        recipientName: String(rawAddress?.recipientName || '').trim(),
        recipientPhone: String(rawAddress?.recipientPhone || '').trim(),
        governorate: String(rawAddress?.governorate || '').trim(),
        district: String(rawAddress?.district || '').trim(),
        districtId: String(rawAddress?.districtId || '').trim(),
        cityId: String(rawAddress?.cityId || '').trim(),
        cityName: String(rawAddress?.cityName || '').trim(),
        zoneId: String(rawAddress?.zoneId || '').trim(),
        zoneName: String(rawAddress?.zoneName || '').trim(),
        streetName: String(rawAddress?.streetName || '').trim(),
        houseNumber: String(rawAddress?.houseNumber || '').trim(),
        floorNumber: String(rawAddress?.floorNumber || '').trim(),
        apartmentNumber: String(rawAddress?.apartmentNumber || '').trim(),
        deliveryInstructions: String(rawAddress?.deliveryInstructions || '').trim(),
        createdAt: String(rawAddress?.createdAt || '').trim(),
        updatedAt: String(rawAddress?.updatedAt || '').trim()
    };
}

function normalizeSavedShippingAddresses(rawAddresses = []) {
    if (!Array.isArray(rawAddresses)) {
        return [];
    }

    return rawAddresses
        .map(normalizeSavedShippingAddress)
        .filter((address) => address.id && address.governorate && address.district && address.streetName && address.houseNumber);
}

function createShippingAddressFieldsFromSavedAddress(address = {}) {
    const normalizedAddress = normalizeSavedShippingAddress(address);
    return {
        recipientName: normalizedAddress.recipientName,
        recipientPhone: normalizedAddress.recipientPhone,
        governorate: normalizedAddress.governorate,
        district: normalizedAddress.district,
        districtId: normalizedAddress.districtId,
        cityId: normalizedAddress.cityId,
        cityName: normalizedAddress.cityName,
        zoneId: normalizedAddress.zoneId,
        zoneName: normalizedAddress.zoneName,
        streetName: normalizedAddress.streetName,
        houseNumber: normalizedAddress.houseNumber,
        floorNumber: normalizedAddress.floorNumber,
        apartmentNumber: normalizedAddress.apartmentNumber,
        deliveryInstructions: normalizedAddress.deliveryInstructions
    };
}

function buildSavedShippingAddressPayload(fields = {}) {
    return {
        recipientName: String(fields?.recipientName || '').trim(),
        recipientPhone: String(fields?.recipientPhone || '').trim(),
        governorate: String(fields?.governorate || '').trim(),
        district: String(fields?.district || '').trim(),
        districtId: String(fields?.districtId || '').trim(),
        cityId: String(fields?.cityId || '').trim(),
        cityName: String(fields?.cityName || '').trim(),
        zoneId: String(fields?.zoneId || '').trim(),
        zoneName: String(fields?.zoneName || '').trim(),
        streetName: String(fields?.streetName || '').trim(),
        houseNumber: String(fields?.houseNumber || '').trim(),
        floorNumber: String(fields?.floorNumber || '').trim(),
        apartmentNumber: String(fields?.apartmentNumber || '').trim(),
        deliveryInstructions: String(fields?.deliveryInstructions || '').trim()
    };
}

function buildSavedShippingAddressSummary(address = {}) {
    const normalizedAddress = normalizeSavedShippingAddress(address);
    return [
        normalizedAddress.governorate,
        normalizedAddress.district,
        normalizedAddress.streetName,
        normalizedAddress.houseNumber ? `عقار ${normalizedAddress.houseNumber}` : '',
        normalizedAddress.deliveryInstructions
    ].filter(Boolean).join(' | ');
}

function getShippingAddressValidation(fields = {}) {
    if (!String(fields?.governorate || '').trim()) {
        return 'اختر المحافظة أولاً.';
    }

    if (!String(fields?.districtId || '').trim()) {
        return 'اكتب جزءًا من اسم الحي / المنطقة ثم اختر النتيجة المناسبة من SideUp.';
    }

    if (!String(fields?.streetName || '').trim()) {
        return 'اكتب اسم الشارع قبل الحفظ.';
    }

    if (!String(fields?.houseNumber || '').trim()) {
        return 'اكتب رقم العقار / البيت قبل الحفظ.';
    }

    return '';
}

export default function ProfileShippingAddressesCard({ currentUser, profileData, onProfileUpdate }) {
    const [savedShippingAddresses, setSavedShippingAddresses] = useState([]);
    const [defaultShippingAddressId, setDefaultShippingAddressId] = useState('');
    const [selectedShippingAddressId, setSelectedShippingAddressId] = useState('');
    const [shippingAddressFields, setShippingAddressFields] = useState(createEmptyShippingAddressFields);
    const [makeShippingAddressDefault, setMakeShippingAddressDefault] = useState(false);
    const [isCardExpanded, setIsCardExpanded] = useState(false);
    const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
    const [districtOptions, setDistrictOptions] = useState([]);
    const [isLoadingDistrictOptions, setIsLoadingDistrictOptions] = useState(false);
    const [districtOptionsError, setDistrictOptionsError] = useState('');
    const [isDistrictSuggestionsOpen, setIsDistrictSuggestionsOpen] = useState(false);
    const [addressMessage, setAddressMessage] = useState({ type: '', text: '' });
    const [isSavingAddress, setIsSavingAddress] = useState(false);
    const [deletingAddressId, setDeletingAddressId] = useState('');
    const [isGovernorateMenuOpen, setIsGovernorateMenuOpen] = useState(false);
    const governorateDropdownRef = useRef(null);
    const districtAutocompleteRef = useRef(null);

    useEffect(() => {
        const nextAddresses = normalizeSavedShippingAddresses(profileData?.shippingAddresses);
        const nextDefaultShippingAddressId = String(profileData?.defaultShippingAddressId || '').trim();
        const defaultAddress = nextAddresses.find((address) => address.id === nextDefaultShippingAddressId) || nextAddresses[0] || null;

        setSavedShippingAddresses(nextAddresses);
        setDefaultShippingAddressId(nextDefaultShippingAddressId || defaultAddress?.id || '');

        if (defaultAddress) {
            setSelectedShippingAddressId(defaultAddress.id);
            setShippingAddressFields(createShippingAddressFieldsFromSavedAddress(defaultAddress));
            setMakeShippingAddressDefault(defaultAddress.id === (nextDefaultShippingAddressId || defaultAddress.id));
            setIsAddressFormOpen(false);
        } else {
            setSelectedShippingAddressId('');
            setShippingAddressFields(createEmptyShippingAddressFields());
            setMakeShippingAddressDefault(true);
            setIsAddressFormOpen(true);
        }
    }, [profileData]);

    useEffect(() => {
        const selectedGovernorate = String(shippingAddressFields.governorate || '').trim();

        if (!selectedGovernorate) {
            setDistrictOptions([]);
            setDistrictOptionsError('');
            setIsLoadingDistrictOptions(false);
            setIsDistrictSuggestionsOpen(false);
            return undefined;
        }

        const abortController = new AbortController();
        let isCancelled = false;

        const loadDistrictOptions = async () => {
            setIsLoadingDistrictOptions(true);
            setDistrictOptionsError('');

            try {
                const response = await fetch(`/api/integrations/sideup/locations?governorate=${encodeURIComponent(selectedGovernorate)}`, {
                    cache: 'no-store',
                    signal: abortController.signal
                });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok || payload?.ok === false) {
                    throw new Error(payload?.error || 'تعذر تحميل الأحياء / المناطق من SideUp حالياً.');
                }

                if (isCancelled) {
                    return;
                }

                const nextDistrictOptions = Array.isArray(payload?.areas) ? payload.areas : [];
                const cityId = String(payload?.city?.id || '').trim();
                const cityName = String(payload?.city?.name || '').trim();

                setDistrictOptions(nextDistrictOptions);
                setShippingAddressFields((current) => {
                    if (String(current.governorate || '').trim() !== selectedGovernorate) {
                        return current;
                    }

                    const currentDistrictId = String(current.districtId || '').trim();
                    const currentDistrictName = String(current.district || '').trim();
                    const matchedDistrict = nextDistrictOptions.find((option) => (
                        (currentDistrictId && String(option?.areaId || option?.districtId || '').trim() === currentDistrictId)
                        || (currentDistrictName && String(option?.areaName || option?.districtName || '').trim() === currentDistrictName)
                    ));

                    return {
                        ...current,
                        cityId: matchedDistrict ? String(matchedDistrict.cityId || cityId || '').trim() : cityId,
                        cityName: matchedDistrict ? String(matchedDistrict.cityName || cityName || '').trim() : cityName,
                        district: matchedDistrict ? String(matchedDistrict.areaName || matchedDistrict.label || '').trim() : '',
                        districtId: matchedDistrict ? String(matchedDistrict.areaId || '').trim() : '',
                        zoneId: matchedDistrict ? String(matchedDistrict.zoneId || '').trim() : '',
                        zoneName: matchedDistrict ? String(matchedDistrict.zoneName || '').trim() : ''
                    };
                });
            } catch (error) {
                if (abortController.signal.aborted || isCancelled) {
                    return;
                }

                setDistrictOptions([]);
                setDistrictOptionsError(error instanceof Error ? error.message : 'تعذر تحميل الأحياء / المناطق حالياً.');
            } finally {
                if (!isCancelled) {
                    setIsLoadingDistrictOptions(false);
                }
            }
        };

        loadDistrictOptions();

        return () => {
            isCancelled = true;
            abortController.abort();
        };
    }, [shippingAddressFields.governorate]);

    useEffect(() => {
        const handlePointerDownOutsideDropdowns = (event) => {
            if (!districtAutocompleteRef.current?.contains(event.target)) {
                setIsDistrictSuggestionsOpen(false);
            }

            if (!governorateDropdownRef.current?.contains(event.target)) {
                setIsGovernorateMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDownOutsideDropdowns);
        return () => document.removeEventListener('mousedown', handlePointerDownOutsideDropdowns);
    }, []);

    const selectedDistrictOptionId = useMemo(() => {
        const currentDistrictId = String(shippingAddressFields.districtId || '').trim();
        const currentDistrictName = String(shippingAddressFields.district || '').trim();
        return districtOptions.find((option) => (
            (currentDistrictId && String(option?.areaId || option?.districtId || '').trim() === currentDistrictId)
            || (currentDistrictName && String(option?.areaName || option?.districtName || '').trim() === currentDistrictName)
        ))?.optionId || '';
    }, [districtOptions, shippingAddressFields.district, shippingAddressFields.districtId]);

    const filteredDistrictOptions = useMemo(() => {
        const normalizedQuery = normalizeDistrictLookupValue(shippingAddressFields.district);
        if (!normalizedQuery) {
            return districtOptions.slice(0, 12);
        }

        return districtOptions
            .filter((option) => {
                const searchableValues = [
                    option?.label,
                    option?.areaName,
                    option?.districtName,
                    option?.zoneName
                ].map(normalizeDistrictLookupValue).filter(Boolean);

                return searchableValues.some((value) => value.includes(normalizedQuery));
            })
            .slice(0, 12);
    }, [districtOptions, shippingAddressFields.district]);

    const previewAddress = useMemo(() => (
        savedShippingAddresses.find((address) => address.id === defaultShippingAddressId) || savedShippingAddresses[0] || null
    ), [defaultShippingAddressId, savedShippingAddresses]);

    const selectedGovernorateOption = useMemo(() => (
        GOVERNORATE_OPTIONS.find((option) => option.value === shippingAddressFields.governorate) || null
    ), [shippingAddressFields.governorate]);

    const hasReachedAddressLimit = savedShippingAddresses.length >= MAX_SAVED_SHIPPING_ADDRESSES;

    const handleShippingAddressFieldChange = (fieldKey, value) => {
        setShippingAddressFields((current) => ({
            ...current,
            [fieldKey]: value,
            ...(fieldKey === 'governorate'
                ? {
                    district: '',
                    districtId: '',
                    cityId: '',
                    cityName: '',
                    zoneId: '',
                    zoneName: ''
                }
                : {})
        }));

        if (fieldKey === 'governorate') {
            setDistrictOptions([]);
            setDistrictOptionsError('');
            setIsDistrictSuggestionsOpen(false);
            setIsGovernorateMenuOpen(false);
        }

        if (addressMessage.text) {
            setAddressMessage({ type: '', text: '' });
        }
    };

    const handleDistrictInputChange = (value) => {
        setShippingAddressFields((current) => ({
            ...current,
            district: value,
            districtId: '',
            zoneId: '',
            zoneName: ''
        }));
        setIsDistrictSuggestionsOpen(true);

        if (addressMessage.text) {
            setAddressMessage({ type: '', text: '' });
        }
    };

    const handleDistrictSelection = (selectedOptionId) => {
        const nextDistrict = districtOptions.find((option) => String(option?.optionId || '').trim() === String(selectedOptionId || '').trim());

        if (!nextDistrict) {
            return;
        }

        setShippingAddressFields((current) => ({
            ...current,
            district: String(nextDistrict?.areaName || nextDistrict?.districtName || '').trim(),
            districtId: String(nextDistrict?.areaId || nextDistrict?.districtId || '').trim(),
            cityId: String(nextDistrict?.cityId || current.cityId || '').trim(),
            cityName: String(nextDistrict?.cityName || current.cityName || '').trim(),
            zoneId: String(nextDistrict?.zoneId || '').trim(),
            zoneName: String(nextDistrict?.zoneName || '').trim()
        }));
        setIsDistrictSuggestionsOpen(false);

        if (addressMessage.text) {
            setAddressMessage({ type: '', text: '' });
        }
    };

    const handleDistrictInputKeyDown = (event) => {
        if (event.key === 'Enter' && filteredDistrictOptions.length > 0) {
            event.preventDefault();
            handleDistrictSelection(filteredDistrictOptions[0].optionId);
            return;
        }

        if (event.key === 'Escape') {
            setIsDistrictSuggestionsOpen(false);
        }
    };

    const handleAddNewAddress = () => {
        if (savedShippingAddresses.length >= MAX_SAVED_SHIPPING_ADDRESSES) {
            setAddressMessage({ type: 'error', text: `يمكنك حفظ ${MAX_SAVED_SHIPPING_ADDRESSES} عناوين شحن كحد أقصى. احذف عنوانًا أولاً أو عدّل عنوانًا موجودًا.` });
            setIsCardExpanded(true);
            return;
        }

        setSelectedShippingAddressId('');
        setMakeShippingAddressDefault(savedShippingAddresses.length === 0 || !defaultShippingAddressId);
        setShippingAddressFields(createEmptyShippingAddressFields());
        setDistrictOptions([]);
        setDistrictOptionsError('');
        setIsDistrictSuggestionsOpen(false);
        setAddressMessage({ type: '', text: '' });
        setIsCardExpanded(true);
        setIsAddressFormOpen(true);
    };

    const handleDeleteAddress = async (addressId) => {
        if (!currentUser) {
            setAddressMessage({ type: 'error', text: 'سجّل الدخول أولاً لإدارة العناوين.' });
            return;
        }

        if (typeof window !== 'undefined' && !window.confirm('هل تريد حذف هذا العنوان من حسابك؟')) {
            return;
        }

        setDeletingAddressId(addressId);
        setAddressMessage({ type: '', text: '' });

        try {
            const response = await deleteCurrentUserShippingAddress(currentUser, addressId);
            const nextProfile = response?.profile || {};
            const nextSavedShippingAddresses = normalizeSavedShippingAddresses(nextProfile.shippingAddresses);
            const nextDefaultShippingAddressId = String(response?.defaultShippingAddressId || nextProfile.defaultShippingAddressId || '').trim();
            const nextSelectedAddress = nextSavedShippingAddresses.find((address) => address.id === nextDefaultShippingAddressId) || nextSavedShippingAddresses[0] || null;

            setSavedShippingAddresses(nextSavedShippingAddresses);
            setDefaultShippingAddressId(nextDefaultShippingAddressId);
            setSelectedShippingAddressId(nextSelectedAddress?.id || '');
            setMakeShippingAddressDefault(Boolean(nextSelectedAddress?.id && nextSelectedAddress.id === nextDefaultShippingAddressId));
            setShippingAddressFields(nextSelectedAddress ? createShippingAddressFieldsFromSavedAddress(nextSelectedAddress) : createEmptyShippingAddressFields());
            setDistrictOptions([]);
            setDistrictOptionsError('');
            setIsDistrictSuggestionsOpen(false);
            setIsAddressFormOpen(nextSavedShippingAddresses.length === 0);
            setAddressMessage({ type: 'success', text: 'تم حذف العنوان من حسابك.' });
            onProfileUpdate?.(nextProfile);
        } catch (error) {
            setAddressMessage({ type: 'error', text: error instanceof Error ? error.message : 'تعذر حذف العنوان حالياً.' });
        } finally {
            setDeletingAddressId('');
        }
    };

    const handleSelectSavedAddress = (addressId) => {
        const nextAddress = savedShippingAddresses.find((address) => address.id === addressId);
        if (!nextAddress) {
            return;
        }

        setSelectedShippingAddressId(nextAddress.id);
        setMakeShippingAddressDefault(nextAddress.id === defaultShippingAddressId);
        setShippingAddressFields(createShippingAddressFieldsFromSavedAddress(nextAddress));
        setAddressMessage({ type: '', text: '' });
        setIsCardExpanded(true);
        setIsAddressFormOpen(true);
    };

    const handleSaveAddress = async (event) => {
        event.preventDefault();

        if (!currentUser) {
            setAddressMessage({ type: 'error', text: 'سجّل الدخول أولاً لإدارة العناوين.' });
            return;
        }

        const validationError = getShippingAddressValidation(shippingAddressFields);
        if (validationError) {
            setAddressMessage({ type: 'error', text: validationError });
            return;
        }

        if (!selectedShippingAddressId && savedShippingAddresses.length >= MAX_SAVED_SHIPPING_ADDRESSES) {
            setAddressMessage({ type: 'error', text: `يمكنك حفظ ${MAX_SAVED_SHIPPING_ADDRESSES} عناوين شحن كحد أقصى. احذف عنوانًا أولاً أو عدّل عنوانًا موجودًا.` });
            return;
        }

        setIsSavingAddress(true);
        setAddressMessage({ type: '', text: '' });

        try {
            const response = await saveCurrentUserShippingAddress(currentUser, {
                id: selectedShippingAddressId,
                ...buildSavedShippingAddressPayload(shippingAddressFields)
            }, {
                makeDefault: makeShippingAddressDefault,
                defaultAddressId: defaultShippingAddressId
            });

            const nextProfile = response?.profile || {};
            const nextSavedShippingAddresses = normalizeSavedShippingAddresses(nextProfile.shippingAddresses);
            const nextDefaultShippingAddressId = String(response?.defaultShippingAddressId || nextProfile.defaultShippingAddressId || '').trim();
            const persistedAddress = nextSavedShippingAddresses.find((address) => address.id === String(response?.addressId || '').trim()) || nextSavedShippingAddresses[0] || null;

            setSavedShippingAddresses(nextSavedShippingAddresses);
            setDefaultShippingAddressId(nextDefaultShippingAddressId);
            setSelectedShippingAddressId(persistedAddress?.id || '');
            setMakeShippingAddressDefault(Boolean(persistedAddress?.id && persistedAddress.id === nextDefaultShippingAddressId));
            setShippingAddressFields(persistedAddress ? createShippingAddressFieldsFromSavedAddress(persistedAddress) : createEmptyShippingAddressFields());
            setIsAddressFormOpen(false);
            setAddressMessage({ type: 'success', text: 'تم حفظ العنوان في حسابك بنجاح.' });
            onProfileUpdate?.(nextProfile);
        } catch (error) {
            setAddressMessage({ type: 'error', text: error instanceof Error ? error.message : 'تعذر حفظ العنوان حالياً.' });
        } finally {
            setIsSavingAddress(false);
        }
    };

    return (
        <div className="bg-white dark:bg-darkCard rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex items-start justify-between gap-4">
                <button
                    type="button"
                    onClick={() => setIsCardExpanded((currentValue) => !currentValue)}
                    aria-expanded={isCardExpanded}
                    className="flex flex-1 items-center justify-between gap-3 text-left"
                >
                    <h2 className="text-lg font-black text-brandBlue dark:text-white flex items-center gap-2">
                        <i className="fa-solid fa-location-dot text-brandGold"></i> Saved Addresses
                    </h2>
                    <i className={`fa-solid ${isCardExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm text-brandGold transition-transform`}></i>
                </button>
                <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${savedShippingAddresses.length > 0 ? 'bg-brandGold/10 text-brandGold' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'}`}>
                    {savedShippingAddresses.length > 0 ? `${savedShippingAddresses.length} / ${MAX_SAVED_SHIPPING_ADDRESSES} Saved` : 'Ready'}
                </span>
            </div>

            {isCardExpanded ? (
                <>
                    {addressMessage.text ? (
                        <div className={'mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ' + (addressMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-600 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300')}>
                            {addressMessage.text}
                        </div>
                    ) : null}

                    {savedShippingAddresses.length > 0 ? (
                        <div className="mt-5 space-y-3">
                            {savedShippingAddresses.map((address) => {
                                const isDefaultAddress = address.id === defaultShippingAddressId;
                                const isSelectedAddress = address.id === selectedShippingAddressId;

                                return (
                                    <div
                                        key={address.id}
                                        className={`w-full rounded-[1.4rem] border px-4 py-4 text-right transition-colors ${isSelectedAddress ? 'border-brandGold/35 bg-brandGold/10 text-brandBlue dark:text-white' : 'border-gray-200 bg-gray-50/80 text-brandBlue hover:border-brandGold/25 hover:bg-brandGold/5 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-100'}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteAddress(address.id)}
                                                    disabled={isSavingAddress || deletingAddressId === address.id}
                                                    aria-label="Delete address"
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-500 transition-colors hover:bg-red-500 hover:text-white disabled:cursor-wait disabled:opacity-60 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300"
                                                >
                                                    <i className={`fa-solid ${deletingAddressId === address.id ? 'fa-spinner fa-spin' : 'fa-trash-can'} text-sm`}></i>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectSavedAddress(address.id)}
                                                    disabled={isSavingAddress || deletingAddressId === address.id}
                                                    aria-label="Edit address"
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brandGold/20 bg-brandGold/10 text-brandGold transition-colors hover:bg-brandGold hover:text-white disabled:cursor-wait disabled:opacity-60"
                                                >
                                                    <i className="fa-solid fa-pen-to-square text-sm"></i>
                                                </button>
                                            </div>
                                            <div className="min-w-0 flex-1 text-right">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    {isDefaultAddress ? (
                                                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Default</span>
                                                    ) : null}
                                                    {isSelectedAddress ? (
                                                        <span className="rounded-full bg-brandGold/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brandGold">Editing</span>
                                                    ) : null}
                                                </div>
                                                <p className="mt-2 text-sm font-black">{address.recipientName || profileData?.name || 'عنوان محفوظ'}</p>
                                                <p className="mt-2 text-xs font-bold leading-6 text-gray-500 dark:text-gray-300">{buildSavedShippingAddressSummary(address)}</p>
                                                {address.recipientPhone ? (
                                                    <p className="mt-2 text-[11px] font-black text-gray-400 dark:text-gray-500">رقم بديل: {address.recipientPhone}</p>
                                                ) : null}
                                            </div>
                                            <span className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelectedAddress ? 'border-brandGold/35 bg-brandGold/10 text-brandGold' : 'border-gray-300 bg-transparent text-transparent dark:border-gray-600'}`}>
                                                <i className={`fa-solid fa-check text-[10px] ${isSelectedAddress ? 'opacity-100' : 'opacity-0'}`}></i>
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="mt-5 rounded-[1.6rem] border border-dashed border-gray-200 bg-gray-50/80 px-5 py-6 text-center dark:border-gray-700 dark:bg-gray-800/30">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brandGold/10 text-brandGold">
                                <i className="fa-solid fa-map-location-dot text-lg"></i>
                            </div>
                            <p className="mt-4 text-sm font-black text-brandBlue dark:text-white">لا توجد عناوين محفوظة بعد</p>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">أضف أول عنوان الآن أو استخدم عنوانك أثناء الـ checkout وسيتم حفظه تلقائيًا في الحساب.</p>
                        </div>
                    )}

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {hasReachedAddressLimit ? (
                            <p className="text-sm font-bold leading-7 text-amber-600 dark:text-amber-300">
                                وصلت للحد الأقصى: {MAX_SAVED_SHIPPING_ADDRESSES} عناوين محفوظة.
                            </p>
                        ) : <span className="hidden sm:block"></span>}
                        <button
                            type="button"
                            onClick={() => {
                                if (isAddressFormOpen) {
                                    setIsAddressFormOpen(false);
                                    setAddressMessage({ type: '', text: '' });
                                    return;
                                }

                                handleAddNewAddress();
                            }}
                            className="inline-flex items-center justify-center rounded-full border border-brandGold/20 bg-brandGold/5 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-brandGold transition-colors hover:bg-brandGold hover:text-white"
                        >
                            {isAddressFormOpen ? 'Hide Form' : 'Add Address'}
                        </button>
                    </div>

                    {!isAddressFormOpen && savedShippingAddresses.length > 0 ? (
                        <div className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                            العنوان الافتراضي يظهر تلقائيًا في الـ checkout، ويمكنك تغييره أو إضافة عنوان آخر من هنا في أي وقت.
                        </div>
                    ) : null}

                    {isAddressFormOpen ? (
                        <form onSubmit={handleSaveAddress} className="mt-5 rounded-[1.6rem] border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/30">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-right sm:col-span-2">
                            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">اسم المستلم (اختياري)</span>
                            <input type="text" value={shippingAddressFields.recipientName} onChange={(event) => handleShippingAddressFieldChange('recipientName', event.target.value)} placeholder="اتركه فارغًا لاستخدام اسم الحساب" className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-sm font-medium text-brandBlue outline-none transition-colors focus:border-brandGold dark:border-gray-700 dark:bg-gray-900/30 dark:text-white" />
                        </label>

                        <label className="block text-right sm:col-span-2">
                            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">رقم موبايل بديل (اختياري)</span>
                            <input type="text" dir="ltr" inputMode="tel" value={shippingAddressFields.recipientPhone} onChange={(event) => handleShippingAddressFieldChange('recipientPhone', event.target.value)} placeholder="01012345678" className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-brandBlue outline-none transition-colors focus:border-brandGold dark:border-gray-700 dark:bg-gray-900/30 dark:text-white" />
                        </label>

                        <label className="block text-right sm:col-span-2">
                            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">المحافظة</span>
                            <div ref={governorateDropdownRef} className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsGovernorateMenuOpen((currentValue) => !currentValue)}
                                    className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-sm font-medium text-brandBlue outline-none transition-colors hover:border-brandGold focus:border-brandGold dark:border-gray-700 dark:bg-gray-900/30 dark:text-white"
                                >
                                    <i className={`fa-solid ${isGovernorateMenuOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs text-brandGold`}></i>
                                    <span className={selectedGovernorateOption ? '' : 'text-slate-400'}>
                                        {selectedGovernorateOption?.label || 'اختر المحافظة'}
                                    </span>
                                </button>

                                {isGovernorateMenuOpen ? (
                                    <div className="custom-scroll absolute inset-x-0 top-full z-[90] mt-2 max-h-64 overflow-y-auto rounded-[1rem] border border-brandGold/20 bg-[#11192b] py-2 shadow-[0_20px_45px_rgba(6,11,23,0.35)]">
                                        {GOVERNORATE_OPTIONS.map((option) => {
                                            const isSelectedGovernorate = option.value === shippingAddressFields.governorate;

                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => handleShippingAddressFieldChange('governorate', option.value)}
                                                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-sm font-bold transition-colors ${isSelectedGovernorate ? 'bg-brandGold/12 text-brandGold' : 'text-white hover:bg-white/5'}`}
                                                >
                                                    {isSelectedGovernorate ? <i className="fa-solid fa-check text-[11px]"></i> : <span className="h-4 w-4"></span>}
                                                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        </label>

                        <label className="block text-right sm:col-span-2">
                            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">الحي / المنطقة</span>
                            <div ref={districtAutocompleteRef} className="relative">
                                <input
                                    type="text"
                                    value={shippingAddressFields.district}
                                    onChange={(event) => handleDistrictInputChange(event.target.value)}
                                    onFocus={() => {
                                        if (shippingAddressFields.governorate && districtOptions.length > 0) {
                                            setIsDistrictSuggestionsOpen(true);
                                        }
                                    }}
                                    onKeyDown={handleDistrictInputKeyDown}
                                    disabled={!shippingAddressFields.governorate || isLoadingDistrictOptions || districtOptions.length === 0}
                                    placeholder={!shippingAddressFields.governorate
                                        ? 'اختر المحافظة أولاً'
                                        : isLoadingDistrictOptions
                                            ? 'جاري تحميل المناطق من SideUp...'
                                            : districtOptions.length > 0
                                                ? 'ابدأ اكتب الحي / المنطقة'
                                                : 'لا توجد مناطق متاحة حالياً'}
                                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-sm font-medium text-brandBlue outline-none transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 focus:border-brandGold dark:border-gray-700 dark:bg-gray-900/30 dark:text-white"
                                />

                                {isDistrictSuggestionsOpen && shippingAddressFields.governorate && !isLoadingDistrictOptions && districtOptions.length > 0 ? (
                                    <div className="custom-scroll absolute inset-x-0 top-full z-[90] mt-2 max-h-64 overflow-y-auto rounded-[1rem] border border-brandGold/20 bg-[#11192b] py-2 shadow-[0_20px_45px_rgba(6,11,23,0.35)]">
                                        {filteredDistrictOptions.length > 0 ? (
                                            filteredDistrictOptions.map((option) => {
                                                const isSelectedDistrict = String(option?.optionId || '').trim() === selectedDistrictOptionId;

                                                return (
                                                    <button
                                                        key={option.optionId}
                                                        type="button"
                                                        onClick={() => handleDistrictSelection(option.optionId)}
                                                        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-sm font-bold transition-colors ${isSelectedDistrict ? 'bg-brandGold/12 text-brandGold' : 'text-white hover:bg-white/5'}`}
                                                    >
                                                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                                        {isSelectedDistrict ? <i className="fa-solid fa-check text-[11px]"></i> : null}
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="px-4 py-3 text-sm font-bold text-slate-300">لا يوجد حي / منطقة مطابقة لما كتبته.</div>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        </label>

                        <label className="block text-right">
                            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">اسم الشارع</span>
                            <input type="text" value={shippingAddressFields.streetName} onChange={(event) => handleShippingAddressFieldChange('streetName', event.target.value)} placeholder="مثال: شارع عباس العقاد" className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-sm font-medium text-brandBlue outline-none transition-colors focus:border-brandGold dark:border-gray-700 dark:bg-gray-900/30 dark:text-white" />
                        </label>

                        <label className="block text-right">
                            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">رقم العقار / البيت</span>
                            <input type="text" inputMode="numeric" value={shippingAddressFields.houseNumber} onChange={(event) => handleShippingAddressFieldChange('houseNumber', event.target.value)} placeholder="مثال: 24" className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-sm font-medium text-brandBlue outline-none transition-colors focus:border-brandGold dark:border-gray-700 dark:bg-gray-900/30 dark:text-white" />
                        </label>

                        <label className="block text-right">
                            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">الدور</span>
                            <input type="text" inputMode="numeric" value={shippingAddressFields.floorNumber} onChange={(event) => handleShippingAddressFieldChange('floorNumber', event.target.value)} placeholder="مثال: 3" className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-sm font-medium text-brandBlue outline-none transition-colors focus:border-brandGold dark:border-gray-700 dark:bg-gray-900/30 dark:text-white" />
                        </label>

                        <label className="block text-right">
                            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">رقم الشقة</span>
                            <input type="text" inputMode="numeric" value={shippingAddressFields.apartmentNumber} onChange={(event) => handleShippingAddressFieldChange('apartmentNumber', event.target.value)} placeholder="مثال: 12" className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-sm font-medium text-brandBlue outline-none transition-colors focus:border-brandGold dark:border-gray-700 dark:bg-gray-900/30 dark:text-white" />
                        </label>

                        <label className="block text-right sm:col-span-2">
                            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">علامة مميزة / تعليمات التوصيل</span>
                            <input type="text" value={shippingAddressFields.deliveryInstructions} onChange={(event) => handleShippingAddressFieldChange('deliveryInstructions', event.target.value)} placeholder="مثال: بجوار المسجد - أمام الصيدلية" className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-sm font-medium text-brandBlue outline-none transition-colors focus:border-brandGold dark:border-gray-700 dark:bg-gray-900/30 dark:text-white" />
                        </label>
                    </div>

                    <label className="mt-4 flex items-center justify-end gap-3 text-right">
                        <span className="text-sm font-black leading-7 text-gray-600 dark:text-gray-300">اجعل هذا العنوان هو الافتراضي للحساب</span>
                        <input type="checkbox" checked={makeShippingAddressDefault} onChange={(event) => setMakeShippingAddressDefault(event.target.checked)} className="h-4 w-4 rounded border-brandGold/30 text-brandGold focus:ring-brandGold" />
                    </label>

                    {districtOptionsError ? (
                        <p className="mt-3 text-sm font-extrabold text-red-500 dark:text-red-400">{districtOptionsError}</p>
                    ) : null}

                    <div className="mt-5 flex gap-3">
                        <button type="submit" disabled={isSavingAddress} className="flex-1 rounded-2xl bg-brandGold px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-brandBlue disabled:cursor-wait disabled:opacity-70">
                            {isSavingAddress ? 'Saving...' : selectedShippingAddressId ? 'Update Address' : 'Save Address'}
                        </button>
                        <button type="button" onClick={() => setIsAddressFormOpen(false)} disabled={isSavingAddress} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-gray-500 transition-colors hover:border-gray-300 hover:text-brandBlue disabled:cursor-wait disabled:opacity-70 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                            Cancel
                        </button>
                    </div>
                        </form>
                    ) : null}
                </>
            ) : (
                <button
                    type="button"
                    onClick={() => setIsCardExpanded(true)}
                    className="mt-5 flex w-full items-start justify-between gap-4 rounded-[1.5rem] border border-gray-200 bg-gray-50/80 p-4 text-right transition-colors hover:border-brandGold/25 hover:bg-brandGold/5 dark:border-gray-700 dark:bg-gray-800/30"
                >
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brandGold/20 bg-brandGold/10 text-brandGold">
                        <i className="fa-solid fa-map-location-dot"></i>
                    </span>
                    <div className="min-w-0 flex-1 text-right">
                        {previewAddress ? (
                            <>
                                <div className="flex flex-wrap justify-end gap-2">
                                    {previewAddress.id === defaultShippingAddressId ? (
                                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Default</span>
                                    ) : null}
                                </div>
                                <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">{previewAddress.recipientName || profileData?.name || 'عنوان محفوظ'}</p>
                                <p className="mt-1 text-xs font-bold leading-6 text-gray-500 dark:text-gray-300">{buildSavedShippingAddressSummary(previewAddress)}</p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm font-black text-brandBlue dark:text-white">لا توجد عناوين محفوظة بعد</p>
                                <p className="mt-1 text-xs font-bold leading-6 text-gray-500 dark:text-gray-300">اضغط هنا لإضافة أول عنوان وحفظه على الحساب.</p>
                            </>
                        )}
                    </div>
                </button>
            )}
        </div>
    );
}