import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { CONTACT_MESSAGE, MESSAGE_CONFIG } from '../config/messageTemplate.js';

/**
 * SpareRoom messaging service using Playwright for automated contact messaging
 * Implements singleton pattern to reuse browser session across multiple listings
 */
class SpareroomMessenger {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isLoggedIn = false;
        this.loginInProgress = false;
        this.initializationPromise = null;
    }

    /**
     * Get singleton instance
     * @returns {SpareroomMessenger} The singleton instance
     */
    static getInstance() {
        if (!SpareroomMessenger.instance) {
            SpareroomMessenger.instance = new SpareroomMessenger();
        }
        return SpareroomMessenger.instance;
    }

    /**
     * Initialize browser and login to SpareRoom
     */
    async initialize() {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this._doInitialize();
        return this.initializationPromise;
    }

    async _doInitialize() {
        try {
            logger.info('Initializing SpareRoom messaging service');

            // Launch browser
            this.browser = await chromium.launch({
                headless: true,
                // MESSAGE_CONFIG.browser.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled'
                ]
            });

            // Create context with realistic settings
            this.context = await this.browser.newContext({
                userAgent: MESSAGE_CONFIG.browser.userAgent,
                viewport: { width: 1920, height: 1080 },
                locale: 'en-GB',
                timezoneId: 'Europe/London'
            });

            // Create page
            this.page = await this.context.newPage();

            // Set extra headers to appear more human-like
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
            });

            await this.login();
            
            logger.info('SpareRoom messaging service initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize SpareRoom messaging service', error);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Login to SpareRoom
     */
    async login() {
        if (this.isLoggedIn || this.loginInProgress) {
            return;
        }

        this.loginInProgress = true;

        try {
            logger.info('Logging into SpareRoom');

            // Navigate to homepage
            await this.page.goto('https://www.spareroom.co.uk/', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            // Handle cookie consent dialog - reject all cookies
            try {
                await this.sleep(2000); // Wait a bit for popup to show up
                const rejectButton = this.page.locator('#onetrust-reject-all-handler');
                if (await rejectButton.isVisible({ timeout: 5000 })) {
                    await rejectButton.click();
                    await this.sleep(1000);
                    logger.debug('Rejected all cookies');
                }
            } catch (e) {
                logger.debug('No cookie consent dialog found or error handling it');
            }

            // Click the login button in navigation
            await this.page.click('#loginButtonNav');
            
            // Wait for login modal to appear
            await this.page.waitForSelector('#auth-modal-dialog', { timeout: 10000 });
            await this.sleep(500);

            // Fill login form in modal
            await this.page.fill('#auth-modal-dialog input[name="email"]', process.env.SPAREROOM_EMAIL);
            await this.sleep(this.randomDelay(500, 1000));
            
            await this.page.fill('#auth-modal-dialog input[name="password"]', process.env.SPAREROOM_PASSWORD);
            await this.sleep(this.randomDelay(500, 1000));

            // Click login button in modal
            await this.page.click('#auth-modal-dialog #sign-in-button');
            
            // Wait for modal to close and login to complete
            await this.page.waitForSelector('#auth-modal-dialog', { state: 'hidden', timeout: 15000 });
            await this.sleep(MESSAGE_CONFIG.delays.afterLogin);

            // Verify login was successful by checking if login button is no longer visible
            const loginButtonVisible = await this.page.isVisible('#loginButtonNav', { timeout: 2000 });
            if (loginButtonVisible) {
                throw new Error('Login failed - login button still visible');
            }

            this.isLoggedIn = true;
            logger.info('Successfully logged into SpareRoom');

        } catch (error) {
            logger.error('Failed to login to SpareRoom', error);
            this.isLoggedIn = false;
            throw error;
        } finally {
            this.loginInProgress = false;
        }
    }

    /**
     * Send message to a SpareRoom listing
     * @param {string} listingUrl - The SpareRoom listing URL
     */
    async sendMessage(listingUrl) {
        try {
            // Ensure we're initialized and logged in
            await this.initialize();

            logger.info('Sending message to SpareRoom listing', { listingUrl });

            // Navigate to listing page
            await this.page.goto(listingUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
            await this.sleep(MESSAGE_CONFIG.delays.navigationDelay);

            // Find contact link
            const contactLink = await this.page.locator('a[data-ga-event-label="contact-box-email"]');
            
            if (!(await contactLink.count())) {
                throw new Error('Contact link not found on listing page');
            }

            const contactHref = await contactLink.getAttribute('href');
            if (!contactHref) {
                throw new Error('Contact link href not found');
            }

            logger.debug('Found contact link', { contactHref });

            // Navigate to contact page
            const fullContactUrl = contactHref.startsWith('http') ? contactHref : `https://www.spareroom.co.uk${contactHref}`;
            await this.page.goto(fullContactUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
            await this.sleep(MESSAGE_CONFIG.delays.navigationDelay);

            // Wait for message textarea
            await this.page.waitForSelector('textarea#message', { timeout: 10000 });

            // Fill message
            await this.page.fill('textarea#message', CONTACT_MESSAGE);
            await this.sleep(MESSAGE_CONFIG.delays.beforeSubmit);

            // Find and click send button with more specific selector - look for visible submit button
            const sendButton = await this.page.locator('button[type="submit"]:visible, input[type="submit"]:visible, button:has-text("Send"):visible, button:has-text("send"):visible').first();
            
            if (!(await sendButton.count())) {
                throw new Error('Send button not found on contact page');
            }

            await sendButton.click();
            
            // Wait for message to be sent
            await this.page.waitForLoadState('domcontentloaded');
            await this.sleep(1000);

            // Check for success/error indicators
            const successIndicators = [
                '.success',
                '.alert-success',
                '[class*="success"]',
                ':has-text("message has been sent")',
                ':has-text("Message sent")'
            ];

            const errorIndicators = [
                '.error',
                '.alert-danger',
                '.alert-error',
                '[class*="error"]',
                ':has-text("error")',
                ':has-text("failed")'
            ];

            let messageStatus = 'unknown';
            
            // Check for success
            for (const selector of successIndicators) {
                try {
                    if (await this.page.isVisible(selector, { timeout: 2000 })) {
                        messageStatus = 'success';
                        break;
                    }
                } catch (e) {
                    // Ignore selector errors
                }
            }

            // Check for errors if no success found
            if (messageStatus === 'unknown') {
                for (const selector of errorIndicators) {
                    try {
                        if (await this.page.isVisible(selector, { timeout: 2000 })) {
                            messageStatus = 'error';
                            break;
                        }
                    } catch (e) {
                        // Ignore selector errors
                    }
                }
            }

            if (messageStatus === 'error') {
                // Capture a screenshot for debugging before throwing
                await this.captureScreenshot('message-error', listingUrl);
                throw new Error('Message sending failed - error indicator found on page');
            }

            logger.info('Message sent successfully to SpareRoom listing', {
                listingUrl,
                contactUrl: fullContactUrl,
                status: messageStatus
            });

        } catch (error) {
            logger.error('Failed to send message to SpareRoom listing', error, {
                listingUrl
            });
            
            // Try to recover from certain errors
            if (error.message.includes('login') || error.message.includes('unauthorized')) {
                this.isLoggedIn = false;
                logger.info('Marking as logged out due to authentication error');
            }
            
            throw error;
        }
    }

    /**
     * Generate random delay between min and max milliseconds
     * @param {number} min - Minimum delay in ms
     * @param {number} max - Maximum delay in ms
     * @returns {number} Random delay in ms
     */
    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Sleep utility function
     * @param {number} ms - Milliseconds to sleep
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Capture a screenshot to aid debugging on errors
     * @param {string} reason - Reason marker to include in filename
     * @param {string} [listingUrl] - Optional listing URL for context
     */
    async captureScreenshot(reason = 'error', listingUrl = '') {
        try {
            if (!this.page) return;

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const dir = path.join(process.cwd(), 'listings', 'screenshots');
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const urlPart = (listingUrl || '')
                .replace(/https?:\/\//i, '')
                .replace(/[^a-z0-9]+/gi, '_')
                .slice(0, 80)
                .toLowerCase();
            const filename = `spareroom_${reason}_${urlPart ? urlPart + '_' : ''}${timestamp}.png`;
            const filePath = path.join(dir, filename);

            await this.page.screenshot({ path: filePath, fullPage: true });
            logger.info('Saved SpareRoom screenshot', { filePath, reason, listingUrl });
        } catch (e) {
            logger.warn('Failed to capture SpareRoom screenshot', { error: e?.message });
        }
    }

    /**
     * Cleanup browser resources
     */
    async cleanup() {
        try {
            if (this.page) {
                await this.page.close();
                this.page = null;
            }
            
            if (this.context) {
                await this.context.close();
                this.context = null;
            }
            
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            
            this.isLoggedIn = false;
            this.loginInProgress = false;
            this.initializationPromise = null;
            
            logger.info('SpareRoom messaging service cleaned up');
            
        } catch (error) {
            logger.error('Error during SpareRoom messaging service cleanup', error);
        }
    }

    /**
     * Check if the service is ready to send messages
     * @returns {boolean} True if ready
     */
    isReady() {
        return this.isLoggedIn && !!this.browser && !!this.context && !!this.page;
    }

    /**
     * Get service status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isLoggedIn: this.isLoggedIn,
            loginInProgress: this.loginInProgress,
            hasActiveBrowser: !!this.browser,
            hasActiveContext: !!this.context,
            hasActivePage: !!this.page,
            isReady: this.isReady()
        };
    }
}

// Cleanup on process exit
process.on('SIGINT', async () => {
    const instance = SpareroomMessenger.getInstance();
    await instance.cleanup();
});

process.on('SIGTERM', async () => {
    const instance = SpareroomMessenger.getInstance();
    await instance.cleanup();
});

export default SpareroomMessenger;
