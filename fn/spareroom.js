import * as cheerio from 'cheerio';
import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';
import { fetchWithRetry } from '../utils/httpClient.js';
import { sanitizeUrl } from '../utils/validation.js';
import logger from '../utils/logger.js';

/**
 * Cleans and normalizes price text from SpareRoom listings
 * @param {string} priceText - Raw price text from the page
 * @returns {string} Cleaned price text
 */
function cleanPriceText(priceText) {
    if (!priceText || typeof priceText !== 'string') {
        return '';
    }
    
    return priceText
        .trim()
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .replace(/\s+pcm\s*-\s*bills\s+inc\.?/i, ' pcm - bills inc')  // Normalize bills included text
        .replace(/\s+pcm\s*$/i, ' pcm')  // Normalize pcm ending
        .trim();
}

// Extracts listings from the HTML
function extractListings($) {
    const results = [];
    $('.listing-results .listing-result').each((_, el) => {
        const $el = $(el);
        const id = $el.attr('data-listing-id');
        const $link = $el.find('a[href^="/flatshare/"]');
        const title = $link.attr('title');
        const link = $link.attr('href');
        const priceRaw = $el.find('.listing-card__price').text();
        const price = cleanPriceText(priceRaw);
        
        // Extract location information
        const location = $el.find('.listing-results-location, .location, .area-title, .area-name').text().trim() || 
                        $el.find('[class*="location"], [class*="area"]').text().trim() || null;

        if (id && title && link) {
            results.push({
                id,
                title,
                link: `https://www.spareroom.co.uk${link}`,
                price,
                images: [], // Will be populated later
                // Additional fields for consistency with Rightmove
                bedrooms: null,
                bathrooms: null,
                location: location,
                summary: null,
                addedDate: null
            });
        }
    });
    return results;
}

/**
 * Extracts images from a SpareRoom listing page
 * @param {string} listingUrl - The URL of the listing page
 * @param {Object} headers - HTTP headers to use
 * @returns {Promise<Array<string>>} Array of image URLs
 */
async function extractImages(listingUrl, headers) {
    try {
        const sanitizedUrl = sanitizeUrl(listingUrl);
        const response = await fetchWithRetry(sanitizedUrl, {
            headers,
            timeout: 30000
        });
        
        const $ = cheerio.load(response.data);
        const images = new Set();
        
        $('a[href*="photos"]').each((_, link) => {
            const href = $(link).attr('href');
            if (href && href.includes('photos2.spareroom.co.uk') && href.includes('/large/')) {
                images.add(href);
            }
        });
        
        const imageArray = Array.from(images);
        logger.debug('Images extracted', {
            url: listingUrl,
            imageCount: imageArray.length
        });
        
        return imageArray;
    } catch (error) {
        logger.warn('Could not fetch images for listing', {
            url: listingUrl,
            error: error.message
        });
        return [];
    }
}

/**
 * Main SpareRoom scraping function
 * @param {string} url - The SpareRoom search URL to scrape
 * @returns {Promise<Array>} Array of listing objects
 * @throws {ScrapingError} If scraping fails
 */
async function getSpareroomListingsInternal(url) {
    try {
        logger.debug('Starting SpareRoom scraping', { url });
        
        const sanitizedUrl = sanitizeUrl(url);
        const response = await fetchWithRetry(sanitizedUrl, {
            timeout: 45000,
            maxRetries: 3
        });

        const $ = cheerio.load(response.data);
        const listings = extractListings($);
        
        logger.debug('Listings extracted from page', {
            url: sanitizedUrl,
            count: listings.length
        });
        
        if (listings.length === 0) {
            throw new ScrapingError('No listings found on page', 'SpareRoom', sanitizedUrl);
        }

        // Fetch images for each listing with optimized concurrent processing
        const imagePromises = listings.map(async (listing, index) => {
            // Add small delay to stagger requests
            await new Promise(resolve => setTimeout(resolve, index * 50));
            listing.images = await extractImages(listing.link);
            return listing;
        });
        
        await Promise.all(imagePromises);
        
        logger.info('SpareRoom scraping completed', {
            url: sanitizedUrl,
            listingCount: listings.length,
            totalImages: listings.reduce((sum, l) => sum + l.images.length, 0)
        });

        return listings;

    } catch (error) {
        if (error instanceof ScrapingError) {
            logger.error('SpareRoom scraping failed', error, { url });
            throw error;
        }
        
        if (error.response) {
            const scrapingError = new ScrapingError(
                `HTTP error ${error.response.status}: ${error.response.statusText}`,
                'SpareRoom',
                url
            );
            logger.error('SpareRoom HTTP error', scrapingError, { 
                url,
                status: error.response.status
            });
            throw scrapingError;
        }
        
        const scrapingError = new ScrapingError(`Request error: ${error.message}`, 'SpareRoom', url);
        logger.error('SpareRoom request error', scrapingError, { url });
        throw scrapingError;
    }
}

export default createScraperWrapper('SpareRoom', getSpareroomListingsInternal);