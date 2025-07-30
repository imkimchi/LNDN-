import fs from 'fs';
import path from 'path';

class ConfigManager {
    constructor() {
        this.configDir = path.join(process.cwd(), 'config');
        this.searchesFile = path.join(this.configDir, 'searches.json');
        this._searches = null;
    }

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

    reloadSearches() {
        this._searches = null;
        return this.loadSearches();
    }

    getSearches() {
        return this.loadSearches();
    }

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

    saveSearches(searches) {
        const config = { searches };
        fs.writeFileSync(this.searchesFile, JSON.stringify(config, null, 2));
    }

    getAppConfig() {
        return {
            telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.CHAT_ID,
            zooplayCookies: process.env.ZOOPLA_COOKIES,
            intervalSeconds: parseInt(process.env.CHECK_INTERVAL_SECONDS) || 20,
            browserPoolSize: parseInt(process.env.BROWSER_POOL_SIZE) || 2
        };
    }
}

// Singleton instance
const configManager = new ConfigManager();

export default configManager;