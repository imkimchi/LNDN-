import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

let botInstance = null;
let storageChannelId = null;
// Key: message_id, Value: { listing, currentIndex, chatId, searchName, fileIds }
const galleryState = new Map();
// Cache for image URL to file_id mapping
const imageCache = new Map();

// Setup global cleanup listeners only once
const cleanup = async () => {
    if (botInstance) {
        await botInstance.stopPolling();
        botInstance = null;
    }
};

process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);
process.once('exit', cleanup);

/**
 * Gets or creates the Telegram bot instance
 * @returns {TelegramBot} The bot instance
 * @throws {Error} If bot token is not configured
 */
function getBotInstance() {
    if (!botInstance) {
        logger.info('Initializing Telegram bot instance');
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is not defined in the environment variables.');
        }
        botInstance = new TelegramBot(token, { polling: true });
        setupCallbackListener(botInstance);
        logger.info('Telegram bot initialized successfully');
    }
    return botInstance;
}

function createGalleryKeyboard(currentIndex, totalImages) {
    const row = [];
    if (currentIndex > 0) row.push({ text: '⬅️ Previous', callback_data: 'prev' });
    row.push({ text: `${currentIndex + 1} / ${totalImages}`, callback_data: 'noop' });
    if (currentIndex < totalImages - 1) row.push({ text: 'Next ➡️', callback_data: 'next' });
    return { inline_keyboard: [row] };
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Telegram API Rate Limiter
class TelegramRateLimiter {
    constructor() {
        this.lastMessageTime = 0;
        this.messageQueue = [];
        this.isProcessing = false;
    }
    
    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastMessage = now - this.lastMessageTime;
        const minimumDelay = 3000; // 3 seconds between messages to be very safe
        
        if (timeSinceLastMessage < minimumDelay) {
            const waitTime = minimumDelay - timeSinceLastMessage;
            await sleep(waitTime);
        }
        
        this.lastMessageTime = Date.now();
    }
    
    async executeWithRetry(apiCall, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.waitForRateLimit();
                return await apiCall();
            } catch (error) {
                if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
                    // Extract retry_after value from Telegram's response, or use a safe default
                    const match = error.message.match(/retry after (\d+)/i) || error.response?.parameters?.retry_after;
                    const retryAfter = match ? parseInt(match[1] || match) : (10 * attempt); // Default to 10s, 20s, 30s
                    
                    logger.warn('Telegram API rate limited', {
                        attempt,
                        maxRetries,
                        retryAfter
                    });
                    
                    if (attempt === maxRetries) {
                        throw new Error(`Max retries reached after ${maxRetries} attempts: ${error.message}`);
                    }
                    
                    await sleep(retryAfter * 1000);
                    // Reset the last message time after a rate limit to ensure proper spacing
                    this.lastMessageTime = 0;
                    continue;
                } else {
                    throw error; // Re-throw non-rate-limit errors
                }
            }
        }
    }
}

const rateLimiter = new TelegramRateLimiter();

async function shortenUrl(url) {
    try {
        const response = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
        return response.data.startsWith('http') ? response.data : url;
    } catch (error) {
        logger.debug('URL shortening failed', { url, error: error.message });
        return url; // Return original URL if shortening fails
    }
}

async function getOrCreateStorageChannel(bot) {
    if (storageChannelId) {
        return storageChannelId;
    }

    try {
        storageChannelId = process.env.STORAGE_CHANNEL_ID || process.env.CHAT_ID;
        
        // Test if bot can access the storage channel
        logger.debug('Testing storage channel access', { channelId: storageChannelId });
        await bot.getChat(storageChannelId);
        logger.info('Storage channel access confirmed', { channelId: storageChannelId });
        
        return storageChannelId;
    } catch (error) {
        logger.warn('Cannot access storage channel, using fallback', {
            error: error.message,
            fallbackChannel: process.env.CHAT_ID
        });
        
        // Fallback to main chat
        storageChannelId = process.env.CHAT_ID;
        return storageChannelId;
    }
}

async function cacheImages(bot, images) {
    const fileIds = new Array(images.length).fill(null);
    const storageChannel = await getOrCreateStorageChannel(bot);
    
    // Process images sequentially with proper rate limiting
    for (let index = 0; index < images.length; index++) {
        const imageUrl = images[index];
        
        // Check if we already have this image cached
        if (imageCache.has(imageUrl)) {
            fileIds[index] = imageCache.get(imageUrl);
            continue;
        }
        
        try {
            // Upload to storage channel with rate limiting and retry logic
            const result = await rateLimiter.executeWithRetry(async () => {
                return await bot.sendPhoto(storageChannel, imageUrl, { 
                    disable_notification: true,
                    caption: `Cache: ${new URL(imageUrl).hostname} - ${index + 1}`
                });
            });
            
            // Cache the file_id from the highest quality photo
            const fileId = result.photo[result.photo.length - 1].file_id;
            fileIds[index] = fileId;
            
            // Store in our cache for future use
            imageCache.set(imageUrl, fileId);
            
        } catch (error) {
            if (error.message.includes('chat not found')) {
                logger.warn('Storage channel access lost, trying fallback', {
                    imageIndex: index + 1,
                    fallbackChannel: process.env.CHAT_ID
                });
                // Try using main chat as fallback with rate limiting
                try {
                    const result = await rateLimiter.executeWithRetry(async () => {
                        return await bot.sendPhoto(process.env.CHAT_ID, imageUrl, { 
                            disable_notification: true,
                            caption: `Cache: ${new URL(imageUrl).hostname} - ${index + 1}`
                        });
                    });
                    const fileId = result.photo[result.photo.length - 1].file_id;
                    fileIds[index] = fileId;
                    imageCache.set(imageUrl, fileId);
                } catch (fallbackError) {
                    logger.error('Failed to cache image with fallback', {
                        imageIndex: index + 1,
                        error: fallbackError.message
                    });
                    fileIds[index] = null;
                }
            } else {
                logger.error('Failed to cache image', {
                    imageIndex: index + 1,
                    error: error.message
                });
                fileIds[index] = null;
            }
        }
    }
    
    return fileIds;
}

async function sendListingWithImages(chatId, listing, searchName) {
    const bot = getBotInstance();
    
    // Shorten the URL
    const shortUrl = await shortenUrl(listing.link);
    
    // Format price with bold text and location
    const priceText = listing.price ? `\n*${listing.price}*` : '';
    const locationText = listing.location ? `\n📍 ${listing.location}` : '';
    
    const caption = `${searchName}\n${listing.title}${priceText}${locationText}\n${shortUrl}`;

    if (listing.images && listing.images.length > 0) {
        const totalImages = listing.images.length;
        const currentIndex = 0;

        // Send the first image immediately using the URL
        const sentMessage = await rateLimiter.executeWithRetry(async () => {
            return await bot.sendPhoto(chatId, listing.images[currentIndex], {
                caption,
                parse_mode: 'Markdown',
                reply_markup: createGalleryKeyboard(currentIndex, totalImages),
            });
        });

        // Cache images in the background (don't await)
        cacheImages(bot, listing.images).then(fileIds => {
            // Update the state with cached file_ids once available
            galleryState.set(sentMessage.message_id, {
                listing,
                currentIndex,
                chatId,
                searchName,
                fileIds,
            });
        }).catch(error => {
            logger.error('Background image caching failed', {
                error: error.message,
                listingId: listing.id,
                imageCount: listing.images.length
            });
            // Store state without cached file_ids as fallback
            galleryState.set(sentMessage.message_id, {
                listing,
                currentIndex,
                chatId,
                searchName,
                fileIds: new Array(listing.images.length).fill(null),
            });
        });

        // Store initial state without cached file_ids
        galleryState.set(sentMessage.message_id, {
            listing,
            currentIndex,
            chatId,
            searchName,
            fileIds: new Array(listing.images.length).fill(null),
        });
    } else {
        await bot.sendMessage(chatId, caption);
    }
}

function setupCallbackListener(bot) {
    bot.on('callback_query', async (callbackQuery) => {
        const { data: action, message } = callbackQuery;
        const messageId = message.message_id;

        if (action === 'noop') return bot.answerCallbackQuery(callbackQuery.id);

        const state = galleryState.get(messageId);
        if (!state) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'This gallery has expired.' });
            return bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: message.chat.id, message_id: messageId });
        }

        const { listing, chatId, searchName } = state;
        let { currentIndex, fileIds } = state; // Get the fileIds from state
        const totalImages = listing.images.length;

        const originalIndex = currentIndex;
        if (action === 'next' && currentIndex < totalImages - 1) currentIndex++;
        else if (action === 'prev' && currentIndex > 0) currentIndex--;

        if (currentIndex !== originalIndex) {
            // Use preloaded file_id for instant loading
            const media = fileIds[currentIndex] || listing.images[currentIndex];
            
            // Format caption with bold price, location and shortened URL
            const shortUrl = await shortenUrl(listing.link);
            const priceText = listing.price ? `\n*${listing.price}*` : '';
            const locationText = listing.location ? `\n📍 ${listing.location}` : '';
            const newCaption = `${searchName}\n${listing.title}${priceText}${locationText}\n${shortUrl}`;
            
            // Edit the message using the preloaded file_id with rate limiting
            await rateLimiter.executeWithRetry(async () => {
                return await bot.editMessageMedia(
                    { type: 'photo', media, caption: newCaption, parse_mode: 'Markdown' },
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: createGalleryKeyboard(currentIndex, totalImages),
                    }
                );
            });

            // Update the state in our map
            galleryState.set(messageId, { ...state, currentIndex, fileIds });
        }
        
        await bot.answerCallbackQuery(callbackQuery.id);
    });
}

export default getBotInstance;
export { sendListingWithImages };