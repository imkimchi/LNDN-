import axios from 'axios';
import cheerio from 'cheerio';

export default async function getRightmoveListings(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }});
        
        const $ = cheerio.load(data);
        const listings = [];
    
        $('.propertyCard').each((index, element) => {
            const title = $(element).find('.propertyCard-title').text().trim();
            const link = 'https://www.rightmove.co.uk' + $(element).find('.propertyCard-link').attr('href');
            const price = $(element).find('.propertyCard-priceValue').text().trim();
            const id = $(element).find('.propertyCard-anchor').attr('id');
    
            if (title && link) {
                listings.push({ title, link, id });
            }
        });

        listings.shift()
        return listings;
    } catch (e) {
        console.log("fetching ERROR", dayjs().format('MM-DD HH:mm:ss'))
        return []
    }
}