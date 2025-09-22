import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Compass, Map, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListingCard } from '@/components/listing-card';
import { ListingsMap } from '@/components/listings-map';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const DIRECTION_OPTIONS = ['All', 'North', 'East', 'South', 'West', 'Other'];

const SORT_OPTIONS = [
    { value: 'priceAsc', label: 'Price: Low to high' },
    { value: 'priceDesc', label: 'Price: High to low' },
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' }
];

function sortListings(listings, sortOrder) {
    const sorted = [...listings];
    const priceAsc = (a, b) => {
        const aVal = a.priceValue ?? Number.POSITIVE_INFINITY;
        const bVal = b.priceValue ?? Number.POSITIVE_INFINITY;
        return aVal - bVal;
    };

    const priceDesc = (a, b) => {
        const aVal = a.priceValue ?? Number.NEGATIVE_INFINITY;
        const bVal = b.priceValue ?? Number.NEGATIVE_INFINITY;
        return bVal - aVal;
    };

    const newest = (a, b) => {
        const aDate = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const bDate = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        return bDate - aDate;
    };

    const oldest = (a, b) => {
        const aDate = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : Number.POSITIVE_INFINITY;
        const bDate = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : Number.POSITIVE_INFINITY;
        return aDate - bDate;
    };

    switch (sortOrder) {
        case 'priceAsc':
            return sorted.sort(priceAsc);
        case 'priceDesc':
            return sorted.sort(priceDesc);
        case 'oldest':
            return sorted.sort(oldest);
        case 'newest':
        default:
            return sorted.sort(newest);
    }
}

export default function App() {
    const [listings, setListings] = useState([]);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [direction, setDirection] = useState('All');
    const [sortOrder, setSortOrder] = useState('priceAsc');
    const [viewMode, setViewMode] = useState('list');

    const fetchListings = useCallback(async () => {
        setStatus('loading');
        setError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/listings`);
            if (!response.ok) {
                throw new Error(`Failed to fetch listings (status ${response.status})`);
            }

            const payload = await response.json();
            const data = Array.isArray(payload.data) ? payload.data : [];
            setListings(data);
            setStatus('success');
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to load listings');
            setStatus('error');
        }
    }, []);

    useEffect(() => {
        fetchListings();
    }, [fetchListings]);

    const filteredListings = useMemo(() => {
        const byDirection = direction === 'All'
            ? listings
            : listings.filter(listing => (listing.direction || 'Other') === direction);
        return sortListings(byDirection, sortOrder);
    }, [listings, direction, sortOrder]);

    const activeCounts = useMemo(() => ({
        total: listings.length,
        filtered: filteredListings.length
    }), [listings.length, filteredListings.length]);

    const showEmpty = status === 'success' && filteredListings.length === 0;

    return (
        <div className="min-h-screen bg-background">
            {/* <header className="border-b">
                <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="uppercase tracking-wide">
                                Live feed
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                                {activeCounts.filtered} of {activeCounts.total} listings shown
                            </span>
                        </div>
                        <div>
                            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                                Rental listings dashboard
                            </h1>
                            <p className="text-muted-foreground">
                                Monitor saved searches, review details, and explore results on the map in real time.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Button
                            variant="outline"
                            onClick={fetchListings}
                            disabled={status === 'loading'}
                            className="inline-flex items-center gap-2"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Refresh
                        </Button>
                    </div>
                </div>
            </header> */}

            <main className="mx-auto max-w-7xl px-6 py-8">
                <div className="sticky top-6 z-20 grid gap-4 rounded-lg border bg-card p-4 shadow-sm md:grid-cols-3">
                    <div className="flex flex-col gap-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Compass className="h-4 w-4" /> Direction
                        </span>
                        <Select value={direction} onValueChange={setDirection}>
                            <SelectTrigger>
                                <SelectValue placeholder="All directions" />
                            </SelectTrigger>
                            <SelectContent>
                                {DIRECTION_OPTIONS.map(option => (
                                    <SelectItem key={option} value={option}>
                                        {option}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <ArrowUpDown className="h-4 w-4" /> Sort by
                        </span>
                        <Select value={sortOrder} onValueChange={setSortOrder}>
                            <SelectTrigger>
                                <SelectValue placeholder="Sort listings" />
                            </SelectTrigger>
                            <SelectContent>
                                {SORT_OPTIONS.map(option => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Map className="h-4 w-4" /> View mode
                        </span>
                        <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="list">List</TabsTrigger>
                                <TabsTrigger value="map">Map</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </div>

                {error ? (
                    <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">
                        {error}
                    </div>
                ) : null}

                <Tabs value={viewMode} onValueChange={setViewMode} className="mt-6">
                    <TabsList className="hidden" />
                    <TabsContent value="list">
                        {status === 'loading' ? (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {Array.from({ length: 6 }).map((_, index) => (
                                    <div key={index} className="h-80 animate-pulse rounded-lg border bg-muted/50" />
                                ))}
                            </div>
                        ) : null}

                        {showEmpty ? (
                            <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
                                <div className="space-y-2 text-center">
                                    <h3 className="text-lg font-semibold">No listings match this filter</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Try a different direction or refresh the data.
                                    </p>
                                </div>
                            </div>
                        ) : null}

                        {status === 'success' && filteredListings.length > 0 ? (
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                                {filteredListings.map(listing => (
                                    <ListingCard key={listing.id} listing={listing} />
                                ))}
                            </div>
                        ) : null}
                    </TabsContent>
                    <TabsContent value="map">
                        {status === 'loading' ? (
                            <div className="flex h-[480px] items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                                Loading map data…
                            </div>
                        ) : null}
                        {status === 'success' && filteredListings.length > 0 ? (
                            <ListingsMap listings={filteredListings} />
                        ) : null}
                        {showEmpty ? (
                            <div className="mt-6 flex h-60 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
                                <div className="space-y-2 text-center">
                                    <h3 className="text-lg font-semibold">No markers to display</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Adjust filters to see matches on the map.
                                    </p>
                                </div>
                            </div>
                        ) : null}
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
