# Gemini Workspace

This document outlines the structure and functionality of the project, as understood by Gemini.

## Project Overview

This project is a real estate listing scraper and notifier. It periodically scrapes listings from various real estate websites, identifies new listings, and sends notifications via a Telegram bot.

### Core Technologies

- **Node.js**: The runtime environment for the application.
- **Puppeteer**: Used for web scraping, particularly for sites that require JavaScript rendering.
- **Cheerio**: Used for parsing and manipulating HTML (likely used in some scrapers).
- **Axios**: For making HTTP requests.
- **Day.js**: For date and time manipulation.
- **dotenv**: For managing environment variables.
- **node-telegram-bot-api**: For interacting with the Telegram Bot API.

### Project Structure

- **`index.js`**: The main entry point of the application. It orchestrates the scraping process, manages schedules, and triggers notifications.
- **`fn/`**: This directory contains the individual scraper modules for different real estate websites (e.g., `spareroom.js`, `rightmove.js`).
- **`config/`**: Contains configuration files, such as `searches.json`, which defines the URLs to be scraped.
- **`services/`**: Holds services used by the application, such as the Telegram bot service (`bot.js`).
- **`utils/`**: A collection of utility modules for tasks like browser management, file operations, and URL parsing.
- **`listings/`**: This directory is used to store the results of scraping operations, with one JSON file per search query.

## How it Works

1.  **Configuration**: The application reads a list of search URLs from `config/searches.json`. Each search has a name and a URL.
2.  **Scraping**: The `trackListings` function in `index.js` iterates through the configured searches and calls the appropriate scraper from the `fn/` directory based on the URL.
3.  **Data Storage**: The scraped listings are stored in JSON files within the `listings/` directory. The filename is derived from the search ID.
4.  **New Listing Detection**: For each search, the current listings are compared against the previously saved listings to identify new ones.
5.  **Notification**: When new listings are found, the application uses the Telegram bot to send a notification to a configured chat ID. The notification includes the listing title, a link, and any available images.
6.  **Scheduling**: The entire process is run at a configurable interval, defined by the `intervalSeconds` environment variable.

## Key Files

- **`package.json`**: Defines the project's dependencies and scripts.
- **`index.js`**: The main application logic.
- **`fn/spareroom.js`**: An example of a scraper module, using Puppeteer to extract listing data from SpareRoom.
- **`config/searches.json`**: The configuration file for the search URLs.
- **`services/bot.js`**: The module responsible for sending Telegram notifications.
- **`utils/fileUtils.js`**: Handles reading and writing listing data to the filesystem.
- **`utils/urlUtils.js`**: Provides helper functions for parsing and manipulating URLs.
