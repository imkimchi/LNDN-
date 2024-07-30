import axios from 'axios';
import cheerio from 'cheerio';

export default async function getSpareroomListings(url) {
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Sec-Ch-Ua': `"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"`,
            'Sec-Ch-Ua-Mobile': `?0`,
            'Sec-Ch-Ua-Platform': "macOS",
            'Sec-Fetch-Dest': `document`,
            'Sec-Fetch-Mode': `navigate`,
            'Sec-Fetch-Site': `same-origin`,
            'Sec-Fetch-User': `?1`,
            'Upgrade-Insecure-Requests': `1`
        }
    });
    const $ = cheerio.load(data);
    const listings = [];

    $('.listing-results .listing-result').each((index, element) => {
        const aa = $(element).find('a:eq(0)');
        const title = aa.attr('title');
        const link = aa.attr('href');
        const id = $(element).attr('data-listing-id');

        if (title && link) {
            listings.push({ title, link: `https://www.spareroom.co.uk${link}`, id });
        }
    });

    return listings;
}