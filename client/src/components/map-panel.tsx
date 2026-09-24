import { MapPin, Navigation, Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface MapPanelProps {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  lat?: string | null;
  lng?: string | null;
}

export function MapPanel({ address, city, state, postalCode, lat, lng }: MapPanelProps) {
  const { toast } = useToast();

  const fullAddress = [address, city, state, postalCode].filter(Boolean).join(", ");
  const hasLocation = lat && lng;
  const hasAddress = fullAddress.length > 0;

  const copyAddress = async () => {
    if (fullAddress) {
      await navigator.clipboard.writeText(fullAddress);
      toast({
        title: "Address copied",
        description: "Address has been copied to clipboard",
      });
    }
  };

  const openGoogleMaps = () => {
    if (hasLocation) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, "_blank");
    } else if (hasAddress) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`, "_blank");
    }
  };

  const openAppleMaps = () => {
    if (hasLocation) {
      window.open(`maps://maps.apple.com/?q=${lat},${lng}`, "_blank");
    } else if (hasAddress) {
      window.open(`maps://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`, "_blank");
    }
  };

  const openWaze = () => {
    if (hasLocation) {
      window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, "_blank");
    } else if (hasAddress) {
      window.open(`https://waze.com/ul?q=${encodeURIComponent(fullAddress)}&navigate=yes`, "_blank");
    }
  };

  const getDirections = () => {
    if (hasLocation) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
    } else if (hasAddress) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`, "_blank");
    }
  };

  if (!hasLocation && !hasAddress) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Location
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No location data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="map-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Location
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasLocation && (
          <div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
            <iframe
              src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${lat},${lng}&zoom=15`}
              className="w-full h-full border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Location map"
            />
          </div>
        )}

        {hasAddress && (
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm" data-testid="text-address">{fullAddress}</p>
            <Button variant="ghost" size="icon" onClick={copyAddress} data-testid="button-copy-address">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={getDirections}
            className="w-full"
            data-testid="button-navigate"
          >
            <Navigation className="h-4 w-4 mr-2" />
            Navigate
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={openGoogleMaps}
            className="w-full"
            data-testid="button-google-maps"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Google Maps
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={openAppleMaps}
            className="w-full"
            data-testid="button-apple-maps"
          >
            Apple Maps
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={openWaze}
            className="w-full"
            data-testid="button-waze"
          >
            Waze
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
