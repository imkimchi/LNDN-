import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';
import { sanitizeUrl } from '../utils/validation.js';
import logger from '../utils/logger.js';

const ZOOPLA_BASE_URL = 'https://www.zoopla.co.uk';
const USER_DATA_DIR = path.join(process.cwd(), '.cache', 'zoopla-playwright-profile');

async function ensureUserDataDir() {
    try {
        await fs.mkdir(USER_DATA_DIR, { recursive: true });
    } catch (error) {
        logger.warn('Failed to ensure Playwright user data directory', {
            dir: USER_DATA_DIR,
            error: error.message
        });
    }
}

async function notifyTelegram(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.CHAT_ID;

    if (!token || !chatId) {
        logger.debug('Skipping Telegram notification (missing token or chat id)');
        return;
    }

    try {
        const params = new URLSearchParams({
            chat_id: chatId,
            text: message,
            disable_web_page_preview: 'true'
        });

        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!response.ok) {
            logger.warn('Failed to send Telegram notification', {
                status: response.status,
                statusText: response.statusText
            });
        }
    } catch (error) {
        logger.warn('Unable to send Telegram notification', { error: error.message });
    }
}

function toArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function hasType(entity, type) {
    if (!entity || typeof entity !== 'object') return false;
    const entityType = entity['@type'];
    if (!entityType) return false;
    return Array.isArray(entityType) ? entityType.includes(type) : entityType === type;
}

function isCloudflareChallenge(html) {
    if (!html) return false;

    const normalized = html.toLowerCase();
    const indicators = [
        'cf-browser-verification',
        'cf-challenge',
        'window._cf_chl_opt',
        '__cf_chl_captcha_tk__',
        'checking your browser before accessing',
        '<title>just a moment',
        'cf_chl_managed',
        'challenge-error-text',
        'ddos protection by cloudflare',
        'cf-error-details'
    ];

    return indicators.some((indicator) => normalized.includes(indicator));
}

async function clearZooplaSession(context, page) {
    try {
        await context.clearCookies();
    } catch (error) {
        logger.warn('Failed to clear Zoopla cookies after challenge', { error: error.message });
    }

    try {
        await page.evaluate(() => {
            try {
                window.localStorage?.clear();
                window.sessionStorage?.clear();
            } catch {
                /* ignore */
            }
        });
    } catch (error) {
        logger.debug('Failed to clear Zoopla storage after challenge', { error: error.message });
    }
}

async function emulateHumanBrowsing(page) {
    try {
        await page.waitForTimeout(350 + Math.random() * 450);
        await page.mouse.move(
            200 + Math.random() * 400,
            200 + Math.random() * 300,
            { steps: 8 }
        );
        await page.waitForTimeout(200 + Math.random() * 300);
        await page.mouse.wheel(0, 300 + Math.random() * 200);
        await page.waitForTimeout(150 + Math.random() * 250);
    } catch (error) {
        logger.debug('Failed to simulate Zoopla browsing behaviour', { error: error.message });
    }
}

function normalizeZooplaUrl(url) {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${ZOOPLA_BASE_URL}${url}`;
    return `${ZOOPLA_BASE_URL}/${url.replace(/^\/+/, '')}`;
}

function extractIdFromUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url, ZOOPLA_BASE_URL);
        const segments = parsed.pathname.split('/').filter(Boolean);
        for (let i = segments.length - 1; i >= 0; i--) {
            const match = segments[i].match(/(\d{5,})/);
            if (match) {
                return match[1];
            }
        }
    } catch (error) {
        const fallback = url.match(/(\d{5,})/);
        if (fallback) return fallback[1];
        logger.debug('Failed to parse Zoopla URL for id', { url, error: error.message });
    }
    return null;
}

function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizeLocation(product) {
    const address = product.address;
    if (typeof address === 'string' && address.trim()) {
        return address.trim();
    }
    if (address && typeof address === 'object') {
        const parts = [
            address.streetAddress,
            address.addressLocality,
            address.addressRegion,
            address.postalCode
        ].filter(Boolean);
        if (parts.length) return parts.join(', ');
    }

    const brand = product.brand;
    if (typeof brand === 'string' && brand.trim()) {
        return brand.trim();
    }
    if (brand && typeof brand === 'object' && typeof brand.name === 'string') {
        return brand.name.trim();
    }

    const areaServed = product.areaServed;
    if (typeof areaServed === 'string' && areaServed.trim()) {
        return areaServed.trim();
    }
    if (areaServed && typeof areaServed === 'object' && typeof areaServed.name === 'string') {
        return areaServed.name.trim();
    }

    return null;
}

function formatPrice(priceValue, currencyCode, frequency) {
    if (!priceValue) return '';

    const numericPrice = safeNumber(priceValue);
    const formattedValue = numericPrice !== null ? numericPrice.toLocaleString('en-GB') : String(priceValue);

    let symbol = '';
    if (currencyCode === 'GBP') symbol = '£';
    if (!symbol && typeof currencyCode === 'string') symbol = `${currencyCode} `;

    let suffix = '';
    if (typeof frequency === 'string') {
        const freq = frequency.toLowerCase();
        if (freq.includes('month')) suffix = ' pcm';
        else if (freq.includes('week')) suffix = ' pw';
        else if (freq.includes('day')) suffix = ' pd';
    }

    return `${symbol}${formattedValue}${suffix}`.trim();
}

function extractNumericProperty(product, keys) {
    for (const key of keys) {
        if (product[key] !== undefined) {
            const value = safeNumber(product[key]);
            if (value !== null) {
                return value;
            }
        }
    }

    const additional = toArray(product.additionalProperty);
    for (const item of additional) {
        if (!item || typeof item !== 'object') continue;
        const name = (item.name || '').toString().toLowerCase();
        if (name.includes('bed') && keys.includes('numberOfBedrooms')) {
            const value = safeNumber(item.value);
            if (value !== null) return value;
        }
        if (name.includes('bath') && keys.includes('numberOfBathrooms')) {
            const value = safeNumber(item.value);
            if (value !== null) return value;
        }
    }

    return null;
}

function extractImages(product) {
    const images = [];
    const rawImage = product.image;

    if (Array.isArray(rawImage)) {
        for (const img of rawImage) {
            if (typeof img === 'string' && img.trim()) {
                images.push(img.trim());
            } else if (img && typeof img === 'object') {
                if (typeof img.url === 'string') images.push(img.url.trim());
                else if (typeof img['@id'] === 'string') images.push(img['@id'].trim());
            }
        }
    } else if (typeof rawImage === 'string' && rawImage.trim()) {
        images.push(rawImage.trim());
    } else if (rawImage && typeof rawImage === 'object') {
        if (typeof rawImage.url === 'string') images.push(rawImage.url.trim());
        else if (typeof rawImage['@id'] === 'string') images.push(rawImage['@id'].trim());
    }

    return Array.from(new Set(images));
}

function toListing(listItem) {
    if (!listItem || typeof listItem !== 'object') return null;
    const product = listItem.item && typeof listItem.item === 'object' ? listItem.item : listItem;

    const rawUrl = product.url || listItem.url;
    const link = normalizeZooplaUrl(rawUrl);
    if (!link) return null;

    const id = (product.productID || product.sku || extractIdFromUrl(link))?.toString();
    if (!id) return null;

    const offer = product.offers || {};
    const price = formatPrice(
        offer.price || offer.priceSpecification?.price,
        offer.priceCurrency || offer.priceSpecification?.priceCurrency,
        offer.priceFrequency || offer.priceSpecification?.priceFrequency
    );

    return {
        id,
        title: (product.name || 'Zoopla listing').trim(),
        link,
        price,
        images: extractImages(product),
        bedrooms: extractNumericProperty(product, ['numberOfBedrooms']),
        bathrooms: extractNumericProperty(product, ['numberOfBathrooms']),
        location: normalizeLocation(product),
        summary: typeof product.description === 'string' ? product.description.trim() : null,
        addedDate: product.datePosted || product.releaseDate || null
    };
}

function tryParseJson(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (error) {
        const trimmed = text.trim();
        if (trimmed.startsWith('{') && trimmed.includes('\n{')) {
            const objects = trimmed
                .split(/\n(?=\s*\{)/)
                .map(part => part.trim())
                .filter(Boolean);
            const parsedObjects = [];
            for (const part of objects) {
                try {
                    parsedObjects.push(JSON.parse(part));
                } catch (innerError) {
                    logger.debug('Failed to parse Zoopla JSON-LD segment', { error: innerError.message });
                    return null;
                }
            }
            return parsedObjects;
        }
        logger.debug('Failed to parse Zoopla JSON-LD script', { error: error.message });
        return null;
    }
}

function parseJsonLdBlocks(html) {
    const $ = cheerio.load(html);
    const blocks = [];

    $('script[type="application/ld+json"]').each((_, script) => {
        const raw = $(script).contents().text();
        const parsed = tryParseJson(raw);
        if (parsed) {
            if (Array.isArray(parsed)) blocks.push(...parsed);
            else blocks.push(parsed);
        }
    });

    return blocks;
}

function collectItemLists(jsonLdBlocks) {
    const itemLists = [];
    const stack = [...jsonLdBlocks];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;

        if (Array.isArray(current)) {
            stack.push(...current);
            continue;
        }

        if (typeof current !== 'object') {
            continue;
        }

        if (current['@graph']) {
            stack.push(current['@graph']);
        }

        if (hasType(current, 'SearchResultsPage') && current.mainEntity) {
            stack.push(current.mainEntity);
        }

        if (hasType(current, 'ItemList')) {
            itemLists.push(current);
        }
    }

    return itemLists;
}

function extractListingsFromItemList(itemList) {
    const listings = [];
    const elements = toArray(itemList.itemListElement);

    for (const element of elements) {
        if (!element) continue;
        const listItem = hasType(element, 'ListItem') ? element : { item: element };
        const listing = toListing(listItem);
        if (listing) listings.push(listing);
    }

    return listings;
}

function extractZooplaListings(html, url) {
    const jsonLdBlocks = parseJsonLdBlocks(html);
    if (!jsonLdBlocks.length) {
        throw new ScrapingError('No JSON-LD blocks found on Zoopla page', 'Zoopla', url);
    }

    const itemLists = collectItemLists(jsonLdBlocks);
    if (!itemLists.length) {
        throw new ScrapingError('No ItemList structures found in Zoopla JSON-LD', 'Zoopla', url);
    }

    const seenIds = new Set();
    const listings = [];

    for (const itemList of itemLists) {
        const extracted = extractListingsFromItemList(itemList);
        for (const listing of extracted) {
            if (!listing.id || seenIds.has(listing.id)) {
                continue;
            }
            seenIds.add(listing.id);
            listings.push(listing);
        }
    }

    if (!listings.length) {
        throw new ScrapingError('No listings extracted from Zoopla JSON-LD', 'Zoopla', url);
    }

    return listings;
}

async function getZooplaListingsInternal(url) {
    const sanitizedUrl = sanitizeUrl(url);
    await ensureUserDataDir();

    let context;

    try {
        logger.debug('Starting Zoopla scraping with Playwright', { url: sanitizedUrl });

        context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false,
            viewport: { width: 1365, height: 768 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            locale: 'en-GB',
            timezoneId: 'Europe/London'
        });

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [{ name: 'Chrome PDF Viewer' }] });
            const originalQuery = navigator.permissions && navigator.permissions.query;
            if (originalQuery) {
                navigator.permissions.query = (parameters) => {
                    if (parameters && parameters.name === 'notifications') {
                        return Promise.resolve({ state: 'denied' });
                    }
                    return originalQuery(parameters);
                };
            }
        });

        await context.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            if (resourceType === 'media') {
                return route.abort();
            }
            return route.continue();
        });

        let page = context.pages()[0];
        if (!page) {
            page = await context.newPage();
        }

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-GB,en;q=0.9',
            Referer: 'https://www.google.com/'
        });

        let response;
        try {
            response = await page.goto(sanitizedUrl, {
                waitUntil: 'networkidle',
                timeout: 60000
            });
        } catch (error) {
            if (error.name === 'TimeoutError') {
                logger.warn('Zoopla navigation timed out waiting for networkidle; proceeding with current DOM state.', {
                    url: sanitizedUrl
                });
            } else {
                throw error;
            }
        }

        logger.debug('Zoopla navigation completed', {
            status: response?.status() ?? 'unknown',
            finalUrl: page.url()
        });

        await page.waitForTimeout(600 + Math.random() * 1200);

        const challengeWatcher = page
            .waitForURL((navigatedUrl) => navigatedUrl.includes('/cdn-cgi/'), { timeout: 15000 })
            .then(() => 'challenge')
            .catch(() => null);

        const listingWatcher = page
            .waitForSelector('[data-testid="listing"]', { timeout: 15000 })
            .then(() => 'listing')
            .catch(() => null);

        const raceResult = await Promise.race([challengeWatcher, listingWatcher]);
        if (raceResult === 'challenge') {
            logger.warn('Cloudflare challenge detected on Zoopla page.', { url: sanitizedUrl });
        } else if (raceResult === 'listing') {
            logger.debug('Zoopla listings marker detected on page.', { url: sanitizedUrl });
        } else {
            logger.debug('Zoopla listings marker not detected within timeout window.', { url: sanitizedUrl });
        }

        await emulateHumanBrowsing(page);

        const html = await page.content();
        if (isCloudflareChallenge(html)) {
            logger.warn('Cloudflare challenge encountered on Zoopla page; clearing session data.', {
                url: sanitizedUrl
            });
            await clearZooplaSession(context, page);
            throw new ScrapingError('Cloudflare challenge encountered on Zoopla page', 'Zoopla', sanitizedUrl);
        }
        const listings = extractZooplaListings(html, sanitizedUrl);

        logger.info('Zoopla scraping completed', {
            url: sanitizedUrl,
            listingCount: listings.length,
            totalImages: listings.reduce((sum, listing) => sum + listing.images.length, 0)
        });

        return listings;
    } catch (error) {
        let message = `Zoopla scraping failed: ${error.message}`;
        if (error instanceof ScrapingError) {
            message = `Zoopla scraping error: ${error.message}`;
        }

        await notifyTelegram(message);

        if (error instanceof ScrapingError) {
            logger.error('Zoopla scraping failed', error, { url });
            throw error;
        }

        const scrapingError = new ScrapingError(error.message, 'Zoopla', url, error);
        logger.error('Zoopla scraping encountered an unexpected error', scrapingError, { url });
        throw scrapingError;
    } finally {
        if (context) {
            await context.close().catch((closeError) => {
                logger.warn('Failed to close Playwright context', { error: closeError.message });
            });
        }
    }
}

export default createScraperWrapper('Zoopla', getZooplaListingsInternal);
