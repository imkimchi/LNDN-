/**
 * SpareRoom message template configuration
 * This file contains the contact message template used when messaging new listings
 */

export const CONTACT_MESSAGE = `Hi, my name is Philip. I'm a 25-year-old professional from Korea looking for a room to rent.

I work full-time and am very clean, quiet, and respectful. I'm looking for a friendly flatshare where I can feel at home.

I'm available to move in as soon as possible and can provide references if needed. Would love to arrange a viewing if this room is still available.

Thanks for your time!

Best regards,
Philip`;

/**
 * Configuration for messaging behavior
 */
export const MESSAGE_CONFIG = {
    // Enable/disable auto-messaging (can be overridden by environment variable)
    enabled: process.env.SPAREROOM_AUTO_MESSAGE === 'true',
    
    // Delays in milliseconds to act human-like
    delays: {
        betweenMessages: 30000,  // 30 seconds between messages
        afterLogin: 2000,        // 2 seconds after login
        beforeSubmit: 1000,      // 1 second before submitting message
        navigationDelay: 500     // 0.5 seconds for navigation
    },
    
    
    // Browser configuration
    browser: {
        headless: process.env.NODE_ENV === 'production' || process.env.HEADLESS !== 'false',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
};

export default { CONTACT_MESSAGE, MESSAGE_CONFIG };