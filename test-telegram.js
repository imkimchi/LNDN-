import dotenv from 'dotenv';
import getBotInstance from './services/bot.js';
import logger from './utils/logger.js';

dotenv.config();

async function run() {
    const bot = getBotInstance();
    const chatId = '@asdfasdfasdfbbb';

    if (!chatId) {
        logger.error('CHAT_ID environment variable is not set');
        process.exit(1);
    }

    const message = `Test message from srbot at ${new Date().toISOString()}`;

    logger.info('Sending test message to Telegram', { chatId });

    try {
        await bot.sendMessage(chatId, message);
        logger.info('Test message sent successfully');
    } catch (error) {
        logger.error('Failed to send test message', error);
        process.exit(1);
    }

    await bot.stopPolling();
    logger.info('Bot polling stopped after test');
}

run().catch(async (error) => {
    logger.error('Unhandled error while running Telegram test', error);
    process.exit(1);
});
