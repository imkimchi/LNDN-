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
    'Sec-Ch-Ua': '\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '\"macOS\"',
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

/**\n * Makes an optimized HTTP GET request with retry logic\n * @param {string} url - The URL to fetch\n * @param {Object} options - Additional options for the request\n * @returns {Promise<Object>} Response object\n * @throws {Error} If request fails after retries\n */\nexport async function fetchWithRetry(url, options = {}) {\n    if (!url || typeof url !== 'string') {\n        throw new Error('URL must be a non-empty string');\n    }\n\n    const config = {\n        method: 'GET',\n        url,\n        ...options,\n        headers: {\n            ...DEFAULT_HEADERS,\n            ...options.headers\n        }\n    };\n\n    const maxRetries = options.maxRetries || 3;\n    const baseDelay = options.retryDelay || 1000;\n    let lastError;\n\n    for (let attempt = 1; attempt <= maxRetries; attempt++) {\n        try {\n            const response = await httpClient(config);\n            \n            // Validate response\n            if (!response.data) {\n                throw new Error('Empty response received');\n            }\n            \n            return response;\n        } catch (error) {\n            lastError = error;\n            \n            // Don't retry on client errors (4xx)\n            if (error.response && error.response.status >= 400 && error.response.status < 500) {\n                throw error;\n            }\n            \n            // Check if we should retry\n            const shouldRetry = attempt < maxRetries && (\n                error.code === 'ECONNRESET' ||\n                error.code === 'ETIMEDOUT' ||\n                error.code === 'ENOTFOUND' ||\n                error.code === 'ECONNREFUSED' ||\n                error.code === 'EPIPE' ||\n                (error.response && error.response.status >= 500)\n            );\n            \n            if (shouldRetry) {\n                const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);\n                console.log(`HTTP request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);\n                await new Promise(resolve => setTimeout(resolve, delay));\n                continue;\n            }\n            \n            throw error;\n        }\n    }\n    \n    throw lastError;\n}\n\n/**\n * Fetches multiple URLs in parallel with controlled concurrency\n * @param {Array<string|Object>} urls - Array of URLs or request configs\n * @param {Object} options - Options including concurrency limit\n * @returns {Promise<Array>} Array of results (successful responses or errors)\n */\nexport async function fetchMultiple(urls, options = {}) {\n    if (!Array.isArray(urls) || urls.length === 0) {\n        return [];\n    }\n    \n    const concurrency = Math.min(options.concurrency || 3, 10); // Max 10 concurrent requests\n    const results = [];\n    \n    for (let i = 0; i < urls.length; i += concurrency) {\n        const batch = urls.slice(i, i + concurrency);\n        const batchPromises = batch.map(async (urlOrConfig, index) => {\n            try {\n                const config = typeof urlOrConfig === 'string' ? { url: urlOrConfig } : urlOrConfig;\n                const response = await fetchWithRetry(config.url, { ...options, ...config });\n                return { success: true, data: response, index: i + index };\n            } catch (error) {\n                return { success: false, error, index: i + index };\n            }\n        });\n        \n        const batchResults = await Promise.allSettled(batchPromises);\n        results.push(...batchResults.map(result => result.value || result.reason));\n        \n        // Small delay between batches to be respectful to servers\n        if (i + concurrency < urls.length) {\n            await new Promise(resolve => setTimeout(resolve, 100));\n        }\n    }\n    \n    return results;\n}\n\n/**\n * Validates that a response contains expected data\n * @param {Object} response - Axios response object\n * @param {Function} validator - Optional custom validator function\n * @returns {boolean} True if response is valid\n */\nexport function validateResponse(response, validator) {\n    if (!response || !response.data) {\n        return false;\n    }\n    \n    if (typeof validator === 'function') {\n        return validator(response.data);\n    }\n    \n    // Default validation - check for basic HTML structure\n    if (typeof response.data === 'string') {\n        return response.data.includes('<html') || response.data.includes('<!DOCTYPE');\n    }\n    \n    return true;\n}\n\n/**\n * Cleanup function to close connection pools\n */\nexport function cleanup() {\n    if (httpsAgent) {\n        httpsAgent.destroy();\n    }\n}\n\n// Ensure cleanup on process exit\nprocess.on('exit', cleanup);\nprocess.on('SIGINT', cleanup);\nprocess.on('SIGTERM', cleanup);\n\nexport default httpClient;