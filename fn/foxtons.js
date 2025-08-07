import axios from 'axios';
import * as cheerio from 'cheerio';
import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';

// Extract detailed info from a single property page
async function getPropertyDetails(propertyUrl, headers) {
    try {
        const response = await axios.get(propertyUrl, { headers, timeout: 30000 });
        const $ = cheerio.load(response.data);
        
        // Try to get data from JSON-LD first
        const scripts = $('script[type="application/ld+json"]');
        
        for (let i = 0; i < scripts.length; i++) {
            try {
                const data = JSON.parse($(scripts[i]).html());
                if (data['@type'] === 'Product' && data.offers && data.additionalProperty) {
                    // Extract address from additionalProperty
                    const addressProperty = data.additionalProperty?.find(prop => prop.name === 'address');
                    const address = addressProperty?.value;
                    
                    return {
                        title: data.name || $('h1').text().trim() || 'Property',
                        price: data.offers.priceSpecification?.price ? 
                               `£${data.offers.priceSpecification.price} pcm` : 
                               $('.price, [class*="price"]').first().text().trim(),
                        location: address ? 
                                 `${address.streetAddress}, ${address.addressLocality}, ${address.postalCode}` : 
                                 $('h1').text().trim(),
                        description: data.description || null,
                        images: data.image ? [data.image] : []
                    };
                }
            } catch (e) {
                // Continue to next script or fallback
            }
        }
        
        // Fallback: extract from DOM
        const title = $('h1').text().trim() || $('title').text().replace(' | Foxtons', '').trim();
        const price = $('[class*="price"]').first().text().trim();
        const location = $('h1').text().trim();
        
        return {
            title: title || 'Property',
            price: price || null,
            location: location || null,
            description: null,
            images: []
        };
        
    } catch (error) {
        console.warn(`Failed to get details for ${propertyUrl}: ${error.message}`);
        return {
            title: 'Property',
            price: null,
            location: null,
            description: null,
            images: []
        };
    }
}

async function getFoxtonsListingsInternal(url) {
    try {
        // Set up realistic headers to avoid detection
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Dnt': '1'
        };

        const response = await axios.get(url, {
            headers,
            timeout: 30000,
            maxRedirects: 5
        });

        const $ = cheerio.load(response.data);
        let propertyUrls = [];
        
        // Strategy 1: Extract from JSON-LD structured data
        const scripts = $('script[type="application/ld+json"]');
        
        scripts.each((_, script) => {
            try {
                const data = JSON.parse($(script).html());
                
                // Look for ItemList with property URLs
                if (data['@type'] === 'ItemList' && data.itemListElement) {
                    data.itemListElement.forEach(item => {
                        if (item.url && item.url.includes('/properties-to-rent/')) {
                            propertyUrls.push(item.url);
                        }
                    });
                }
            } catch (e) {
                // Continue to fallback strategy
            }
        });
        
        // Strategy 2: DOM scraping fallback (if JSON-LD doesn't work)
        if (propertyUrls.length === 0) {
            const propertyLinks = $('a[href*="/properties-to-rent/"]');
            
            propertyLinks.each((_, link) => {
                const href = $(link).attr('href');
                if (href && href.includes('/properties-to-rent/')) {
                    const fullUrl = href.startsWith('http') ? href : `https://www.foxtons.co.uk${href}`;
                    if (!propertyUrls.includes(fullUrl)) {
                        propertyUrls.push(fullUrl);
                    }
                }
            });
        }

        if (propertyUrls.length === 0) {
            throw new ScrapingError('No property URLs found - possible page structure change or bot detection', 'Foxtons', url);
        }

        // Now fetch details for each property
        const results = [];
        const maxConcurrent = 3; // Limit concurrent requests to avoid being blocked
        
        for (let i = 0; i < propertyUrls.length; i += maxConcurrent) {
            const batch = propertyUrls.slice(i, i + maxConcurrent);
            const batchPromises = batch.map(async (propertyUrl) => {
                const urlParts = propertyUrl.split('/');
                const propertyId = urlParts[urlParts.length - 1];
                
                const details = await getPropertyDetails(propertyUrl, headers);
                
                return {
                    id: propertyId,
                    link: propertyUrl,
                    title: details.title,
                    price: details.price,
                    location: details.location,
                    description: details.description,
                    images: details.images,
                    // Additional fields for consistency with other scrapers
                    bedrooms: null,
                    bathrooms: null,
                    summary: details.description,
                    addedDate: null
                };
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Add a small delay between batches to be respectful
            if (i + maxConcurrent < propertyUrls.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    } catch (error) {
        if (error instanceof ScrapingError) throw error;
        if (error.response) {
            throw new ScrapingError(`HTTP error ${error.response.status}: ${error.response.statusText}`, 'Foxtons', url);
        }
        throw new ScrapingError(`Request error: ${error.message}`, 'Foxtons', url);
    }
}

export default createScraperWrapper('Foxtons', getFoxtonsListingsInternal);

