# Persistence & Web Dashboard

## Backend changes
- Listings are now persisted to MongoDB when `MONGODB_URI` is present. Data is deduplicated per source + listing id and enriched with postcode-derived direction.
- Express API exposed at `/api/listings` (and `/api/health`) to serve the stored listings for the web client. Configure the port with `API_PORT` (defaults to 4000).
- New helper scripts and shutdown hooks close the MongoDB client and HTTP server gracefully.
- `markListingAsSent` records Telegram notifications to keep the timeline in Mongo.

## Frontend overview (`web/`)
- Vite + React + Tailwind + shadcn UI components, collocated in `web/` with its own `package.json`.
- Features: price sorting, postcode direction filter, list cards, Google Maps view with thumbnail popovers and double-click navigation.
- Uses `@react-google-maps/api`; requires a browser-exposed key via `VITE_GOOGLE_MAPS_API_KEY`.

### Frontend commands
```
pnpm --dir web install
pnpm --dir web dev
pnpm --dir web build
```
Set `VITE_API_BASE_URL` if the API is not running on `http://localhost:4000`.

## Environment variables
| Variable | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string (enables persistence + API). |
| `MONGODB_DB_NAME` | Optional database name (`srbot` default). |
| `MONGODB_COLLECTION` | Optional collection name (`listings` default). |
| `API_PORT` | Port for the Express listings API (default `4000`). |
| `VITE_API_BASE_URL` | Frontend fetch base (default `http://localhost:4000`). |
| `VITE_GOOGLE_MAPS_API_KEY` | Browser key for Google Maps JS API. |

## Notes
- The Google geocoder runs client-side; results are cached in-memory per session.
- Tailwind + shadcn styles live in `web/tailwind.config.js` and `web/src/components/ui/*`.
- Building with Vite emits a Node 20+ warning but still succeeds under Node 18; upgrade Node when convenient.
