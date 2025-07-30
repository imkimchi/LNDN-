import crypto from 'crypto';

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
    return params.get(param);
}

export function getUrlType(url) {
    if (url.includes('spareroom.co.uk')) return 'spareroom';
    if (url.includes('rightmove.co.uk')) return 'rightmove';
    if (url.includes('zoopla.co.uk')) return 'zoopla';
    if (url.includes('foxtons.co.uk')) return 'foxtons';
    return null;
}

export function getSearchIdentifier(urlType) {
    switch (urlType) {
        case 'spareroom': return 'search_id';
        case 'rightmove': return 'savedSearchId';
        case 'zoopla': return 'search_identifier';
        case 'foxtons': return 'foxtons_hash';
        default: throw new Error('Unsupported URL type');
    }
}
