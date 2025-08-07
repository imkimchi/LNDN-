import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';

// Add stealth plugin
puppeteer.use(StealthPlugin());

async function getSpareroomListingsInternal(url) {
    let browser = null;
    let page = null;
    
    try {
        // Launch browser with better anti-detection
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-blink-features=AutomationControlled'
            ]
        });
        
        page = await browser.newPage();
        
        // Anti-detection measures
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });
        
        // Performance optimizations - only block ads/tracking
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            const url = req.url();
            
            if (resourceType === 'image' && !url.includes('photos2.spareroom.co.uk')) {
                req.abort();
            } else if (url.includes('google-analytics') || url.includes('facebook') || 
                      url.includes('doubleclick') || url.includes('adsystem')) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        // Set realistic user agent and viewport
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });
        
        // Navigate to search results page with longer timeout
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Extract listings using Puppeteer
        const listings = await page.evaluate(() => {
            const results = [];
            
            document.querySelectorAll('.listing-results .listing-result').forEach((element) => {
                const aa = element.querySelector('a');
                const title = aa?.getAttribute('title');
                const link = aa?.getAttribute('href');
                const id = element.getAttribute('data-listing-id');
                
                if (title && link) {
                    results.push({ 
                        title, 
                        link: `https://www.spareroom.co.uk${link}`, 
                        id 
                    });
                }
            });
            
            return results;
        });
        
        if (listings.length === 0) {
            throw new ScrapingError('No listings found - possible page structure change', 'SpareRoom', url);
        }
        
        // Extract images for each listing with modal interaction
        for (let listing of listings) {
            try {
                // Add random delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
                
                await page.goto(listing.link, { waitUntil: 'domcontentloaded', timeout: 45000 });
                
                const images = await page.evaluate(() => {
                    const imageUrls = [];
                    
                    // Extract images directly from photo links (no modal needed)
                    document.querySelectorAll('a[href*="photos"]').forEach((link) => {
                        const src = link.href;
                        if (src && src.includes('photos2.spareroom.co.uk') && 
                            src.includes('/large/') && !imageUrls.includes(src)) {
                            imageUrls.push(src);
                        }
                    });
                    
                    // Fallback: try to find images in img tags
                    if (imageUrls.length === 0) {
                        document.querySelectorAll('img').forEach((img) => {
                            const src = img.src || img.getAttribute('data-src');
                            if (src && src.includes('photos2.spareroom.co.uk') && 
                                src.includes('/large/') && !imageUrls.includes(src)) {
                                imageUrls.push(src);
                            }
                        });
                    }
                    
                    return imageUrls;
                });
                
                listing.images = images || [];
                
            } catch (error) {
                console.log(`Could not fetch images for ${listing.link}: ${error.message}`);
                listing.images = [];
            }
        }
        
        return listings;
        
    } catch (error) {
        if (error instanceof ScrapingError) {
            throw error;
        }
        throw new ScrapingError(`Browser error: ${error.message}`, 'SpareRoom', url);
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
}

export default createScraperWrapper('SpareRoom', getSpareroomListingsInternal);