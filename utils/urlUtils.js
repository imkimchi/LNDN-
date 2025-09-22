import crypto from 'crypto';

/**
 * URL utilities for handling different real estate platform URLs
 */

/**
 * Extracts or generates a search ID from a URL
 * @param {string} url - The URL to extract search ID from
 * @param {string} param - The parameter name to look for
 * @returns {string} The search ID or generated hash
 */
export function getSavedSearchId(url, param) {
    if (param === 'foxtons_hash') {
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);
        
        // Create a consistent hash from the search parameters
        const sortedParams = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
        
        // Create a short hash for file naming
        return crypto.createHash('md5').update(sortedParams).digest('hex').substring(0, 8);
    }

    if (param === 'dexters_hash') {
        const normalizedUrl = url.split('#')[0];
        return crypto.createHash('md5').update(normalizedUrl).digest('hex').substring(0, 8);
    }

    if (param === 'onthemarket_hash') {
        const normalizedUrl = url.split('#')[0];
        return crypto.createHash('md5').update(normalizedUrl).digest('hex').substring(0, 8);
    }
    
    const urlObject = new URL(url);
    const params = new URLSearchParams(urlObject.search);
    const searchId = params.get(param);

    const buildHash = () => {
        const sortedParams = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
        const base = sortedParams || `${urlObject.pathname}`;
        return crypto.createHash('md5').update(base).digest('hex').substring(0, 8);
    };

    // Generate stable identifiers when the upstream platform does not provide one
    if (!searchId && (param === 'savedSearchId' || param === 'search_identifier')) {
        return buildHash();
    }

    return searchId;
}

/**
 * Determines the platform type from a URL
 * @param {string} url - The URL to analyze
 * @returns {string|null} The platform type or null if unsupported
 */
export function getUrlType(url) {
    if (url.includes('spareroom.co.uk')) return 'spareroom';
    if (url.includes('rightmove.co.uk')) return 'rightmove';
    if (url.includes('zoopla.co.uk')) return 'zoopla';
    if (url.includes('onthemarket.com') || url.includes('onthemarket.co.uk')) return 'onthemarket';
    if (url.includes('foxtons.co.uk')) return 'foxtons';
    if (url.includes('dexters.co.uk')) return 'dexters';
    return null;
}

/**
 * Gets the search parameter name for a given platform
 * @param {string} urlType - The platform type
 * @returns {string} The search parameter name
 * @throws {Error} If URL type is unsupported
 */
export function getSearchIdentifier(urlType) {
    switch (urlType) {
        case 'spareroom': return 'search_id';
        case 'rightmove': return 'savedSearchId';
        case 'zoopla': return 'search_identifier';
        case 'onthemarket': return 'onthemarket_hash';
        case 'foxtons': return 'foxtons_hash';
        case 'dexters': return 'dexters_hash';
        default: throw new Error('Unsupported URL type');
    }
}
