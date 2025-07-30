
import dayjs from 'dayjs';

import getZooplaListings from './fn/zoopla.js';
import getSpareroomListings from './fn/spareroom.js';
import getRightmoveListings from './fn/rightmove.js';
import getFoxtonsListings from './fn/foxtons.js';

import { getSavedSearchId, getUrlType, getSearchIdentifier } from './utils/urlUtils.js';
import { getListingsFilePath, readPreviousListings, writeListings } from './utils/fileUtils.js';

import bot from './services/bot.js';
import configManager from './utils/config.js';
import dotenv from 'dotenv';

dotenv.config();

// Validate environment and load configuration
try {
    configManager.validateEnvironment();
} catch (error) {
    console.error('Configuration Error:', error.message);
    process.exit(1);
}

const config = configManager.getAppConfig();
const urls = configManager.getSearches();
async function getCurrentListings(url) {
    if (url.includes('spareroom')) return getSpareroomListings(url);
    if (url.includes('rightmove')) return getRightmoveListings(url);
    if (url.includes('zoopla')) return getZooplaListings(url);
    if (url.includes('foxtons')) return getFoxtonsListings(url);
    return [];
}

async function checkForNewListings(name, url) {
    if (!url) return;
    try {
        const urlType = getUrlType(url);
        const searchIdParam = getSearchIdentifier(urlType);
        const currentListings = await getCurrentListings(url);
        const searchId = getSavedSearchId(url, searchIdParam);
        const listingsFile = getListingsFilePath(urlType, searchId);
        const previousListings = readPreviousListings(listingsFile);
        const newListings = currentListings.filter(listing => !previousListings.some(prevListing => prevListing.id === listing.id));

        if (newListings.length > 0) {
            newListings.forEach(listing => {
                if (previousListings.length > 0) {
                    bot.sendMessage(config.chatId, `${name}\n ${listing.link}\n`);
                }
            });

            writeListings(listingsFile, currentListings);
        }
    } catch (e) {
        console.error("Error checking for new listings:", e, dayjs().format('MM-DD HH:mm:ss'));
    }
}

let runCount = 0;

async function trackListings() {
    runCount += 1;
    const startTime = Date.now();
    
    // Process all URLs in parallel for better performance
    const promises = urls.map(({ name, url }) => 
        checkForNewListings(name, url).catch(error => {
            console.error(`Failed to process ${name}:`, error.message);
            return null; // Don't let one failure stop the others
        })
    );
    
    await Promise.allSettled(promises);
    
    const duration = Date.now() - startTime;
    process.stdout.clearLine();  // Clear the current text in the console
    process.stdout.cursorTo(0);  // Move the cursor to the beginning of the line
    process.stdout.write(`Ran ${runCount} times (${duration}ms)`);
}

setInterval(trackListings, config.intervalSeconds * 1000);
trackListings();

console.log("~ RUNNING ~");