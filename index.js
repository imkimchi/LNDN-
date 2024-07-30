
import dayjs from 'dayjs';

import getZooplaListings from './fn/zoopla.js';
import getSpareroomListings from './fn/spareroom.js';
import getRightmoveListings from './fn/rightmove.js'

import { getSavedSearchId, getUrlType, getSearchIdentifier } from './utils/urlUtils.js';
import { getListingsFilePath, readPreviousListings, writeListings } from './utils/fileUtils.js';

import bot from './services/bot.js'
import dotenv from 'dotenv'
dotenv.config()


const urls = [
    {
        name: '3 bed',
        url: "https://www.spareroom.co.uk/flatshare/?search_id=1311581025&sort_by=days_since_placed&mode=list"
    },
    {
        name: 'room for a 2 bed flat',
        url: 'https://www.spareroom.co.uk/flatshare/?search_id=1311581097&sort_by=days_since_placed&mode=list'
    },
    {
        name: 'Studio',
        url: 'https://www.spareroom.co.uk/flatshare/index.cgi?search_id=1311085669&offset=0&sort_by=days_since_placed'
    },
    {
        name: '1bed',
        url: 'https://www.rightmove.co.uk/property-to-rent/find.html?locationIdentifier=REGION%5E87490&sortType=6&savedSearchId=52349125&maxBedrooms=1&minBedrooms=0&maxPrice=1300&minPrice=800&radius=0&includeLetAgreed=false'
    },
    // {
    //     name: 'Studio',
    //     url: 'https://www.zoopla.co.uk/to-rent/property/furzedown/?search_identifier=2af918e02b6ed1799b742d6df0b82ff80573475747f8be244785ffe8c414a91c'
    // }
];
async function getCurrentListings(url) {
    if (url.includes('spareroom')) return getSpareroomListings(url);
    if (url.includes('rightmove')) return getRightmoveListings(url);
    if (url.includes('zoopla')) return getZooplaListings(url);
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
                    bot.sendMessage(process.env.CHAT_ID, `${name}\n ${listing.link}\n`);
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
    for (const { name, url } of urls) {
        await checkForNewListings(name, url);
    }
    process.stdout.clearLine();  // Clear the current text in the console
    process.stdout.cursorTo(0);  // Move the cursor to the beginning of the line
    process.stdout.write(`Ran ${runCount} times`);
}

setInterval(trackListings, 20 * 1000);
trackListings();

console.log("~ RUNNING ~");