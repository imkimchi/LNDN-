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

const parsedCookies = rawCookies.split('; ').map(cookieStr => {
    const [name, ...rest] = cookieStr.split('=');
    return {
        name,
        value: rest.join('='), 
        domain: '.zoopla.co.uk', // Add appropriate domain
        path: '/' // Default path
    };
});
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
        await page.setCookie(...parsedCookies);

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
            const id = await element.evaluate(el => el.getAttribute('id')?.split('_')[1]);
            const link = `https://www.zoopla.co.uk/to-rent/details/${id}/`;

            if (id && link) {
                listings.push({ link, id });
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
