import express from 'express';
import cors from 'cors';
import logger from '../utils/logger.js';
import { isListingStoreEnabled, queryListings } from './listingStore.js';

let appInstance = null;
let httpServer = null;

function createApp() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    app.get('/api/listings', async (req, res, next) => {
        try {
            const listings = await queryListings({
                direction: req.query.direction,
                source: req.query.source,
                sort: req.query.sort
            });

            res.json({ data: listings });
        } catch (error) {
            next(error);
        }
    });

    app.use((err, _req, res, _next) => {
        logger.error('API error', err);
        res.status(500).json({ error: 'Internal server error' });
    });

    return app;
}

export async function startApiServer() {
    if (!isListingStoreEnabled()) {
        logger.warn('Listing store disabled. API server will not start.');
        return;
    }

    if (appInstance) {
        return;
    }

    const port = Number.parseInt(process.env.API_PORT || '4000', 10);
    appInstance = createApp();

    await new Promise(resolve => {
        httpServer = appInstance.listen(port, () => {
            logger.lifecycle('API server listening', { port });
            resolve();
        });
    });
}

export async function stopApiServer() {
    if (!httpServer) {
        return;
    }

    await new Promise(resolve => {
        httpServer.close(() => {
            logger.lifecycle('API server stopped');
            resolve();
        });
    });

    httpServer = null;
    appInstance = null;
}

