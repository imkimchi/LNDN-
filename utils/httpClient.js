/**
 * Optimized HTTP client with connection pooling and retry logic
 */
import axios from 'axios';
import { Agent } from 'https';

// Create reusable HTTPS agent with connection pooling
const httpsAgent = new Agent({
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 2,
    timeout: 60000, // Connection timeout
    freeSocketTimeout: 30000, // Free socket timeout
});

// Default headers to appear more like a real browser
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Dnt': '1'
};

// Create axios instance with optimized defaults
const httpClient = axios.create({
    httpsAgent,
    timeout: 45000, // Request timeout
    maxRedirects: 5,
    headers: DEFAULT_HEADERS,
    // Automatically retry on network errors
    'axios-retry': {
        retries: 3,
        retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
        retryCondition: (error) => {
            return error.code === 'ECONNRESET' ||
                   error.code === 'ETIMEDOUT' ||
                   error.code === 'ENOTFOUND' ||
                   error.code === 'ECONNREFUSED' ||
                   (error.response && error.response.status >= 500);
        }
    }
});

/**
 * Makes an optimized HTTP GET request with retry logic
 * @param {string} url - The URL to fetch
 * @param {Object} options - Additional options for the request
 * @returns {Promise<Object>} Response object
 * @throws {Error} If request fails after retries
 */
export async function fetchWithRetry(url, options = {}) {
    if (!url || typeof url !== 'string') {
        throw new Error('URL must be a non-empty string');
    }

    const config = {
        method: 'GET',
        url,
        ...options,
        headers: {
            ...DEFAULT_HEADERS,
            ...options.headers
        }
    };

    const maxRetries = options.maxRetries || 3;
    const baseDelay = options.retryDelay || 1000;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await httpClient(config);
            
            // Validate response
            if (!response.data) {
                throw new Error('Empty response received');
            }
            
            return response;
        } catch (error) {
            lastError = error;
            
            // Don't retry on client errors (4xx)
            if (error.response && error.response.status >= 400 && error.response.status < 500) {
                throw error;
            }
            
            // Check if we should retry
            const shouldRetry = attempt < maxRetries && (
                error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ECONNREFUSED' ||
                error.code === 'EPIPE' ||
                (error.response && error.response.status >= 500)
            );
            
            if (shouldRetry) {
                const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
                console.log(`HTTP request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            throw error;
        }
    }
    
    throw lastError;
}

/**
 * Fetches multiple URLs in parallel with controlled concurrency
 * @param {Array<string|Object>} urls - Array of URLs or request configs
 * @param {Object} options - Options including concurrency limit
 * @returns {Promise<Array>} Array of results (successful responses or errors)
 */
export async function fetchMultiple(urls, options = {}) {
    if (!Array.isArray(urls) || urls.length === 0) {
        return [];
    }
    
    const concurrency = Math.min(options.concurrency || 3, 10); // Max 10 concurrent requests
    const results = [];
    
    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);
        const batchPromises = batch.map(async (urlOrConfig, index) => {
            try {
                const config = typeof urlOrConfig === 'string' ? { url: urlOrConfig } : urlOrConfig;
                const response = await fetchWithRetry(config.url, { ...options, ...config });
                return { success: true, data: response, index: i + index };
            } catch (error) {
                return { success: false, error, index: i + index };
            }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults.map(result => result.value || result.reason));
        
        // Small delay between batches to be respectful to servers
        if (i + concurrency < urls.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

/**
 * Validates that a response contains expected data
 * @param {Object} response - Axios response object
 * @param {Function} validator - Optional custom validator function
 * @returns {boolean} True if response is valid
 */
export function validateResponse(response, validator) {
    if (!response || !response.data) {
        return false;
    }
    
    if (typeof validator === 'function') {
        return validator(response.data);
    }
    
    // Default validation - check for basic HTML structure
    if (typeof response.data === 'string') {
        return response.data.includes('<html') || response.data.includes('<!DOCTYPE');
    }
    
    return true;
}

/**
 * Cleanup function to close connection pools
 */
export function cleanup() {
    if (httpsAgent) {
        httpsAgent.destroy();
    }
}

// Ensure cleanup on process exit
process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

export default httpClient;