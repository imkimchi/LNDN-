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
    
    const urlObject = new URL(url);
    const params = new URLSearchParams(urlObject.search);
    const searchId = params.get(param);
    
    // If no saved search ID found for Rightmove, create a hash from search parameters
    if (!searchId && param === 'savedSearchId') {
        const sortedParams = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
        
        return crypto.createHash('md5').update(sortedParams).digest('hex').substring(0, 8);
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
    if (url.includes('foxtons.co.uk')) return 'foxtons';
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
        case 'foxtons': return 'foxtons_hash';
        default: throw new Error('Unsupported URL type');
    }
}
