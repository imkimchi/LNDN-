import logger from './logger.js';
import { MESSAGE_CONFIG } from '../config/messageTemplate.js';

/**
 * Message queue for handling non-blocking SpareRoom messaging
 * Implements rate limiting and queuing to avoid blocking the main monitoring loop
 */
class MessageQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastMessageTime = 0;
    }

    /**
     * Add a listing URL to the message queue
     * @param {string} listingUrl - The SpareRoom listing URL to message
     * @param {Object} listingData - Additional listing data for logging
     */
    addToQueue(listingUrl, listingData = {}) {
        if (!MESSAGE_CONFIG.enabled) {
            logger.debug('Auto-messaging is disabled, skipping queue add');
            return;
        }


        this.queue.push({
            url: listingUrl,
            data: listingData,
            timestamp: Date.now()
        });

        logger.info('Added listing to message queue', {
            listingUrl,
            queueSize: this.queue.length,
            listingId: listingData.id
        });

        // Start processing if not already processing
        if (!this.processing) {
            this.processQueue();
        }
    }

    /**
     * Process the message queue with rate limiting
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        logger.debug('Starting message queue processing', {
            queueSize: this.queue.length
        });

        try {
            while (this.queue.length > 0) {
                // Enforce minimum delay between messages
                const timeSinceLastMessage = Date.now() - this.lastMessageTime;
                if (timeSinceLastMessage < MESSAGE_CONFIG.delays.betweenMessages) {
                    const waitTime = MESSAGE_CONFIG.delays.betweenMessages - timeSinceLastMessage;
                    logger.debug('Waiting before next message', {
                        waitTime,
                        timeSinceLastMessage
                    });
                    await this.sleep(waitTime);
                }

                const messageItem = this.queue.shift();
                await this.processMessage(messageItem);
                
                this.lastMessageTime = Date.now();
            }
        } catch (error) {
            logger.error('Error processing message queue', error);
        } finally {
            this.processing = false;
            
            if (this.queue.length > 0) {
                logger.info('Message queue processing paused', {
                    remainingInQueue: this.queue.length
                });
            } else {
                logger.debug('Message queue processing completed');
            }
        }
    }

    /**
     * Process a single message item
     * @param {Object} messageItem - Message item from queue
     */
    async processMessage(messageItem) {
        const { url, data } = messageItem;
        
        logger.info('Processing message for listing', {
            listingUrl: url,
            listingId: data.id
        });

        try {
            // Import the messaging service dynamically to avoid circular dependencies
            const { default: SpareroomMessenger } = await import('../services/spareroomMessenger.js');
            const messenger = SpareroomMessenger.getInstance();
            
            await messenger.sendMessage(url);
            
            logger.info('Message sent successfully', {
                listingUrl: url,
                listingId: data.id
            });
            
        } catch (error) {
            logger.error('Failed to send message for listing', error, {
                listingUrl: url,
                listingId: data.id
            });
        }
    }

    /**
     * Sleep utility function
     * @param {number} ms - Milliseconds to sleep
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get queue statistics
     * @returns {Object} Queue statistics
     */
    getStats() {
        return {
            queueSize: this.queue.length,
            processing: this.processing,
            enabled: MESSAGE_CONFIG.enabled
        };
    }

    /**
     * Clear the queue (useful for shutdown)
     */
    clear() {
        this.queue = [];
        logger.debug('Message queue cleared');
    }

    /**
     * Shutdown the queue gracefully
     */
    async shutdown() {
        logger.info('Shutting down message queue');
        this.clear();
    }
}

// Singleton instance
const messageQueue = new MessageQueue();

// Cleanup on process exit
process.on('SIGINT', () => {
    messageQueue.shutdown();
});

process.on('SIGTERM', () => {
    messageQueue.shutdown();
});

export default messageQueue;