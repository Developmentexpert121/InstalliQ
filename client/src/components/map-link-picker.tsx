import { ReactNode } from "react";
import { MapPin, Navigation } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MapMode = "search" | "directions";

type MapApp = "google" | "apple" | "waze";

function detectPlatform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (
    (navigator as any).platform === "MacIntel" &&
    (navigator as any).maxTouchPoints > 1
  ) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function buildUrl(app: MapApp, mode: MapMode, query: string): string {
  const q = encodeURIComponent(query);
  if (mode === "directions") {
    switch (app) {
      case "google":
        return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
      case "apple":
        return `https://maps.apple.com/?daddr=${q}&dirflg=d`;
      case "waze":
        return `https://waze.com/ul?q=${q}&navigate=yes`;
    }
  }
  switch (app) {
    case "google":
      return `https://www.google.com/maps/search/?api=1&query=${q}`;
    case "apple":
      return `https://maps.apple.com/?q=${q}`;
    case "waze":
      return `https://waze.com/ul?q=${q}`;
  }
}

const APP_LABELS: Record<MapApp, string> = {
  google: "Google Maps",
  apple: "Apple Maps",
  waze: "Waze",
};

interface MapLinkPickerProps {
  address: string;
  mode?: MapMode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  testIdPrefix?: string;
}

export function MapLinkPicker({
  address,
  mode = "search",
  children,
  align = "start",
  testIdPrefix = "map",
}: MapLinkPickerProps) {
  const platform = detectPlatform();

  let apps: MapApp[];
  if (platform === "android") {
    apps = ["google", "waze"];
  } else if (platform === "ios") {
    apps = ["google", "apple", "waze"];
  } else {
    apps = ["google", "apple", "waze"];
  }

  const open = (app: MapApp) => {
    const url = buildUrl(app, mode, address);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel>
          {mode === "directions" ? "Get directions with" : "Open in"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {apps.map((app) => (
          <DropdownMenuItem
            key={app}
            onClick={() => open(app)}
            data-testid={`${testIdPrefix}-open-${app}`}
            className="cursor-pointer"
          >
            {mode === "directions" ? (
              <Navigation className="h-4 w-4 mr-2" />
            ) : (
              <MapPin className="h-4 w-4 mr-2" />
            )}
            {APP_LABELS[app]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
