import fs from 'fs';
import path from 'path';

/**
 * Configuration manager for handling search configurations and environment variables
 */

class ConfigManager {
    constructor() {
        this.configDir = path.join(process.cwd(), 'config');
        this.searchesFile = path.join(this.configDir, 'searches.json');
        this._searches = null;
    }

    /**
     * Validates that all required environment variables are present
     * @throws {Error} If required environment variables are missing
     */
    validateEnvironment() {
        const required = ['TELEGRAM_BOT_TOKEN', 'CHAT_ID'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // Warn about optional variables
        if (!process.env.ZOOPLA_COOKIES) {
            console.warn('Warning: ZOOPLA_COOKIES not set - Zoopla scraper will be disabled');
        }
    }

    /**
     * Loads and validates search configurations from the config file
     * @returns {Array} Array of enabled search configurations
     * @throws {Error} If configuration file is invalid
     */
    loadSearches() {
        if (this._searches) {
            return this._searches;
        }

        try {
            const data = fs.readFileSync(this.searchesFile, 'utf8');
            const config = JSON.parse(data);
            
            if (!config.searches || !Array.isArray(config.searches)) {
                throw new Error('Invalid searches configuration - must contain a "searches" array');
            }

            // Filter enabled searches only
            this._searches = config.searches
                .filter(search => search.enabled !== false)
                .map(search => {
                    if (!search.name || !search.url) {
                        throw new Error('Each search must have "name" and "url" properties');
                    }
                    return {
                        name: search.name,
                        url: search.url,
                        enabled: search.enabled !== false
                    };
                });

            console.log(`Loaded ${this._searches.length} enabled searches from configuration`);
            return this._searches;

        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`Configuration file not found: ${this.searchesFile}`);
                console.error('Please create the configuration file or check the path');
            } else {
                console.error('Error loading search configuration:', error.message);
            }
            throw error;
        }
    }

    /**
     * Forces a reload of search configurations from disk
     * @returns {Array} Reloaded search configurations
     */
    reloadSearches() {
        this._searches = null;
        return this.loadSearches();
    }

    /**
     * Gets the current search configurations
     * @returns {Array} Array of search configurations
     */
    getSearches() {
        return this.loadSearches();
    }

    /**
     * Adds a new search configuration and saves to file
     * @param {Object} search - The search configuration to add
     * @param {string} search.name - The search name
     * @param {string} search.url - The search URL
     * @param {boolean} [search.enabled=true] - Whether the search is enabled
     * @throws {Error} If search configuration is invalid
     */
    addSearch(search) {
        if (!search.name || !search.url) {
            throw new Error('Search must have name and url properties');
        }

        const searches = this.loadSearches();
        searches.push({
            name: search.name,
            url: search.url,
            enabled: search.enabled !== false
        });

        this.saveSearches(searches);
        this._searches = null; // Force reload
    }

    /**
     * Saves search configurations to the config file
     * @param {Array} searches - Array of search configurations to save
     */
    saveSearches(searches) {
        const config = { searches };
        fs.writeFileSync(this.searchesFile, JSON.stringify(config, null, 2));
    }

    /**
     * Gets the application configuration from environment variables
     * @returns {Object} Application configuration object
     */
    getAppConfig() {
        return {
            telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.CHAT_ID,
            zooplaCookies: process.env.ZOOPLA_COOKIES,
            intervalSeconds: parseInt(process.env.CHECK_INTERVAL_SECONDS) || 20,
            browserPoolSize: parseInt(process.env.BROWSER_POOL_SIZE) || 2
        };
    }
}

// Singleton instance
const configManager = new ConfigManager();

export default configManager;
