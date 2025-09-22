import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';
import { fetchWithRetry } from '../utils/httpClient.js';
import { sanitizeUrl } from '../utils/validation.js';
import logger from '../utils/logger.js';

const OTM_BASE_URL = 'https://www.onthemarket.com';

function extractNextData(html, url) {
    const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!match || !match[1]) {
        throw new ScrapingError('Unable to find __NEXT_DATA__ script tag', 'OnTheMarket', url);
    }

    try {
        return JSON.parse(match[1]);
    } catch (error) {
        throw new ScrapingError('Failed to parse __NEXT_DATA__ JSON', 'OnTheMarket', url, error);
    }
}

function normalizeLink(detailsUrl) {
    if (!detailsUrl || typeof detailsUrl !== 'string') return null;
    if (detailsUrl.startsWith('http://') || detailsUrl.startsWith('https://')) {
        return detailsUrl;
    }
    if (detailsUrl.startsWith('//')) {
        return `https:${detailsUrl}`;
    }
    const path = detailsUrl.startsWith('/') ? detailsUrl : `/${detailsUrl}`;
    return `${OTM_BASE_URL}${path}`;
}

function normalizeImages(images) {
    if (!Array.isArray(images)) return [];
    const urls = images.map(image => {
        if (!image) return null;
        if (typeof image === 'string') return image.trim();
        if (typeof image === 'object') {
            if (typeof image.default === 'string' && image.default.trim()) return image.default.trim();
            if (typeof image.webp === 'string' && image.webp.trim()) return image.webp.trim();
        }
        return null;
    }).filter(Boolean);
    return Array.from(new Set(urls));
}

function buildSummary(listing) {
    const badges = Array.isArray(listing['property-labels']) ? listing['property-labels'] : [];
    const features = Array.isArray(listing.features) ? listing.features : [];
    const labels = [];
    if (typeof listing['main-label'] === 'string' && listing['main-label'].trim()) {
        labels.push(listing['main-label'].trim());
    }
    labels.push(...features.map(feature => feature.trim()).filter(Boolean));
    labels.push(...badges.map(badge => badge.trim()).filter(Boolean));
    if (listing.agent && typeof listing.agent.name === 'string') {
        labels.push(`Agent: ${listing.agent.name.trim()}`);
    }
    const unique = Array.from(new Set(labels.filter(Boolean)));
    return unique.join(' · ');
}

function mapListing(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const id = raw.id ? String(raw.id) : null;
    const link = normalizeLink(raw['details-url']);
    if (!id && !link) return null;

    const titleCandidates = [
        raw['property-title'],
        raw['humanised-property-type'],
        raw.address,
        raw['main-label']
    ];
    const title = titleCandidates.find(value => typeof value === 'string' && value.trim())?.trim() || 'Property listing';

    const price = typeof raw.price === 'string' && raw.price.trim()
        ? raw.price.trim()
        : (typeof raw['short-price'] === 'string' ? raw['short-price'].trim() : null);

    const location = typeof raw.address === 'string' && raw.address.trim() ? raw.address.trim() : null;
    const images = normalizeImages(raw.images);
    const summary = buildSummary(raw);

    return {
        id: id || link,
        title,
        link,
        price,
        images,
        bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : null,
        bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : null,
        location,
        summary: summary || null,
        addedDate: typeof raw['days-since-added-reduced'] === 'string' ? raw['days-since-added-reduced'].trim() : null
    };
}

async function getOnTheMarketListingsInternal(url) {
    const scraperName = 'OnTheMarket';
    try {
        const sanitizedUrl = sanitizeUrl(url);
        const response = await fetchWithRetry(sanitizedUrl, {
            timeout: 30000,
            maxRetries: 3,
            retryDelay: 2000
        });

        if (!response?.data || typeof response.data !== 'string') {
            throw new ScrapingError('No HTML payload returned', scraperName, sanitizedUrl);
        }

        const jsonData = extractNextData(response.data, sanitizedUrl);
        const listings = jsonData?.props?.initialReduxState?.results?.list;

        if (!Array.isArray(listings) || listings.length === 0) {
            throw new ScrapingError('No listings found in __NEXT_DATA__ payload', scraperName, sanitizedUrl);
        }

        const normalized = listings
            .map(mapListing)
            .filter(Boolean);

        if (normalized.length === 0) {
            throw new ScrapingError('No valid listings could be parsed', scraperName, sanitizedUrl);
        }

        logger.info('OnTheMarket scraping completed', {
            url: sanitizedUrl,
            listingCount: normalized.length
        });

        return normalized;
    } catch (error) {
        if (error instanceof ScrapingError) {
            throw error;
        }
        throw new ScrapingError(`Request failed: ${error.message}`, scraperName, url, error);
    }
}

export default createScraperWrapper('OnTheMarket', getOnTheMarketListingsInternal);
