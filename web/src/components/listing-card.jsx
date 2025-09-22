import { MapPin, BedDouble, Bath } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function InfoPill({ icon: Icon, label }) {
    if (!label) {
        return null;
    }

    return (
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {label}
        </span>
    );
}

export function ListingCard({ listing }) {
    const {
        title,
        priceText,
        direction,
        location,
        summary,
        bedrooms,
        bathrooms,
        thumbnail,
        images,
        link,
        searchNames,
        source
    } = listing;

    const displayImage = thumbnail || images?.[0] || null;

    return (
        <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block h-full"
        >
            <Card className="flex h-full flex-col overflow-hidden transition-transform duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-lg">
                <div className="relative h-40 w-full overflow-hidden bg-muted">
                    {displayImage ? (
                        <img
                            src={displayImage}
                            alt={title ?? 'Listing thumbnail'}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <span className="text-sm font-medium">No image available</span>
                    </div>
                )}
                <Badge className="absolute left-4 top-4 uppercase tracking-wide">
                    {direction || 'Other'}
                </Badge>
            </div>
            <CardHeader className="flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-1">
                    <CardTitle className="text-xl">{priceText || 'Price on application'}</CardTitle>
                    <CardDescription className="text-sm font-medium text-foreground">
                        {title || 'Listing'}
                    </CardDescription>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-1 h-4 w-4 shrink-0" />
                    <span>{location || 'Location not specified'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <InfoPill icon={BedDouble} label={bedrooms ? `${bedrooms} bed${bedrooms > 1 ? 's' : ''}` : null} />
                    <InfoPill icon={Bath} label={bathrooms ? `${bathrooms} bath${bathrooms > 1 ? 's' : ''}` : null} />
                    <InfoPill label={source ? source.toUpperCase() : null} />
                </div>
                {/* {summary ? (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{summary}</p>
                ) : null} */}
            </CardHeader>
            <CardContent className="pt-0">
                {searchNames?.length ? (
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {searchNames.map(name => (
                            <Badge key={name} variant="muted" className="uppercase">
                                {name}
                            </Badge>
                        ))}
                    </div>
                ) : null}
            </CardContent>
        </Card>
        </a>
    );
}
