import { MongoClient } from 'mongodb';
import logger from '../utils/logger.js';
import { extractPostcode, getDirectionFromPrefix, priceTextToNumber, toListingKey, normalizeSource } from '../utils/listingUtils.js';

let client = null;
let database = null;
let listingsCollection = null;
let enabled = false;

const DEFAULT_COLLECTION = 'listings';

function createClient(uri) {
    return new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
        ignoreUndefined: true
    });
}

async function ensureIndexes() {
    if (!listingsCollection) {
        return;
    }

    await listingsCollection.createIndexes([
        { key: { source: 1, listingId: 1 }, name: 'idx_source_listingId' },
        { key: { direction: 1 }, name: 'idx_direction' },
        { key: { priceValue: 1 }, name: 'idx_price_value' },
        { key: { lastSeenAt: -1 }, name: 'idx_last_seen' }
    ]);
}

export function isListingStoreEnabled() {
    return enabled;
}

export async function initListingStore() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        logger.warn('MONGODB_URI not set. MongoDB storage is disabled.');
        enabled = false;
        return false;
    }

    try {
        client = createClient(uri);
        await client.connect();

        const dbName = process.env.MONGODB_DB_NAME || 'srbot';
        const collectionName = process.env.MONGODB_COLLECTION || DEFAULT_COLLECTION;

        database = client.db(dbName);
        listingsCollection = database.collection(collectionName);
        await ensureIndexes();

        enabled = true;
        logger.lifecycle('MongoDB connected', {
            dbName,
            collection: collectionName
        });
        return true;

    } catch (error) {
        logger.error('Failed to initialise MongoDB listing store', error);
        enabled = false;
        return false;
    }
}

export async function closeListingStore() {
    if (client) {
        try {
            await client.close();
            logger.lifecycle('MongoDB client closed');
        } catch (error) {
            logger.warn('Error closing MongoDB client', { error: error.message });
        } finally {
            client = null;
            listingsCollection = null;
            database = null;
            enabled = false;
        }
    }
}

function prepareDocument(source, listing, searchName, searchUrl, timestamp) {
    const normalizedSource = normalizeSource(source);
    const { postcode, areaPrefix } = extractPostcode(listing.location || listing.address || '');
    const direction = getDirectionFromPrefix(areaPrefix);
    const priceValue = priceTextToNumber(listing.price);

    const images = Array.isArray(listing.images) ? listing.images.filter(Boolean) : [];
    const thumbnail = images.length > 0 ? images[0] : null;

    const updateDoc = {
        listingId: listing.id ?? null,
        title: listing.title || null,
        priceText: listing.price || null,
        priceValue,
        priceFrequency: listing.priceFrequency || null,
        link: listing.link || null,
        location: listing.location || listing.address || null,
        postcode,
        direction,
        bedrooms: listing.bedrooms ?? null,
        bathrooms: listing.bathrooms ?? null,
        summary: listing.summary ?? null,
        images,
        thumbnail,
        addedDate: listing.addedDate || null,
        lastSeenAt: timestamp,
        updatedAt: timestamp
    };

    // Remove undefined values to avoid storing them in Mongo
    for (const key of Object.keys(updateDoc)) {
        if (updateDoc[key] === undefined) {
            delete updateDoc[key];
        }
    }

    const setOnInsert = {
        source: normalizedSource,
        firstSeenAt: timestamp,
        createdAt: timestamp
    };

    return {
        updateDoc,
        setOnInsert
    };
}

export async function syncListings(source, searchName, searchUrl, listings) {
    if (!enabled || !Array.isArray(listings) || listings.length === 0) {
        return;
    }

    const timestamp = new Date();
    const operations = [];

    for (const listing of listings) {
        if (!listing || (!listing.id && !listing.link)) {
            continue;
        }

        const { updateDoc, setOnInsert } = prepareDocument(source, listing, searchName, searchUrl, timestamp);
        const key = toListingKey(source, listing.id, listing.link);

        operations.push({
            updateOne: {
                filter: { _id: key },
                update: {
                    $set: updateDoc,
                    $setOnInsert: setOnInsert,
                    $addToSet: {
                        searchRefs: { name: searchName, url: searchUrl },
                        searchNames: searchName
                    }
                },
                upsert: true
            }
        });
    }

    if (operations.length === 0) {
        return;
    }

    try {
        await listingsCollection.bulkWrite(operations, { ordered: false });
    } catch (error) {
        logger.error('Failed to sync listings to MongoDB', error, {
            source,
            searchName,
            operationCount: operations.length
        });
    }
}

export async function markListingAsSent(source, listingId) {
    if (!enabled || !listingId) {
        return;
    }

    const key = toListingKey(source, listingId, null);

    try {
        await listingsCollection.updateOne(
            { _id: key },
            {
                $set: {
                    sentToTelegramAt: new Date()
                },
                $currentDate: {
                    updatedAt: true
                }
            }
        );
    } catch (error) {
        logger.warn('Failed to mark listing as sent', {
            source,
            listingId,
            error: error.message
        });
    }
}

export async function getExistingListingKeysForSearch(keys, searchName) {
    if (!enabled || !Array.isArray(keys) || keys.length === 0) {
        return new Set();
    }

    try {
        const filter = { _id: { $in: keys } };
        if (searchName) {
            filter.searchNames = searchName;
        }

        const docs = await listingsCollection
            .find(filter)
            .project({ _id: 1 })
            .toArray();

        return new Set(docs.map(doc => doc._id));
    } catch (error) {
        logger.error('Failed to fetch existing listings for search', error, {
            searchName,
            keyCount: keys.length
        });
        return new Set();
    }
}

function serialiseListing(doc) {
    return {
        id: doc._id,
        source: doc.source,
        listingId: doc.listingId ?? null,
        title: doc.title ?? null,
        priceText: doc.priceText ?? null,
        priceValue: doc.priceValue ?? null,
        priceFrequency: doc.priceFrequency ?? null,
        link: doc.link ?? null,
        location: doc.location ?? null,
        postcode: doc.postcode ?? null,
        direction: doc.direction ?? 'Other',
        bedrooms: doc.bedrooms ?? null,
        bathrooms: doc.bathrooms ?? null,
        summary: doc.summary ?? null,
        images: doc.images ?? [],
        thumbnail: doc.thumbnail ?? null,
        addedDate: doc.addedDate ?? null,
        firstSeenAt: doc.firstSeenAt ? doc.firstSeenAt.toISOString() : null,
        lastSeenAt: doc.lastSeenAt ? doc.lastSeenAt.toISOString() : null,
        sentToTelegramAt: doc.sentToTelegramAt ? doc.sentToTelegramAt.toISOString() : null,
        searchRefs: doc.searchRefs ?? [],
        searchNames: doc.searchNames ?? []
    };
}

export async function queryListings(options = {}) {
    if (!enabled) {
        return [];
    }

    const {
        direction,
        source,
        sort = 'newest'
    } = options;

    const filter = {};

    if (direction && direction !== 'All') {
        filter.direction = direction;
    }

    if (source && source !== 'all') {
        filter.source = normalizeSource(source);
    }

    const sortMap = {
        priceAsc: { priceValue: 1, lastSeenAt: -1 },
        priceDesc: { priceValue: -1, lastSeenAt: -1 },
        newest: { lastSeenAt: -1 },
        oldest: { lastSeenAt: 1 }
    };

    const sortOption = sortMap[sort] || sortMap.newest;

    try {
        const cursor = listingsCollection
            .find(filter)
            .sort(sortOption);

        const docs = await cursor.toArray();
        return docs.map(serialiseListing);

    } catch (error) {
        logger.error('Failed to query listings', error, { filter, sort });
        return [];
    }
}
