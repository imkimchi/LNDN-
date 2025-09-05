
import getSpareroomListings from './fn/spareroom.js';
import getRightmoveListings from './fn/rightmove.js';
import getZooplaListings from './fn/zoopla.js';
import getFoxtonsListings from './fn/foxtons.js';
import { getSavedSearchId, getUrlType, getSearchIdentifier } from './utils/urlUtils.js';
import { getListingsFilePath, readPreviousListings, writeListings } from './utils/fileUtils.js';
import getBotInstance, { sendListingWithImages } from './services/bot.js';
import configManager from './utils/config.js';
import logger from './utils/logger.js';
import { validateConfig, validateSearches } from './utils/validation.js';
import messageQueue from './utils/messageQueue.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize bot instance
getBotInstance();

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
        if (url.includes('foxtons')) {
            scraperName = 'Foxtons';
            return await getFoxtonsListings(url);
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
        const currentListings = await getCurrentListings(url);
        const searchId = getSavedSearchId(url, searchIdParam);
        const listingsFile = getListingsFilePath(urlType, searchId);
        const previousListings = readPreviousListings(listingsFile);
        
        // Optimized new listings detection using Set for O(1) lookup
        const previousIds = new Set(previousListings.map(listing => listing.id));
        const newListings = currentListings.filter(listing => 
            listing.id && !previousIds.has(listing.id)
        );

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

        if (trulyNewListings.length > 0) {
            logger.info('New listings found', {
                searchName: name,
                newCount: trulyNewListings.length,
                duplicateCount,
                totalCurrent: currentListings.length,
                urlType
            });
            
            // Send notifications for new listings
            let successCount = 0;
            let errorCount = 0;
            
            for (const listing of trulyNewListings) {
                try {
                    await sendListingWithImages(config.chatId, listing, name);
                    successCount++;
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
        if (currentListings.length > 0) {
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
    await messageQueue.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.lifecycle('Termination signal received');
    await messageQueue.shutdown();
    process.exit(0);
});