import axios from 'axios';
import cheerio from 'cheerio';
import { createScraperWrapper, ScrapingError } from '../utils/errorHandler.js';

async function getRightmoveListingsInternal(url) {
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }
    });

    if (!data) {
        throw new ScrapingError('No data received from Rightmove', 'Rightmove', url);
    }
    
    const $ = cheerio.load(data);
    const listings = [];

    $('.propertyCard').each((index, element) => {
        const title = $(element).find('.propertyCard-title').text().trim();
        const linkPath = $(element).find('.propertyCard-link').attr('href');
        const link = linkPath ? 'https://www.rightmove.co.uk' + linkPath : null;
        const price = $(element).find('.propertyCard-priceValue').text().trim();
        const id = $(element).find('.propertyCard-anchor').attr('id');

        if (title && link) {
            listings.push({ title, link, id });
        }
    });

    // Remove first element if it exists (original behavior)
    if (listings.length > 0) {
        listings.shift();
    }

    if (listings.length === 0) {
        throw new ScrapingError('No listings found - possible page structure change', 'Rightmove', url);
    }
    
    return listings;
}

export default createScraperWrapper('Rightmove', getRightmoveListingsInternal);