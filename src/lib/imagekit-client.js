'use client';

const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';

function inferFileExtension(file) {
    const fileName = String(file?.name || '').trim();
    const explicitExtension = fileName.includes('.') ? fileName.split('.').pop() : '';
    if (explicitExtension) {
        return explicitExtension.toLowerCase();
    }

    const mimeType = String(file?.type || '').toLowerCase();
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('gif')) return 'gif';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
    return 'jpg';
}

function sanitizeUploadFileName(fileName) {
    return String(fileName || '')
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 120) || `upload_${Date.now()}.jpg`;
}

function buildImageKitMediaRecord(uploadResult, fallbackUrl = '') {
    const primaryUrl = uploadResult.url || '';

    return {
        provider: 'imagekit',
        primaryUrl,
        url: primaryUrl,
        fallbackUrl: fallbackUrl && fallbackUrl !== primaryUrl ? fallbackUrl : '',
        fileId: uploadResult.fileId || '',
        filePath: uploadResult.filePath || '',
        thumbnailUrl: uploadResult.thumbnailUrl || '',
        width: uploadResult.width || null,
        height: uploadResult.height || null,
        migrated: Boolean(fallbackUrl && fallbackUrl !== primaryUrl)
    };
}

export async function getImageKitAuthPayload(currentUser) {
    if (!currentUser) {
        throw new Error('Login required before uploading');
    }

    const idToken = await currentUser.getIdToken();
    const authUrl = `/api/imagekit-auth?ts=${Date.now()}`;
    const response = await fetch(authUrl, {
        cache: 'no-store',
        headers: {
            Authorization: `Bearer ${idToken}`
        }
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to authorize ImageKit upload');
    }

    return response.json();
}

export async function uploadToImageKit(currentUser, file, options = {}) {
    if (!file) {
        throw new Error('No file selected for upload');
    }

    const authPayload = await getImageKitAuthPayload(currentUser);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', sanitizeUploadFileName(options.fileName || `image_${Date.now()}.${inferFileExtension(file)}`));
    formData.append('publicKey', authPayload.publicKey);
    formData.append('signature', authPayload.signature);
    formData.append('expire', String(authPayload.expire));
    formData.append('token', authPayload.token);
    formData.append('useUniqueFileName', 'true');

    if (options.folder) formData.append('folder', options.folder);
    if (Array.isArray(options.tags) && options.tags.length > 0) formData.append('tags', options.tags.join(','));

    const response = await fetch(IMAGEKIT_UPLOAD_URL, {
        method: 'POST',
        body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || data.error || 'Image upload failed');
    }

    return buildImageKitMediaRecord(data, options.fallbackUrl || '');
}

export async function deleteImageKitFiles(currentUser, fileIds = []) {
    const normalizedFileIds = Array.from(new Set((fileIds || []).filter(Boolean)));
    if (normalizedFileIds.length === 0) {
        return { deleted: [], failed: [] };
    }

    if (!currentUser) {
        throw new Error('Login required before deleting ImageKit media');
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch('/api/imagekit-media', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ fileIds: normalizedFileIds })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete ImageKit media');
    }

    return {
        deleted: Array.isArray(payload.deleted) ? payload.deleted : [],
        failed: Array.isArray(payload.failed) ? payload.failed : []
    };
}