# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a rental property listing monitoring bot that scrapes real estate listings from SpareRoom, Rightmove, and Zoopla, then sends notifications via Telegram when new listings are found. The application runs continuously, checking for new listings every 20 seconds.

## Architecture

The application follows a simple modular structure:

- **Main entry point**: `index.js` - Contains the core monitoring logic and execution loop
- **Scrapers**: `fn/` directory contains platform-specific scrapers:
  - `spareroom.js` - Uses axios + cheerio for HTML parsing
  - `rightmove.js` - Uses axios + cheerio for HTML parsing  
  - `zoopla.js` - Uses Puppeteer with stealth plugin for browser automation
- **Services**: `services/bot.js` - Telegram bot integration
- **Utilities**: 
  - `utils/urlUtils.js` - URL parsing and platform detection
  - `utils/fileUtils.js` - JSON file operations for listing persistence
- **Data storage**: `listings/` directory stores JSON files with historical listings

## Key Dependencies

- `node-telegram-bot-api` - Telegram bot integration
- `puppeteer-core` + `puppeteer-extra` - Browser automation for Zoopla
- `puppeteer-extra-plugin-stealth` - Anti-detection for web scraping
- `axios` + `cheerio` - HTTP requests and HTML parsing
- `dayjs` - Date/time utilities
- `dotenv` - Environment variable management

## Environment Variables

Required environment variables (configured via `.env`):
- `TELEGRAM_BOT_TOKEN` - Telegram bot authentication token
- `CHAT_ID` - Telegram chat ID for sending notifications

## Development Commands

Install dependencies:
```bash
npm install
```

Start the monitoring service:
```bash
node index.js
```

The application will:
1. Load search URLs from the hardcoded `urls` array in `index.js`
2. Run initial checks for all URLs
3. Set up a 20-second interval to continuously monitor for new listings
4. Send Telegram notifications when new listings are detected

## Configuration

The application uses ES modules (`"type": "module"` in package.json). 

**Search Configuration**: Searches are defined in `config/searches.json` and can be enabled/disabled without code changes.

**Environment Variables**: All configuration is managed through environment variables in `.env`:
- `TELEGRAM_BOT_TOKEN` - Telegram bot authentication token (required)
- `CHAT_ID` - Telegram chat ID for notifications (required)
- `ZOOPLA_COOKIES` - Authentication cookies for Zoopla scraping (optional)
- `CHECK_INTERVAL_SECONDS` - Monitoring interval in seconds (default: 20)
- `BROWSER_POOL_SIZE` - Maximum Puppeteer browser instances (default: 2)

## Performance Features

- **Parallel Processing**: All URLs are processed concurrently for better performance
- **Browser Pool**: Puppeteer instances are reused to reduce resource consumption
- **Consistent Error Handling**: All scrapers use standardized error handling with detailed logging
- **Configuration Management**: External configuration files for easy updates

## Data Flow

1. Each monitoring cycle processes the configured URLs
2. Platform-specific scrapers extract current listings
3. New listings are identified by comparing against stored JSON files
4. Telegram notifications are sent for genuinely new listings (not on first run)
5. Updated listings are saved to JSON files in `listings/` directory

## Platform-Specific Notes

- **SpareRoom/Rightmove**: Use standard HTTP scraping with user-agent headers
- **Zoopla**: Requires Puppeteer browser automation due to anti-bot measures, includes pre-configured cookies for authentication

## File Naming Convention

Listing files are stored as: `{platform}-{searchId}.json`
- SpareRoom: Uses `search_id` parameter
- Rightmove: Uses `savedSearchId` parameter  
- Zoopla: Uses `search_identifier` parameter