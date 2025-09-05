/**
 * Test script for SpareRoom automated messaging
 * This script tests the messaging functionality with a specific listing URL
 */

import dotenv from 'dotenv';
import SpareroomMessenger from './services/spareroomMessenger.js';
import logger from './utils/logger.js';

dotenv.config();

async function testMessaging() {
    logger.info('Starting SpareRoom messaging test');
    
    // Test with a sample SpareRoom listing URL (replace with actual URL for testing)
    const testListingUrl = 'https://www.spareroom.co.uk/flatshare/flatshare_detail.pl?flatshare_id=17965239&search_id=1384552886&city_id=&flatshare_type=offered&search_results=%2Fflatshare%2F%3Fsearch_id%3D1384552886%26&';
    
    if (!process.env.SPAREROOM_EMAIL || !process.env.SPAREROOM_PASSWORD) {
        logger.error('SpareRoom credentials not found in environment variables');
        process.exit(1);
    }
    
    const messenger = SpareroomMessenger.getInstance();
    
    try {
        logger.info('Testing messaging service with URL:', testListingUrl);
        
        // Test initialization
        await messenger.initialize();
        logger.info('Messenger initialized successfully');
        
        // Check status
        const status = messenger.getStatus();
        logger.info('Messenger status:', status);
        
        if (!status.isReady) {
            throw new Error('Messenger is not ready');
        }
        
        // Test sending message (comment out if you don't want to actually send)
        await messenger.sendMessage(testListingUrl);
        logger.info('Test message sent successfully');
        
        logger.info('Test completed successfully');
        
    } catch (error) {
        logger.error('Test failed:', error);
    } finally {
        // Cleanup
        await messenger.cleanup();
        logger.info('Messenger cleaned up');
        process.exit(0);
    }
}

// Run the test
testMessaging().catch(error => {
    logger.error('Unhandled error in test:', error);
    process.exit(1);
});