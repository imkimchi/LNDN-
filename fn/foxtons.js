import browserPool from '../utils/browserPool.js';

import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';

async function getFoxtonsListingsInternal(url) {
    let browser;
    
    try {
        browser = await browserPool.getBrowser();
        if (!browser) {
            throw new ScrapingError('Failed to get browser from pool', 'Foxtons', url);
        }

        const page = await browser.newPage();
        
        // Set user agent and viewport
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // Navigate to the page
        await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 3000));

        const listings = await page.evaluate(() => {
            const results = [];
            
            // Strategy 1: Extract from JSON-LD structured data
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            
            for (const script of scripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    
                    // Look for ItemList with property URLs
                    if (data['@type'] === 'ItemList' && data.itemListElement) {
                        data.itemListElement.forEach(item => {
                            if (item.url && item.url.includes('/properties-to-rent/')) {
                                // Extract property ID from URL
                                const urlParts = item.url.split('/');
                                const propertyId = urlParts[urlParts.length - 1];
                                
                                results.push({
                                    id: propertyId,
                                    link: item.url,
                                    title: `Foxtons Property ${propertyId}`
                                });
                            }
                        });
                    }
                } catch (e) {
                    // Continue to fallback strategy
                }
            }
            
            // Strategy 2: DOM scraping fallback (if JSON-LD doesn't work)
            if (results.length === 0) {
                const propertyLinks = document.querySelectorAll('a[href*="/properties-to-rent/"]');
                
                propertyLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && href.includes('/properties-to-rent/')) {
                        const urlParts = href.split('/');
                        const propertyId = urlParts[urlParts.length - 1];
                        
                        if (!results.some(r => r.id === propertyId)) {
                            let title = link.textContent?.trim() || '';
                            if (!title) {
                                const parent = link.closest('[class*="property"], [class*="listing"], [class*="card"]');
                                if (parent) {
                                    const titleEl = parent.querySelector('h1, h2, h3, h4, [class*="title"]');
                                    title = titleEl?.textContent?.trim() || '';
                                }
                            }
                            
                            results.push({
                                id: propertyId,
                                link: href.startsWith('http') ? href : `https://www.foxtons.co.uk${href}`,
                                title: title || `Foxtons Property ${propertyId}`
                            });
                        }
                    }
                });
            }
            
            return results;
        });

        if (listings.length === 0) {
            throw new ScrapingError('No listings found - possible page structure change or bot detection', 'Foxtons', url);
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

export default createScraperWrapper('Foxtons', getFoxtonsListingsInternal);

