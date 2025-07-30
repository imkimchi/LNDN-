import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

class BrowserPool {
    constructor(maxSize = 2) {
        this.maxSize = maxSize;
        this.pool = [];
        this.activeInstances = 0;
        this.waitingQueue = [];
    }

    async getBrowser() {
        // If there's a browser available in the pool, return it
        if (this.pool.length > 0) {
            return this.pool.pop();
        }

        // If we can create a new instance, do so
        if (this.activeInstances < this.maxSize) {
            return await this.createBrowser();
        }

        // Otherwise, wait for one to become available
        return new Promise((resolve) => {
            this.waitingQueue.push(resolve);
        });
    }

    async createBrowser() {
        this.activeInstances++;
        
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080'
            ]
        });

        // Handle browser disconnection
        browser.on('disconnected', () => {
            this.activeInstances--;
            // Remove from pool if it was there
            const index = this.pool.indexOf(browser);
            if (index > -1) {
                this.pool.splice(index, 1);
            }
        });

        return browser;
    }

    async releaseBrowser(browser) {
        // Check if browser is still connected
        if (!browser.isConnected()) {
            this.activeInstances--;
            return;
        }

        // If someone is waiting, give it to them immediately
        if (this.waitingQueue.length > 0) {
            const resolve = this.waitingQueue.shift();
            resolve(browser);
            return;
        }

        // Otherwise, return to pool
        this.pool.push(browser);
    }

    async cleanup() {
        // Close all browsers in the pool
        const closePromises = this.pool.map(browser => browser.close().catch(() => {}));
        await Promise.all(closePromises);
        
        this.pool = [];
        this.activeInstances = 0;
        
        // Reject any waiting promises
        this.waitingQueue.forEach(resolve => resolve(null));
        this.waitingQueue = [];
    }

    getStats() {
        return {
            poolSize: this.pool.length,
            activeInstances: this.activeInstances,
            waitingCount: this.waitingQueue.length,
            maxSize: this.maxSize
        };
    }
}

// Singleton instance
const browserPool = new BrowserPool();

// Cleanup on process exit
process.on('SIGINT', async () => {
    await browserPool.cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await browserPool.cleanup();
    process.exit(0);
});

export default browserPool;