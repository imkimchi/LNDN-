import fs from 'fs';
import path from 'path';

/**
 * Ensures the listings directory exists, creating it if necessary
 * @param {string} dirPath - The directory path to ensure exists
 */
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
        } catch (error) {
            console.error(`Failed to create directory ${dirPath}:`, error.message);
            throw new Error(`Cannot create listings directory: ${error.message}`);
        }
    }
}

function getListingsDir() {
    const __dirname = import.meta.url ? new URL('.', import.meta.url).pathname : __dirname;
    return path.join(__dirname, '..', 'listings');
}

/**
 * Gets the file path for storing listings data
 * @param {string} urlType - The type of URL (spareroom, rightmove, etc.)
 * @param {string} searchId - The search identifier
 * @returns {string} The complete file path for the listings JSON file
 * @throws {Error} If urlType or searchId are invalid
 */
export function getListingsFilePath(urlType, searchId) {
    if (!urlType || typeof urlType !== 'string') {
        throw new Error('urlType must be a non-empty string');
    }
    if (!searchId || typeof searchId !== 'string') {
        throw new Error('searchId must be a non-empty string');
    }
    
    const prevListingsDir = getListingsDir();
    
    // Ensure the listings directory exists
    ensureDirectoryExists(prevListingsDir);
    
    return path.join(prevListingsDir, `${urlType}-${searchId}.json`);
}

/**
 * Reads previous listings from a JSON file
 * @param {string} filePath - The path to the listings JSON file
 * @returns {Array} Array of previous listings, or empty array if file doesn't exist or is corrupted
 */
export function readPreviousListings(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        console.warn('Invalid file path provided to readPreviousListings');
        return [];
    }
    
    if (!fs.existsSync(filePath)) {
        return [];
    }
    
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        if (!fileContent.trim()) {
            console.warn(`Empty listings file found: ${filePath}`);
            return [];
        }
        
        const parsed = JSON.parse(fileContent);
        if (!Array.isArray(parsed)) {
            console.warn(`Invalid listings file format (not an array): ${filePath}`);
            return [];
        }
        
        return parsed;
    } catch (error) {
        console.error(`Failed to read listings file ${filePath}:`, error.message);
        // Create backup of corrupted file
        try {
            const backupPath = `${filePath}.backup.${Date.now()}`;
            fs.copyFileSync(filePath, backupPath);
            console.log(`Corrupted file backed up to: ${backupPath}`);
        } catch (backupError) {
            console.error('Failed to backup corrupted file:', backupError.message);
        }
        return [];
    }
}

/**
 * Writes listings to a JSON file with error handling and validation
 * @param {string} filePath - The path where to write the listings
 * @param {Array} listings - The listings array to write
 * @throws {Error} If the write operation fails
 */
export function writeListings(filePath, listings) {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('filePath must be a non-empty string');
    }
    
    if (!Array.isArray(listings)) {
        throw new Error('listings must be an array');
    }
    
    try {
        // Ensure directory exists before writing
        const dirPath = path.dirname(filePath);
        ensureDirectoryExists(dirPath);
        
        // Write to temp file first, then rename for atomic operation
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        const jsonContent = JSON.stringify(listings, null, 2);
        
        fs.writeFileSync(tempPath, jsonContent, 'utf8');
        
        // Atomic rename
        fs.renameSync(tempPath, filePath);
        
    } catch (error) {
        console.error(`Failed to write listings file ${filePath}:`, error.message);
        
        // Clean up temp file if it exists
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        if (fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch (cleanupError) {
                console.error('Failed to clean up temp file:', cleanupError.message);
            }
        }
        
        throw new Error(`Cannot write listings file: ${error.message}`);
    }
}

/**
 * Returns the path for the persistent cross-source sent signatures file
 * @returns {string}
 */
export function getSentSignaturesPath() {
    const dir = getListingsDir();
    ensureDirectoryExists(dir);
    return path.join(dir, 'sent-signatures.json');
}

/**
 * Reads the global sent signatures list from disk
 * @param {string} [filePath]
 * @returns {Array<string>} array of signatures
 */
export function readSentSignatures(filePath = getSentSignaturesPath()) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content.trim()) return [];
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error(`Failed to read sent signatures file ${filePath}:`, error.message);
        return [];
    }
}

/**
 * Writes the global sent signatures list to disk
 * @param {Array<string>} signatures
 * @param {string} [filePath]
 */
export function writeSentSignatures(signatures, filePath = getSentSignaturesPath()) {
    try {
        const dir = path.dirname(filePath);
        ensureDirectoryExists(dir);
        const tmp = `${filePath}.tmp.${Date.now()}`;
        fs.writeFileSync(tmp, JSON.stringify(signatures, null, 2), 'utf8');
        fs.renameSync(tmp, filePath);
    } catch (error) {
        console.error(`Failed to write sent signatures file ${filePath}:`, error.message);
    }
}
