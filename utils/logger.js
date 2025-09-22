/**
 * Structured logging utility for the real estate bot
 */
import dayjs from 'dayjs';

// Log levels with numeric priorities for filtering
const LOG_LEVELS = {
    ERROR: { priority: 0, name: 'ERROR', color: '\x1b[31m' }, // Red
    WARN: { priority: 1, name: 'WARN', color: '\x1b[33m' },   // Yellow
    INFO: { priority: 2, name: 'INFO', color: '\x1b[36m' },   // Cyan
    DEBUG: { priority: 3, name: 'DEBUG', color: '\x1b[90m' }  // Gray
};

const RESET_COLOR = '\x1b[0m';

class Logger {
    constructor() {
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        this.logLevel = LOG_LEVELS[envLevel] ? envLevel : 'WARN'; // default to warnings/errors to keep output quieter
        this.logLevelPriority = LOG_LEVELS[this.logLevel].priority;
        this.enableColors = process.stdout.isTTY && process.env.NO_COLOR !== '1';
    }

    /**
     * Formats a log message with timestamp and context
     * @param {string} level - Log level
     * @param {string} message - Main log message
     * @param {Object} context - Additional context data
     * @returns {string} Formatted log message
     */
    formatMessage(level, message, context = {}) {
        const timestamp = dayjs().format('MM-DD HH:mm:ss');
        const levelInfo = LOG_LEVELS[level];
        
        // Color formatting for terminal output
        const levelText = this.enableColors
            ? `${levelInfo.color}[${levelInfo.name}]${RESET_COLOR}`
            : `[${levelInfo.name}]`;
        
        let formatted = `${timestamp} ${levelText} ${message}`;
        
        // Add context if provided
        if (Object.keys(context).length > 0) {
            const contextStr = JSON.stringify(context, null, 0);
            formatted += ` ${contextStr}`;
        }
        
        return formatted;
    }

    /**
     * Logs a message if it meets the minimum log level
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    log(level, message, context = {}) {
        const levelInfo = LOG_LEVELS[level];
        if (!levelInfo || levelInfo.priority > this.logLevelPriority) {
            return;
        }
        
        const formatted = this.formatMessage(level, message, context);
        
        // Use appropriate console method
        if (level === 'ERROR') {
            console.error(formatted);
        } else if (level === 'WARN') {
            console.warn(formatted);
        } else {
            console.log(formatted);
        }
    }

    /**
     * Log error with stack trace and context
     * @param {string} message - Error message
     * @param {Error|Object} error - Error object or context
     * @param {Object} context - Additional context
     */
    error(message, error, context = {}) {
        const errorContext = { ...context };
        
        if (error instanceof Error) {
            errorContext.error = error.message;
            errorContext.stack = error.stack;
            if (error.code) errorContext.code = error.code;
        } else if (error && typeof error === 'object') {
            Object.assign(errorContext, error);
        }
        
        this.log('ERROR', message, errorContext);
    }

    /**
     * Log warning message
     * @param {string} message - Warning message
     * @param {Object} context - Additional context
     */
    warn(message, context = {}) {
        this.log('WARN', message, context);
    }

    /**
     * Log info message
     * @param {string} message - Info message
     * @param {Object} context - Additional context
     */
    info(message, context = {}) {
        this.log('INFO', message, context);
    }

    /**
     * Log debug message
     * @param {string} message - Debug message
     * @param {Object} context - Additional context
     */
    debug(message, context = {}) {
        this.log('DEBUG', message, context);
    }

    /**
     * Log scraping activity with standardized format
     * @param {string} scraperName - Name of the scraper
     * @param {string} action - Action being performed
     * @param {Object} details - Additional details
     */
    scraper(scraperName, action, details = {}) {
        this.info(`${scraperName}: ${action}`, {
            scraper: scraperName,
            action,
            ...details
        });
    }

    /**
     * Log Telegram bot activity
     * @param {string} action - Bot action
     * @param {Object} details - Additional details
     */
    bot(action, details = {}) {
        this.info(`Telegram: ${action}`, {
            component: 'telegram',
            action,
            ...details
        });
    }

    /**
     * Log performance metrics
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in milliseconds
     * @param {Object} metrics - Additional metrics
     */
    performance(operation, duration, metrics = {}) {
        this.info(`Performance: ${operation}`, {
            operation,
            duration_ms: duration,
            ...metrics
        });
    }

    /**
     * Log application lifecycle events
     * @param {string} event - Lifecycle event
     * @param {Object} details - Additional details
     */
    lifecycle(event, details = {}) {
        this.info(`Lifecycle: ${event}`, {
            event,
            ...details
        });
    }
}

// Create singleton instance
const logger = new Logger();

export default logger;
export { LOG_LEVELS };
