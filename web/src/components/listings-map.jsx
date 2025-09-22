import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

const defaultCenter = { lat: 51.5072, lng: -0.1276 }; // Central London fallback
const mapContainerStyle = { width: '100%', height: '600px' };

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function geocodeAddress(geocoder, address) {
    return new Promise(resolve => {
        geocoder.geocode({ address }, (results, status) => {
            if (status === 'OK' && results?.[0]) {
                resolve(results[0].geometry.location.toJSON());
            } else {
                resolve(null);
            }
        });
    });
}

export function ListingsMap({ listings }) {
    const yo = `AIzaSyB_jjfUnz1keIUkZm_D2sk8OMK1rLA9IWY`
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || yo;
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey ?? '',
        libraries: ['places']
    });

    const [markers, setMarkers] = useState([]);
    const [activeMarkerId, setActiveMarkerId] = useState(null);
    const cacheRef = useRef(new Map());
    const mapRef = useRef(null);

    const handleMapLoad = useCallback(map => {
        mapRef.current = map;
    }, []);

    const handleMapUnmount = useCallback(() => {
        mapRef.current = null;
    }, []);

    const activeMarker = useMemo(() => markers.find(marker => marker.listing.id === activeMarkerId) || null, [markers, activeMarkerId]);

    useEffect(() => {
        if (!isLoaded || !window.google?.maps) {
            return;
        }

        let cancelled = false;
        const geocoder = new window.google.maps.Geocoder();

        const processGeocoding = async () => {
            const nextMarkers = [];
            for (const listing of listings) {
                if (!listing.location) {
                    continue;
                }
                const cacheKey = `${listing.location}`;
                let position = cacheRef.current.get(cacheKey);
                if (!position) {
                    position = await geocodeAddress(geocoder, listing.location);
                    if (cancelled) {
                        return;
                    }
                    if (position) {
                        cacheRef.current.set(cacheKey, position);
                        // Small delay to avoid hammering the geocoder
                        await delay(150);
                    }
                }

                if (position) {
                    nextMarkers.push({ listing, position });
                }
            }

            if (!cancelled) {
                setMarkers(nextMarkers);
            }
        };

        processGeocoding();

        return () => {
            cancelled = true;
        };
    }, [isLoaded, listings]);

    useEffect(() => {
        if (!isLoaded || !window.google?.maps || markers.length === 0 || !mapRef.current) {
            return;
        }

        const bounds = new window.google.maps.LatLngBounds();
        markers.forEach(marker => bounds.extend(marker.position));
        mapRef.current.fitBounds(bounds, 64);
    }, [isLoaded, markers]);

    const handleMarkerClick = listing => {
        if (activeMarkerId === listing.id && listing.link) {
            window.open(listing.link, '_blank', 'noopener');
            return;
        }
        setActiveMarkerId(listing.id);
    };

    const center = useMemo(() => markers[0]?.position ?? defaultCenter, [markers]);

    if (!apiKey) {
        return (
            <div className="flex h-96 w-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 text-center text-muted-foreground">
                <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Google Maps unavailable</h3>
                    <p className="text-sm">Set <code>VITE_GOOGLE_MAPS_API_KEY</code> to enable the interactive map.</p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">Failed to load Google Maps: {loadError.message}</div>;
    }

    if (!isLoaded) {
        return <div className="flex h-96 w-full items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">Loading map…</div>;
    }

    return (
        <div className="overflow-hidden rounded-xl border shadow-sm">
            <GoogleMap
                mapContainerStyle={mapContainerStyle}
                onLoad={handleMapLoad}
                onUnmount={handleMapUnmount}
                center={center}
                options={{
                    streetViewControl: false,
                    mapTypeControl: false,
                    fullscreenControl: false
                }}
            >
                {markers.map(({ listing, position }) => (
                    <MarkerF
                        key={listing.id}
                        position={position}
                        onClick={() => handleMarkerClick(listing)}
                    />
                ))}
                {activeMarker ? (
                    <InfoWindowF
                        position={activeMarker.position}
                        onCloseClick={() => setActiveMarkerId(null)}
                    >
                        <div className="w-56 space-y-3">
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-base font-semibold">{activeMarker.listing.priceText || 'Price N/A'}</span>
                                    <Badge>{activeMarker.listing.direction || 'Other'}</Badge>
                                </div>
                                <p className="line-clamp-2 text-sm font-medium text-muted-foreground">
                                    {activeMarker.listing.title || activeMarker.listing.location}
                                </p>
                            </div>
                            {activeMarker.listing.thumbnail ? (
                                <img
                                    src={activeMarker.listing.thumbnail}
                                    alt={activeMarker.listing.title ?? 'Listing image'}
                                    className="h-28 w-full rounded-md object-cover"
                                />
                            ) : null}
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => activeMarker.listing.link && window.open(activeMarker.listing.link, '_blank', 'noopener')}
                            >
                                View Listing <ExternalLink className="ml-2 h-4 w-4" />
                            </Button>
                            <p className="text-xs text-muted-foreground">Tip: click the marker again to open the listing directly.</p>
                        </div>
                    </InfoWindowF>
                ) : null}
            </GoogleMap>
        </div>
    );
}
