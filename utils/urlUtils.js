export function getSavedSearchId(url, param) {
    const urlObject = new URL(url);
    const params = new URLSearchParams(urlObject.search);
    return params.get(param);
}

export function getUrlType(url) {
    if (url.includes('spareroom.co.uk')) return 'spareroom';
    if (url.includes('rightmove.co.uk')) return 'rightmove';
    if (url.includes('zoopla.co.uk')) return 'zoopla';
    return null;
}

export function getSearchIdentifier(urlType) {
    switch (urlType) {
        case 'spareroom': return 'search_id';
        case 'rightmove': return 'savedSearchId';
        case 'zoopla': return 'search_identifier';
        default: throw new Error('Unsupported URL type');
    }
}
