import crypto from 'crypto';

/**
 * Extracts a UK-style postcode (or outcode) from a location string.
 * Returns the matched postcode and the alphabetical prefix used for direction classification.
 *
 * @param {string|null|undefined} rawLocation - Free-form location text
 * @returns {{ postcode: string|null, areaPrefix: string|null }}
 */
export function extractPostcode(rawLocation) {
    if (!rawLocation || typeof rawLocation !== 'string') {
        return { postcode: null, areaPrefix: null };
    }

    const upper = rawLocation.toUpperCase();
    const postcodeMatch = upper.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/);
    if (!postcodeMatch) {
        return { postcode: null, areaPrefix: null };
    }

    const postcode = postcodeMatch[1];
    const areaMatch = postcode.match(/^([A-Z]{1,2})/);
    return {
        postcode,
        areaPrefix: areaMatch ? areaMatch[1] : null
    };
}

/**
 * Maps a postcode prefix to a coarse geographical direction.
 * Only simple prefix rules are used per requirements.
 *
 * @param {string|null} prefix - Alphabetical prefix of the postcode (e.g. SW, N, WC)
 * @returns {('North'|'East'|'South'|'West'|'Other')}
 */
export function getDirectionFromPrefix(prefix) {
    if (!prefix) {
        return 'Other';
    }

    const upper = prefix.toUpperCase();

    if (upper.startsWith('NE')) {
        return 'East';
    }
    if (upper.startsWith('NW')) {
        return 'North';
    }
    if (upper.startsWith('SE') || upper.startsWith('SW')) {
        return 'South';
    }
    if (upper.startsWith('EC') || upper.startsWith('E')) {
        return 'East';
    }
    if (upper.startsWith('WC') || upper.startsWith('W')) {
        return 'West';
    }
    if (upper.startsWith('N')) {
        return 'North';
    }
    if (upper.startsWith('S')) {
        return 'South';
    }

    return 'Other';
}

/**
 * Converts a price string to a numeric value (monthly amount when possible).
 * @param {string|null|undefined} priceText
 * @returns {number|null}
 */
export function priceTextToNumber(priceText) {
    if (!priceText || typeof priceText !== 'string') {
        return null;
    }

    const sanitized = priceText.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    if (!sanitized) {
        return null;
    }

    const value = Number.parseFloat(sanitized[1]);
    if (!Number.isFinite(value)) {
        return null;
    }

    return value;
}

/**
 * Generates a consistent storage key for a listing using source and id/link fallback.
 * @param {string} source - Listing source identifier (e.g. 'rightmove')
 * @param {string|null|undefined} id - Native listing id if available
 * @param {string|null|undefined} link - Listing URL used as fallback
 * @returns {string}
 */
export function toListingKey(source, id, link) {
    const safeSource = (source || 'unknown').toLowerCase();

    if (id) {
        return `${safeSource}:${id}`;
    }

    if (link) {
        const hash = crypto.createHash('sha1').update(link).digest('hex');
        return `${safeSource}:link:${hash}`;
    }

    return `${safeSource}:anon:${crypto.randomUUID()}`;
}

/**
 * Normalises source names for storage.
 * @param {string} source
 * @returns {string}
 */
export function normalizeSource(source) {
    return (source || 'unknown').toLowerCase();
}

