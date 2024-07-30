import bot from './services/telegram.js'

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `Your chat ID is ${chatId}`);
});