import puppeteer from 'puppeteer-extra';
import dayjs from 'dayjs';

import createPuppeteerStealth from 'puppeteer-extra-plugin-stealth';

const puppeteerStealth = createPuppeteerStealth();
puppeteerStealth.enabledEvasions.delete('user-agent-override');
puppeteer.use(puppeteerStealth);


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


const rawCookies = 'ajs_anonymous_id=c9f676b374ee48e888bb4a79043fdfb3; base_device_id=6d3d7620-2220-44ab-a976-8780adc0280c; OptanonAlertBoxClosed=2024-07-26T16:25:53.813Z; eupubconsent-v2=CQCXHlgQCXHlgAcABBENA_FsAP_gAEPgAChQKYpB7C7FYWFDwGJVaLsEMAlHxtAAAsQgAASAA2ABAAKQBAQCgkAQBASgBAACAAIAIAJBIQAECAAAAUAAQAAAAAAAAAAAAAAIIAAAgAAAAAAIAAACAAAAEAAIgAAAkAAAmAgAAIIAWEAAhAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAQBAAAAAAAAAAAAAAAAAAAADff79Ln_-uB_--Cl8EYABYADwAKgAXAA4ACAAEgAMgAaAA8ACIAEwAKQAVQAugBiADQAHoAPgAfgBCQCIAIkARwAowBgADDAGiAPYAgABCACIgEWAI4AXUAxQBnwDXgHEAOkAdQBE4CLwFIgLzAX0Av8BggDJIGTAZOAywBqoEE4JygnMBOkCdcE7QTuAngBPMCfcE_QT-AoBBQQFCIKFgoYBRKCigKLQUZBRyCjwKPgUhgpICksFLgUvAAAAA.f_wACHwAAAAA; cookie_consents={"schemaVersion":4,"content":{"brand":1,"consents":[{"apiVersion":1,"stored":false,"date":"Fri, 26 Jul 2024 16:25:53 GMT","categories":[{"id":1,"consentGiven":true},{"id":3,"consentGiven":true},{"id":4,"consentGiven":true}]}]}}; adb_he=bfab545d0848bd6b11433c562c47c9d4e051d7475c4e0ea2b9622ad963150c77; filter_results_tooltip_dismissed=1; active_session=90e5422e-3b48-4ca7-b5b6-87b3900a5e1a; __Host-zooplaat=eyJhbGciOiJQUzI1NiJ9.eyJzdWIiOiI0YThhNzBhOTRjZTI0NmE2OTlhZjY5YjVhYzE5Y2U2MiIsInR5cGUiOiJhdXRoIiwiYXV0aF90aW1lIjoxNzIyMDE0MDc0LjE2LCJ1c2VyX3V1aWQiOiI4NzFjYmUzMC00YjcyLTExZWYtYmZlZC1mZmIzNmM5MDQ3NWYiLCJhdWQiOlsid3d3Lnpvb3BsYS5jby51ayIsImdyYXBocWwuem9vcGxhLmNvLnVrIl0sImlzcyI6Ind3dy56b29wbGEuY28udWsiLCJpYXQiOjE3MjIyODU0MzIsImV4cCI6MTcyMjI4NzIzMn0.O78gEviESk7rPw5Qwv3NAKx1o8TP_lowU6w9w1L45UAndzQ9D8bus94vZPD8tyX49vabDTOyUUYHD07vX7Jbfnu9NI3Skchys7-TQGP8SXvdEjC98y-VR_DieScTqoGcqFBqNIvZljunAIr0GIT7jzGo_krDqv8jkrtEKtK8t4LXmc3HBejOwE2-CfhC5f3upkVZ8sq3An9JdX6XZ97dDgb0RtXmr9i5y6fqY91vUv6OQCcKxPr6Kd_30S2aYJ9v4ZtpirsmRuEUnnuB_ig4vPyiEW05sudx4Qr9C70n3UfXL2stnJUcvepxS4kH9sNUW8yOSJpyxrioVIhy-IcXxw; base_session_start_page=https://www.zoopla.co.uk/to-rent/property/furzedown/?search_identifier=2af918e02b6ed1799b742d6df0b82ff80573475747f8be244785ffe8c414a91c; base_request=https://www.zoopla.co.uk/to-rent/property/furzedown/; base_session_id=9f7c5813-09fb-411b-9e53-34985c2ed24f; base_session_count=14; OptanonConsent=isGpcEnabled=0&datestamp=Mon+Jul+29+2024+21%3A37%3A19+GMT%2B0100+(British+Summer+Time)&version=202405.2.0&browserGpcFlag=0&isIABGlobal=false&consentId=738a893e-2776-43e2-bcc8-1e1a1f64665b&interactionCount=1&isAnonUser=1&landingPath=NotLandingPage&groups=C0003%3A1%2CC0005%3A1%2CC0004%3A1%2CC0001%3A1%2CC0002%3A1%2CC0007%3A1%2CV2STACK42%3A1&hosts=H28%3A1%2CH29%3A1&genVendors=V30%3A1%2CV55%3A1%2CV39%3A1%2CV48%3A1%2CV46%3A1%2CV42%3A1%2CV31%3A1%2CV26%3A1%2CV40%3A1%2CV47%3A1%2CV54%3A1%2CV33%3A1%2CV43%3A1%2CV34%3A1%2CV32%3A1%2CV29%3A1%2CV49%3A1%2CV10%3A1%2CV18%3A1%2CV35%3A1%2CV25%3A1%2CV38%3A1%2CV28%3A1%2CV45%3A1%2CV14%3A1%2CV13%3A1%2CV23%3A1%2CV52%3A1%2CV27%3A1%2CV50%3A1%2CV36%3A1%2CV44%3A1%2CV11%3A1%2CV37%3A1%2CV53%3A1%2CV21%3A1%2CV24%3A1%2CV41%3A1%2CV15%3A1%2CV51%3A1%2CV16%3A1%2CV20%3A1%2CV1%3A1%2CV19%3A1%2C&intType=1&geolocation=GB%3BENG&AwaitingReconsent=false';

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

export default async function getZooplaListings(url) {
    try {
        const browser = await puppeteer.launch(
            // headless
            nonheadless
        );

        let page = (await browser.pages())[0]

        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36');
        await page.setCookie(...parsedCookies)

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br'
        });

        // Set cookies if needed
        // await page.setCookie({ name: 'cookie_name', value: 'cookie_value', domain: 'example.com' });

        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.waitForSelector('[data-testid="regular-listings"]', { visible: true, timeout: 10000 });
        const searchList = await page.$$('[data-testid="regular-listings"] > *');
        const listings = [];

        for (const element of searchList) {
            const id = await element.evaluate(el => el.getAttribute('id')?.split('_')[1]);
            const link = `https://www.zoopla.co.uk/to-rent/details/${id}/`;

            if (id && link) {
                listings.push({ link, id });
            }
        }

        await browser.close();
        return listings;
    } catch (e) {
        console.log("fetching ERROR YO!", e, dayjs().format('MM-DD HH:mm:ss'));
        return [];
    }
}
