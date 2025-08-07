import dayjs from 'dayjs';
import dotenv from 'dotenv';
import browserPool from '../utils/browserPool.js';

dotenv.config();

const headless = {
    headless: true,
    args: ["--disable-notifications", "--auto-open-devtools-for-tabs", "--no-sandbox", "--window-size=1280,720", "--disable-dev-shm-usage" ],
    defaultViewport: null,
    targetFilter: (target) => !!target.url()
}

const nonheadless = {
    headless: false,
    // args: [ "--disable-notifications", "--auto-open-devtools-for-tabs", "--no-sandbox", "--window-size=1280,720", "--disable-dev-shm-usage" ],
    targetFilter: target => target.type() !== 'other'
}


const rawCookies = process.env.ZOOPLA_COOKIES || '';

// Parse cookies more carefully, handling JSON values
function parseCookiesString(cookiesStr) {
    if (!cookiesStr) return [];
    
    const cookies = [];
    const parts = cookiesStr.split('; ');
    
    for (const part of parts) {
        const equalIndex = part.indexOf('=');
        if (equalIndex === -1) continue;
        
        const name = part.substring(0, equalIndex).trim();
        const value = part.substring(equalIndex + 1).trim();
        
        if (name && value) {
            const cookie = {
                name,
                value,
                path: '/'
            };
            
            // __Host- cookies require specific settings
            if (name.startsWith('__Host-')) {
                cookie.domain = undefined; // Must be undefined for __Host- cookies
                cookie.secure = true; // Must be secure
            } else {
                cookie.domain = '.zoopla.co.uk';
            }
            
            cookies.push(cookie);
        }
    }
    
    return cookies;
}

const parsedCookies = parseCookiesString(rawCookies);
// console.log("parsedCookies", parsedCookies)

import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';

async function getZooplaListingsInternal(url) {
    let browser;
    
    try {
        if (!rawCookies) {
            throw new ScrapingError('ZOOPLA_COOKIES environment variable not set', 'Zoopla', url);
        }

        browser = await browserPool.getBrowser();
        if (!browser) {
            throw new ScrapingError('Failed to get browser from pool', 'Zoopla', url);
        }

        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36');
        
        // Set cookies one by one to identify problematic ones
        for (const cookie of parsedCookies) {
            try {
                await page.setCookie(cookie);
            } catch (cookieError) {
                console.log(`Failed to set cookie ${cookie.name}: ${cookieError.message}`);
                // Continue with other cookies
            }
        }

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br'
        });

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        try {
            await page.waitForSelector('[data-testid="regular-listings"]', { visible: true, timeout: 10000 });
        } catch (selectorError) {
            throw new ScrapingError('Listings container not found - page may have changed or cookies expired', 'Zoopla', url, selectorError);
        }

        const searchList = await page.$$('[data-testid="regular-listings"] > *');
        const listings = [];

        for (const element of searchList) {
            const listingData = await element.evaluate(el => {
                const id = el.getAttribute('id')?.split('_')[1];
                if (!id) return null;
                
                // Extract price from data-testid="listing-price"
                const priceElement = el.querySelector('[data-testid="listing-price"]');
                const price = priceElement?.textContent?.trim() || '';
                
                // Extract address from address element
                const addressElement = el.querySelector('address');
                const address = addressElement?.textContent?.trim() || '';
                
                // Extract bed count from first p tag text (e.g., "1 bed")
                const firstP = el.querySelector('p');
                const bedText = firstP?.textContent?.trim() || '';
                const beds = bedText.match(/(\d+)\s*bed/i)?.[1] || '';
                
                return {
                    id,
                    price,
                    address,
                    beds
                };
            });

            if (listingData && listingData.id) {
                const link = `https://www.zoopla.co.uk/to-rent/details/${listingData.id}/`;
                
                // Create title combining beds, price and address
                let title = '';
                if (listingData.beds) title += `${listingData.beds} bed`;
                if (listingData.price) title += (title ? ' • ' : '') + listingData.price;
                if (listingData.address) title += (title ? ' • ' : '') + listingData.address;
                
                listings.push({ 
                    link, 
                    id: listingData.id,
                    title: title || `Property ${listingData.id}`,
                    price: listingData.price || 'Price not available',
                    address: listingData.address || 'Address not available',
                    beds: listingData.beds || 'Not specified'
                });
            }
        }

        if (listings.length === 0) {
            throw new ScrapingError('No listings found - possible authentication issue or page structure change', 'Zoopla', url);
        }

        return listings;
    } finally {
        if (browser) {
            // Close the page but keep browser for reuse
            const pages = await browser.pages();
            await Promise.all(pages.slice(1).map(page => page.close())); // Close all pages except the first one
            await browserPool.releaseBrowser(browser);
        }
    }
}

export default createScraperWrapper('Zoopla', getZooplaListingsInternal);
