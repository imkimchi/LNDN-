/**
 * Validation and sanitization utilities
 */

const SUPPORTED_DOMAINS = [
    'spareroom.co.uk',
    'rightmove.co.uk',
    'zoopla.co.uk',
    'onthemarket.com',
    'onthemarket.co.uk',
    'foxtons.co.uk',
    'dexters.co.uk'
];

/**
 * Validates if a URL is safe and from a supported domain
 * @param {string} url - The URL to validate
 * @returns {boolean} True if URL is valid and safe
 */
export function isValidUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    
    try {
        const urlObj = new URL(url);
        
        // Must be HTTPS for security
        if (urlObj.protocol !== 'https:') {
            return false;
        }
        
        // Must be from supported domain
        const isSupported = SUPPORTED_DOMAINS.some(domain => 
            urlObj.hostname === domain || urlObj.hostname === `www.${domain}`
        );
        
        return isSupported;
    } catch {
        return false;
    }
}

/**
 * Sanitizes a URL by removing potentially dangerous components
 * @param {string} url - The URL to sanitize
 * @returns {string} Sanitized URL
 * @throws {Error} If URL is invalid or unsafe
 */
export function sanitizeUrl(url) {
    if (!isValidUrl(url)) {
        throw new Error(`Invalid or unsafe URL: ${url}`);
    }
    
    try {
        const urlObj = new URL(url);
        
        // Remove fragment (hash) for security
        urlObj.hash = '';
        
        // Ensure proper protocol
        urlObj.protocol = 'https:';
        
        return urlObj.toString();
    } catch (error) {
        throw new Error(`Failed to sanitize URL: ${error.message}`);
    }
}

/**
 * Validates if a string is a non-empty safe identifier
 * @param {string} identifier - The identifier to validate
 * @returns {boolean} True if identifier is valid
 */
export function isValidIdentifier(identifier) {
    if (!identifier || typeof identifier !== 'string') {
        return false;
    }
    
    // Allow alphanumeric, hyphens, underscores only
    const safePattern = /^[a-zA-Z0-9_-]+$/;
    return safePattern.test(identifier) && identifier.length <= 100;
}

/**
 * Validates if a search name is safe
 * @param {string} name - The search name to validate
 * @returns {boolean} True if name is valid
 */
export function isValidSearchName(name) {
    if (!name || typeof name !== 'string') {
        return false;
    }
    
    // Allow most characters but prevent potential script injection
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 200) {
        return false;
    }
    
    // Block suspicious patterns
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /data:text\/html/i
    ];
    
    return !suspiciousPatterns.some(pattern => pattern.test(name));
}

/**
 * Validates configuration object structure
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validateConfig(config) {
    const errors = [];
    
    if (!config || typeof config !== 'object') {
        return { isValid: false, errors: ['Config must be a valid object'] };
    }
    
    // Validate Telegram bot token
    if (!config.telegramBotToken || typeof config.telegramBotToken !== 'string') {
        errors.push('Missing or invalid telegramBotToken');
    } else if (!config.telegramBotToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        errors.push('Invalid Telegram bot token format');
    }
    
    // Validate chat ID (allow numeric IDs or @usernames)
    if (!config.chatId) {
        errors.push('Missing chatId');
    } else if (typeof config.chatId !== 'string') {
        errors.push('Invalid chatId format (must be string)');
    } else {
        const trimmedChatId = config.chatId.trim();
        const isNumericId = /^-?\d+$/.test(trimmedChatId);
        const isUsername = /^@[A-Za-z0-9_]{5,}$/i.test(trimmedChatId);

        if (!isNumericId && !isUsername) {
            errors.push('Invalid chatId format (use numeric ID or @username)');
        }
    }
    
    // Validate interval
    if (typeof config.intervalSeconds !== 'number' || config.intervalSeconds < 5) {
        errors.push('intervalSeconds must be a number >= 5');
    }
    
    // Validate browser pool size
    if (typeof config.browserPoolSize !== 'number' || config.browserPoolSize < 1 || config.browserPoolSize > 10) {
        errors.push('browserPoolSize must be a number between 1 and 10');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validates search configuration array
 * @param {Array} searches - Array of search configurations
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validateSearches(searches) {
    const errors = [];
    
    if (!Array.isArray(searches)) {
        return { isValid: false, errors: ['Searches must be an array'] };
    }
    
    if (searches.length === 0) {
        return { isValid: false, errors: ['At least one search must be configured'] };
    }
    
    searches.forEach((search, index) => {
        if (!search || typeof search !== 'object') {
            errors.push(`Search ${index + 1}: Must be a valid object`);
            return;
        }
        
        if (!isValidSearchName(search.name)) {
            errors.push(`Search ${index + 1}: Invalid or unsafe name`);
        }
        
        if (!isValidUrl(search.url)) {
            errors.push(`Search ${index + 1}: Invalid or unsafe URL`);
        }
    });
    
    return {
        isValid: errors.length === 0,
        errors
    };
}
