import dayjs from 'dayjs';
import logger from './logger.js';

export class ScrapingError extends Error {
    constructor(message, scraperName, url, originalError = null) {
        super(message);
        this.name = 'ScrapingError';
        this.scraperName = scraperName;
        this.url = url;
        this.originalError = originalError;
        this.timestamp = dayjs().format('MM-DD HH:mm:ss');
    }
}

export function handleScrapingError(error, scraperName, url) {
    const timestamp = dayjs().format('MM-DD HH:mm:ss');
    
    if (error instanceof ScrapingError) {
        logger.error(`${scraperName} Scraping Error`, {
            timestamp,
            message: error.message,
            url: error.url,
            originalError: error.originalError?.message
        });
    } else {
        logger.error(`${scraperName} Unexpected Error`, {
            timestamp,
            message: error.message,
            stack: error.stack,
            url
        });
    }
    
    // Return empty array as fallback
    return [];
}

export function createScraperWrapper(scraperName, scraperFunction) {
    return async function wrappedScraper(url) {
        try {
            const result = await scraperFunction(url);
            
            if (!Array.isArray(result)) {
                throw new ScrapingError(
                    'Scraper returned non-array result',
                    scraperName,
                    url
                );
            }
            
            return result;
        } catch (error) {
            return handleScrapingError(error, scraperName, url);
        }
    };
}
