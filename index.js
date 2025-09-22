
import getSpareroomListings from './fn/spareroom.js';
import getRightmoveListings from './fn/rightmove.js';
import getZooplaListings from './fn/zoopla.js';
import getFoxtonsListings from './fn/foxtons.js';
import getDextersListings from './fn/dexters.js';
import getOnTheMarketListings from './fn/onthemarket.js';
import { getSavedSearchId, getUrlType, getSearchIdentifier } from './utils/urlUtils.js';
import { getListingsFilePath, readPreviousListings, writeListings, readSentSignatures, writeSentSignatures } from './utils/fileUtils.js';
import getBotInstance, { sendListingWithImages } from './services/bot.js';
import configManager from './utils/config.js';
import logger from './utils/logger.js';
import { validateConfig, validateSearches } from './utils/validation.js';
import messageQueue from './utils/messageQueue.js';
import { initListingStore, syncListings, markListingAsSent, closeListingStore, isListingStoreEnabled, getExistingListingKeysForSearch } from './services/listingStore.js';
import { startApiServer, stopApiServer } from './services/apiServer.js';
import { toListingKey } from './utils/listingUtils.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize bot instance
getBotInstance();

try {
    const storeInitialised = await initListingStore();
    if (storeInitialised) {
        await startApiServer();
    }
} catch (error) {
    logger.error('Failed to initialise persistence layer', error);
}

// Validate environment and load configuration
try {
    configManager.validateEnvironment();
    
    // Validate app configuration
    const appConfig = configManager.getAppConfig();
    const configValidation = validateConfig(appConfig);
    if (!configValidation.isValid) {
        throw new Error(`Invalid configuration: ${configValidation.errors.join(', ')}`);
    }
    
    // Validate searches configuration
    const searches = configManager.getSearches();
    const searchValidation = validateSearches(searches);
    if (!searchValidation.isValid) {
        throw new Error(`Invalid searches configuration: ${searchValidation.errors.join(', ')}`);
    }
    
    logger.lifecycle('Application started', {
        searchCount: searches.length,
        intervalSeconds: appConfig.intervalSeconds
    });
    
} catch (error) {
    logger.error('Configuration Error', error);
    process.exit(1);
}

const config = configManager.getAppConfig();
const urls = configManager.getSearches();
let isRunning = false;

// Optimized global cache with LRU-like behavior to prevent memory leaks
class ListingCache {
    constructor(maxSize = 10000) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    
    has(key) {
        return this.cache.has(key);
    }
    
    add(key) {
        // If at capacity, remove oldest entries (approximate LRU)
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, Date.now());
    }
    
    size() {
        return this.cache.size;
    }
    
    clear() {
        this.cache.clear();
    }
}

const globalSeenListings = new ListingCache();
const globalSentSignatures = new Set(readSentSignatures());
// Tracks signatures currently being processed to prevent concurrent duplicates
const globalInFlightSignatures = new Set();

function normalizeText(value) {
    if (!value || typeof value !== 'string') return '';
    return value
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
}

function priceToNumber(price) {
    if (!price || typeof price !== 'string') return '';
    const m = price.replace(/,/g, '').match(/(\d{2,})/);
    return m ? m[1] : '';
}

function urlKey(link) {
    try {
        const u = new URL(link);
        return `${u.hostname}${u.pathname}`.toLowerCase();
    } catch {
        return '';
    }
}

function makeSignature(listing) {
    const title = normalizeText(listing.title);
    const loc = normalizeText(listing.location || listing.address || '');
    const price = priceToNumber(listing.price || '');
    const base = `${title}|${loc}|${price}`.trim();
    if (base.replace(/\|/g, '') !== '') return base; // not all empty
    // Fallback to URL-derived key
    const key = urlKey(listing.link || '');
    return key || `${title}|${price}`;
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after the specified time
 */
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gets listings from the appropriate scraper based on URL
 * @param {string} url - The URL to scrape
 * @returns {Promise<Array>} Array of listings
 */
async function getCurrentListings(url) {
    const startTime = Date.now();
    let scraperName = 'unknown';
    
    try {
        if (url.includes('spareroom')) {
            scraperName = 'SpareRoom';
            return await getSpareroomListings(url);
        }
        if (url.includes('rightmove')) {
            scraperName = 'Rightmove';
            return await getRightmoveListings(url);
        }
        if (url.includes('zoopla')) {
            scraperName = 'Zoopla';
            return await getZooplaListings(url);
        }
        if (url.includes('onthemarket')) {
            scraperName = 'OnTheMarket';
            return await getOnTheMarketListings(url);
        }
        if (url.includes('foxtons')) {
            scraperName = 'Foxtons';
            return await getFoxtonsListings(url);
        }
        if (url.includes('dexters')) {
            scraperName = 'Dexters';
            return await getDextersListings(url);
        }

        logger.warn('Unknown URL type', { url });
        return [];
    } finally {
        const duration = Date.now() - startTime;
        logger.performance(`${scraperName} scraping`, duration, { url });
    }
}

/**
 * Checks for new listings and sends notifications
 * @param {string} name - The search name
 * @param {string} url - The search URL
 */
async function checkForNewListings(name, url) {
    if (!url) {
        logger.warn('Empty URL provided', { searchName: name });
        return;
    }
    
    const startTime = Date.now();
    
    try {
        const urlType = getUrlType(url);
        if (!urlType) {
            logger.error('Unsupported URL type', { url, searchName: name });
            return;
        }
        
        const searchIdParam = getSearchIdentifier(urlType);
        let currentListings = await getCurrentListings(url);
        const searchId = getSavedSearchId(url, searchIdParam);
        const listingsFile = getListingsFilePath(urlType, searchId);
        const useListingStore = isListingStoreEnabled();

        // Optimized new listings detection using Set for O(1) lookup
        // Filter out unwanted Rightmove listings (e.g., Parking only)
        if (urlType === 'rightmove') {
            const before = currentListings.length;
            currentListings = currentListings.filter(l => (l.title || '').trim().toLowerCase() !== 'parking');
            const removed = before - currentListings.length;
            if (removed > 0) {
                logger.info('Filtered Rightmove listings by title', { removed, reason: 'title==Parking' });
            }
        }

        const keyedListings = currentListings.map(listing => ({
            listing,
            key: toListingKey(urlType, listing.id, listing.link)
        }));

        let newListings;

        if (useListingStore) {
            const identifiableEntries = keyedListings.filter(entry => entry.listing.id || entry.listing.link);
            const keysToCheck = identifiableEntries.map(entry => entry.key);
            const existingKeys = await getExistingListingKeysForSearch(keysToCheck, name);
            newListings = identifiableEntries
                .filter(entry => !existingKeys.has(entry.key))
                .map(entry => entry.listing);
        } else {
            const previousListings = readPreviousListings(listingsFile);
            const previousIds = new Set(previousListings.map(listing => listing.id));
            const identifiableListings = currentListings.filter(listing => Boolean(listing.id));
            newListings = identifiableListings.filter(listing => !previousIds.has(listing.id));
        }

        // Filter out globally seen listings (prevents duplicates across multiple URLs)
        const trulyNewListings = [];
        for (const listing of newListings) {
            const globalKey = `${urlType}:${listing.id}`;
            if (!globalSeenListings.has(globalKey)) {
                globalSeenListings.add(globalKey);
                trulyNewListings.push(listing);
            }
        }
        
        const duplicateCount = newListings.length - trulyNewListings.length;

        // Cross-source deduplication using content-based signature
        const crossSourceUnique = [];
        let inFlightSkipped = 0;
        for (const listing of trulyNewListings) {
            const sig = makeSignature(listing);
            if (globalSentSignatures.has(sig)) {
                logger.debug('Skipping duplicate already sent', { signature: sig, title: listing.title, link: listing.link });
                continue;
            }
            // Prevent duplicates within the same cycle across concurrent searches
            if (globalInFlightSignatures.has(sig)) {
                inFlightSkipped++;
                logger.debug('Skipping duplicate in-flight', { signature: sig, title: listing.title, link: listing.link });
                continue;
            }
            globalInFlightSignatures.add(sig);
            crossSourceUnique.push({ listing, signature: sig });
        }

        if (crossSourceUnique.length > 0) {
            logger.info('New listings found', {
                searchName: name,
                newCount: crossSourceUnique.length,
                duplicateCount,
                totalCurrent: currentListings.length,
                urlType,
                inFlightSkipped
            });
            
            // Send notifications for new listings
            let successCount = 0;
            let errorCount = 0;
            
            for (const item of crossSourceUnique) {
                const listing = item.listing;
                try {
                    await sendListingWithImages(config.chatId, listing, name);
                    successCount++;
                    globalSentSignatures.add(item.signature);
                    await markListingAsSent(urlType, listing.id);
                    // Persist ASAP to reduce chance of duplicates after restart
                    try {
                        writeSentSignatures(Array.from(globalSentSignatures));
                    } catch (e) {
                        logger.warn('Failed to persist sent signature immediately', { error: e.message });
                    }
                    logger.debug('Listing notification sent', {
                        listingId: listing.id,
                        searchName: name
                    });

                    // Add SpareRoom listings to messaging queue for automated contact
                    if (urlType === 'spareroom' && listing.link) {
                        messageQueue.addToQueue(listing.link, {
                            id: listing.id,
                            title: listing.title,
                            searchName: name
                        });
                    }
                    
                } catch (error) {
                    errorCount++;
                    logger.error('Failed to send listing notification', error, {
                        listingId: listing.id,
                        searchName: name
                    });
                } finally {
                    // Always clear from in-flight regardless of success to avoid permanent blockage
                    globalInFlightSignatures.delete(item.signature);
                }
            }
            
            logger.info('Notification batch completed', {
                searchName: name,
                successCount,
                errorCount,
                totalSent: trulyNewListings.length
            });
        }
        
        // Write all current listings to file for future comparison
        if (useListingStore) {
            await syncListings(urlType, name, url, currentListings);
        } else if (currentListings.length > 0) {
            writeListings(listingsFile, currentListings);
        }
        
        const duration = Date.now() - startTime;
        logger.performance('Check for new listings', duration, {
            searchName: name,
            urlType,
            currentCount: currentListings.length,
            newCount: newListings.length,
            trulyNewCount: trulyNewListings.length
        });
        
    } catch (error) {
        logger.error('Error checking for new listings', error, {
            searchName: name,
            url
        });
    }
}

let runCount = 0;

/**
 * Main function that processes all search URLs
 */
async function trackListings() {
    if (isRunning) {
        logger.debug('Previous monitoring cycle still running, skipping');
        return;
    }
    isRunning = true;
    runCount++;
    const startTime = Date.now();
    
    logger.info('Starting monitoring cycle', {
        runCount,
        searchCount: urls.length
    });
    
    const promises = urls.map(({ name, url }) => 
        checkForNewListings(name, url).catch(error => {
            logger.error('Failed to process search', error, {
                searchName: name,
                url
            });
        })
    );
    
    await Promise.allSettled(promises);

    const duration = Date.now() - startTime;
    logger.info('Monitoring cycle completed', {
        runCount,
        duration,
        cacheSize: globalSeenListings.size()
    });

    // Persist cross-source sent signatures after each cycle
    try {
        writeSentSignatures(Array.from(globalSentSignatures));
    } catch (e) {
        logger.warn('Failed to persist sent signatures', { error: e.message });
    }
    isRunning = false;
}

// Start the monitoring process
logger.lifecycle('Bot starting', {
    intervalSeconds: config.intervalSeconds,
    searchCount: urls.length
});

setInterval(trackListings, config.intervalSeconds * 1000);
trackListings();

// Graceful shutdown handling
process.on('SIGINT', async () => {
    logger.lifecycle('Shutdown signal received');
    await stopApiServer();
    await closeListingStore();
    await messageQueue.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.lifecycle('Termination signal received');
    await stopApiServer();
    await closeListingStore();
    await messageQueue.shutdown();
    process.exit(0);
});
