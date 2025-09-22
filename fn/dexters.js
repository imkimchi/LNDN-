import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';
import { fetchWithRetry } from '../utils/httpClient.js';
import { sanitizeUrl } from '../utils/validation.js';
import logger from '../utils/logger.js';

const BASE_URL = 'https://www.dexters.co.uk';
const DETAIL_CONCURRENCY = 4;

function buildPropertyUrl(path) {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path.replace('http://', 'https://');
    }
    return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function isActiveStatus(status) {
    if (!status) return true;
    const normalized = status.toLowerCase();
    if (normalized === 'to let') return true;
    if (normalized.includes('let')) return false;
    return normalized !== 'sold';
}

function formatPrice(value) {
    if (!value) return '';
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        return `£${numeric.toLocaleString('en-GB')} pcm`;
    }
    return `£${value} pcm`;
}

function extractLocationParts(name) {
    if (!name || typeof name !== 'string') {
        return { title: null, location: null };
    }

    const parts = name.split(' To Let in ');
    if (parts.length >= 2) {
        const title = parts[0]?.trim() || null;
        const location = parts.slice(1).join(' To Let in ').trim() || null;
        return { title, location };
    }

    return { title: name.trim(), location: null };
}

function extractImages(imageField) {
    if (!imageField) return [];
    if (Array.isArray(imageField)) {
        return imageField.filter((img) => typeof img === 'string' && img.trim().length > 0);
    }
    if (typeof imageField === 'string') {
        return [imageField];
    }
    return [];
}

function removeExtraClosingCharacters(content, openChar, closeChar) {
    if (!content || typeof content !== 'string') return content;

    const closingPositions = [];
    let inString = false;
    let escaped = false;
    let openCount = 0;

    for (let i = 0; i < content.length; i += 1) {
        const char = content[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) {
            continue;
        }

        if (char === openChar) {
            openCount += 1;
            continue;
        }

        if (char === closeChar) {
            closingPositions.push(i);
        }
    }

    if (closingPositions.length <= openCount) {
        return content;
    }

    let result = content;

    for (let index = closingPositions.length - 1; index >= openCount; index -= 1) {
        const position = closingPositions[index];
        result = `${result.slice(0, position)}${result.slice(position + 1)}`;
    }

    return result;
}

function hasProductType(candidate) {
    if (!candidate) return false;
    const typeField = candidate['@type'];
    if (!typeField) return false;
    if (typeof typeField === 'string') {
        return typeField.toLowerCase() === 'product';
    }
    if (Array.isArray(typeField)) {
        return typeField.some((value) => typeof value === 'string' && value.toLowerCase() === 'product');
    }
    return false;
}

function selectOffer(offers) {
    if (!offers) return null;
    if (Array.isArray(offers)) {
        return offers.find((offer) => offer && typeof offer === 'object') || null;
    }
    if (typeof offers === 'object') {
        return offers;
    }
    return null;
}

function safeParseJsonLd(raw, propertyUrl) {
    if (!raw) return null;
    const trimmed = raw.trim();

    try {
        return JSON.parse(trimmed);
    } catch (error) {
        const repaired = removeExtraClosingCharacters(trimmed, '{', '}');
        const fullyRepaired = removeExtraClosingCharacters(repaired, '[', ']');

        if (fullyRepaired !== trimmed) {
            try {
                return JSON.parse(fullyRepaired);
            } catch (innerError) {
                logger.debug('Dexters JSON-LD repair parse failed', {
                    propertyUrl,
                    error: innerError.message
                });
            }
        } else {
            logger.debug('Dexters JSON-LD parse failed', {
                propertyUrl,
                error: error.message
            });
        }
    }

    return null;
}

function extractListingDetailsFromHtml(html, propertyUrl) {
    if (typeof html !== 'string' || html.length === 0) {
        return null;
    }

    const scriptRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        const rawJson = match[1];
        const parsed = safeParseJsonLd(rawJson, propertyUrl);

        if (!parsed) continue;

        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const candidate of candidates) {
            if (!candidate || typeof candidate !== 'object') continue;
            if (!hasProductType(candidate)) continue;

            const offer = selectOffer(candidate.offers);
            const { title, location } = extractLocationParts(candidate.name);
            const price = formatPrice(offer?.price || offer?.priceSpecification?.price);
            const description = typeof candidate.description === 'string' ? candidate.description.trim() : null;
            const images = extractImages(candidate.image);

            return {
                title: title || candidate.name || null,
                location,
                price,
                description,
                images
            };
        }
    }

    return null;
}

async function fetchPropertyDetails(propertyUrl) {
    const sanitizedUrl = sanitizeUrl(propertyUrl);
    const response = await fetchWithRetry(sanitizedUrl, {
        timeout: 30000,
        headers: {
            Referer: `${BASE_URL}/`
        }
    });

    if (!response?.data) {
        throw new Error('Empty response when fetching property details');
    }

    const details = extractListingDetailsFromHtml(response.data, propertyUrl);
    if (!details) {
        throw new Error('Failed to extract listing details from HTML');
    }

    return details;
}

async function processListing(listing, searchUrl) {
    const propertyUrl = buildPropertyUrl(listing.url);
    if (!propertyUrl) {
        throw new ScrapingError('Listing missing property URL', 'Dexters', searchUrl);
    }

    try {
        const details = await fetchPropertyDetails(propertyUrl);

        return {
            id: listing.id?.toString() || propertyUrl,
            link: propertyUrl,
            title: details.title || `Dexters listing ${listing.id}`,
            price: details.price || '',
            location: details.location,
            description: details.description,
            images: details.images,
            summary: details.description,
            bedrooms: null,
            bathrooms: null,
            addedDate: null,
            status: listing.status || null
        };
    } catch (error) {
        logger.warn('Dexters property detail fetch failed', {
            propertyUrl,
            error: error.message
        });

        return {
            id: listing.id?.toString() || propertyUrl,
            link: propertyUrl,
            title: `Dexters listing ${listing.id || ''}`.trim() || 'Dexters listing',
            price: '',
            location: null,
            description: null,
            images: [],
            summary: null,
            bedrooms: null,
            bathrooms: null,
            addedDate: null,
            status: listing.status || null
        };
    }
}

async function getDextersListingsInternal(url) {
    try {
        logger.debug('Starting Dexters scraping', { url });

        const sanitizedUrl = sanitizeUrl(url);
        const response = await fetchWithRetry(sanitizedUrl, {
            timeout: 30000,
            headers: {
                Accept: 'application/json'
            }
        });

        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (!Array.isArray(data)) {
            throw new ScrapingError('Dexters API returned invalid response', 'Dexters', sanitizedUrl);
        }

        const activeListings = data.filter((item) => item && item.url && isActiveStatus(item.status));
        if (activeListings.length === 0) {
            logger.info('Dexters scraping returned no active listings', { url });
            return [];
        }

        const results = [];
        for (let i = 0; i < activeListings.length; i += DETAIL_CONCURRENCY) {
            const batch = activeListings.slice(i, i + DETAIL_CONCURRENCY);
            const batchResults = await Promise.all(batch.map((listing) => processListing(listing, sanitizedUrl)));
            results.push(...batchResults.filter(Boolean));

            if (i + DETAIL_CONCURRENCY < activeListings.length) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }

        logger.info('Dexters scraping completed', {
            url,
            listingCount: results.length
        });

        return results;
    } catch (error) {
        if (error instanceof ScrapingError) {
            throw error;
        }

        if (error instanceof SyntaxError) {
            throw new ScrapingError(`Dexters API JSON parse failed: ${error.message}`, 'Dexters', url, error);
        }

        throw new ScrapingError(`Request failed: ${error.message}`, 'Dexters', url, error);
    }
}

export default createScraperWrapper('Dexters', getDextersListingsInternal);
