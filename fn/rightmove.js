import { JSDOM, VirtualConsole } from 'jsdom';
import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';
import { fetchWithRetry } from '../utils/httpClient.js';
import { sanitizeUrl } from '../utils/validation.js';
import logger from '../utils/logger.js';

/**
 * Extracts property data from Rightmove page's JSON structure
 * @param {string} html - The HTML content of the page
 * @returns {Array|null} Array of property objects or null if extraction fails
 */
function extractJsonFromPage(html) {
    try {
        // Create a virtual console that suppresses CSS parsing errors
        const virtualConsole = new VirtualConsole();
        virtualConsole.on("error", (error) => {
            // Suppress CSS parsing errors but log other errors
            if (!error.message.includes('Could not parse CSS stylesheet')) {
                logger.debug('JSDOM error (non-CSS)', { error: error.message });
            }
        });
        
        const dom = new JSDOM(html, {
            virtualConsole,
            resources: "usable",
            runScripts: "outside-only",
            pretendToBeVisual: false
        });
        
        const document = dom.window.document;

        // First try to get data from __NEXT_DATA__ script tag
        const nextDataScript = document.querySelector('#__NEXT_DATA__');
        if (nextDataScript && nextDataScript.textContent) {
            const jsonData = JSON.parse(nextDataScript.textContent);
            const properties = jsonData?.props?.pageProps?.searchResults?.properties;
            if (properties && Array.isArray(properties)) {
                logger.debug('JSON data extracted from Rightmove page', {
                    propertyCount: properties.length
                });
                return properties;
            }
        }

    } catch (error) {
        logger.warn('Error parsing JSON from Rightmove page', { error: error.message });
        // If JSDOM fails entirely, fall back to regex extraction
        return extractJsonWithRegex(html);
    }

    return null;
}

/**
 * Fallback function to extract JSON data using regex when JSDOM fails
 * @param {string} html - The HTML content
 * @returns {Array|null} Array of property objects or null
 */
function extractJsonWithRegex(html) {
    try {
        // Look for the __NEXT_DATA__ script tag content
        const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        if (nextDataMatch && nextDataMatch[1]) {
            const jsonData = JSON.parse(nextDataMatch[1]);
            const properties = jsonData?.props?.pageProps?.searchResults?.properties;
            if (properties && Array.isArray(properties)) {
                logger.debug('JSON data extracted using regex fallback', {
                    propertyCount: properties.length
                });
                return properties;
            }
        }
    } catch (error) {
        logger.debug('Regex extraction failed', { error: error.message });
    }
    
    return null;
}

/**
 * Main Rightmove scraping function with retry logic
 * @param {string} url - The Rightmove search URL to scrape
 * @returns {Promise<Array>} Array of listing objects
 * @throws {ScrapingError} If scraping fails after retries
 */
async function getRightmoveListingsInternal(url) {
    try {
        logger.debug('Starting Rightmove scraping', { url });
        
        const sanitizedUrl = sanitizeUrl(url);
        const response = await fetchWithRetry(sanitizedUrl, {
            timeout: 30000,
            maxRetries: 3,
            retryDelay: 2000
        });

        if (!response.data) {
            throw new ScrapingError('No data received from Rightmove', 'Rightmove', sanitizedUrl);
        }
        
        return processRightmoveData(response.data, sanitizedUrl);
        
    } catch (error) {
        if (error instanceof ScrapingError) {
            logger.error('Rightmove scraping failed', error, { url });
            throw error;
        }
        
        const scrapingError = new ScrapingError(`Request failed: ${error.message}`, 'Rightmove', url);
        logger.error('Rightmove request error', scrapingError, { url });
        throw scrapingError;
    }
}

/**
 * Processes the HTML data from Rightmove and extracts property listings
 * @param {string} data - The HTML data from the page
 * @param {string} url - The URL that was scraped
 * @returns {Array} Array of processed listing objects
 * @throws {ScrapingError} If no valid data is found
 */
function processRightmoveData(data, url) {
    // Extract JSON data from the page
    const properties = extractJsonFromPage(data);
    
    if (!properties || !Array.isArray(properties)) {
        throw new ScrapingError('No property JSON data found in page', 'Rightmove', url);
    }

    // Map the rich JSON data to our listing format
    const listings = properties.map(property => {
        const id = property.id?.toString();
        const title = property.propertyTypeFullDescription || 
                     `${property.bedrooms} bed ${property.propertySubType}` ||
                     property.displayAddress;
        const link = property.propertyUrl ? 
                    `https://www.rightmove.co.uk${property.propertyUrl}` : null;
        const price = property.price ? 
                     `£${property.price.amount}${property.price.frequency === 'monthly' ? ' pcm' : ''}` : '';
        
        // Extract images if available
        const images = property.propertyImages?.images?.map(img => img.srcUrl || img.url).filter(Boolean) || [];

        return {
            id,
            title,
            link,
            price,
            images,
            // Additional fields for consistency with SpareRoom
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
            location: property.displayAddress,
            summary: property.summary,
            addedDate: property.addedOrReduced
        };
    }).filter(listing => listing.id && listing.link);

    if (listings.length === 0) {
        throw new ScrapingError('No valid listings found in JSON data', 'Rightmove', url);
    }


    // console.log("url", listings)
    
    logger.info('Rightmove scraping completed', {
        url,
        listingCount: listings.length,
        totalImages: listings.reduce((sum, l) => sum + l.images.length, 0)
    });
    
    return listings;
}

export default createScraperWrapper('Rightmove', getRightmoveListingsInternal);