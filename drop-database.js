#!/usr/bin/env node

import process from 'node:process';
import { MongoClient } from 'mongodb';
import logger from './utils/logger.js';

const FORCE_FLAG = '--force';

async function dropDatabase() {
    const hasForceFlag = process.argv.includes(FORCE_FLAG);
    if (!hasForceFlag) {
        logger.warn(`Refusing to drop MongoDB database without ${FORCE_FLAG}`);
        logger.info(`Usage: node drop-database.js ${FORCE_FLAG}`);
        process.exitCode = 1;
        return;
    }

    const uri = 'mongodb+srv://wbvcos:vamWHonDRzsyFwKS@room.umdokx1.mongodb.net/?retryWrites=true&w=majority&appName=room';

    const dbName = process.env.MONGODB_DB_NAME || 'srbot';

    const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 10_000
    });

    try {
        logger.lifecycle('Connecting to MongoDB', { dbName });
        await client.connect();

        const db = client.db(dbName);
        const collections = await db.listCollections({}, { nameOnly: true }).toArray();
        logger.info('Found collections before drop', {
            dbName,
            collections: collections.map(collection => collection.name)
        });

        const dropResult = await db.dropDatabase();
        if (dropResult === true || dropResult?.ok === 1) {
            logger.lifecycle('MongoDB database dropped', {
                dbName,
                droppedCollections: collections.map(collection => collection.name),
                collectionCount: collections.length
            });
        } else {
            logger.warn('MongoDB reported a non-successful drop operation', { dbName, dropResult });
            process.exitCode = 1;
        }
    } catch (error) {
        logger.error('Failed to drop MongoDB database', error, { dbName });
        process.exitCode = 1;
    } finally {
        await client.close().catch(closeError => {
            logger.warn('Error closing MongoDB client after drop operation', { error: closeError.message });
        });
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    dropDatabase().catch(error => {
        logger.error('Unexpected failure during MongoDB drop script', error);
        process.exit(1);
    });
}
