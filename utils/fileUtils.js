import fs from 'fs';
import path from 'path';

export function getListingsFilePath(urlType, searchId) {
    const __dirname = import.meta.url ? new URL('.', import.meta.url).pathname : __dirname;
    const prevListingsDir = path.join(__dirname, '..', 'listings');
    return path.join(prevListingsDir, `${urlType}-${searchId}.json`);
}

export function readPreviousListings(filePath) {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath)) : [];
}

export function writeListings(filePath, listings) {
    fs.writeFileSync(filePath, JSON.stringify(listings, null, 2));
}
