import { useQuery } from "@tanstack/react-query";
import { Cloud, CloudRain, Sun, Wind, Droplets, RefreshCw, ThermometerSun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";

interface WeatherData {
  provider: string;
  timeUsed: string;
  temp: number;
  feelsLike: number;
  precipProb: number;
  windSpeed: number;
  summary: string;
  icon: string;
  humidity: number;
}

interface WeatherPanelProps {
  projectId?: number;
  lat?: string;
  lng?: string;
  targetTime?: Date;
}

function getWeatherIcon(icon: string) {
  if (icon.includes("01") || icon.includes("02")) {
    return <Sun className="h-8 w-8 text-yellow-500" />;
  } else if (icon.includes("09") || icon.includes("10") || icon.includes("11")) {
    return <CloudRain className="h-8 w-8 text-blue-500" />;
  } else {
    return <Cloud className="h-8 w-8 text-gray-500" />;
  }
}

export function WeatherPanel({ projectId, lat, lng, targetTime }: WeatherPanelProps) {
  const queryParams = new URLSearchParams();
  if (projectId) {
    queryParams.set("projectId", projectId.toString());
  } else if (lat && lng) {
    queryParams.set("lat", lat);
    queryParams.set("lng", lng);
  }
  if (targetTime) {
    queryParams.set("time", targetTime.toISOString());
  }

  const queryKey = ["/api/weather", queryParams.toString()];

  const { data: weather, isLoading, error, refetch } = useQuery<WeatherData>({
    queryKey,
    enabled: !!(projectId || (lat && lng)),
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey });
    refetch();
  };

  if (!projectId && (!lat || !lng)) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No location data available</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load weather</p>
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const forecastTime = new Date(weather.timeUsed);

  return (
    <Card data-testid="weather-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Weather Forecast
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={handleRefresh} data-testid="button-refresh-weather">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-3">
          {getWeatherIcon(weather.icon)}
          <div>
            <p className="text-2xl font-bold">{weather.temp}°F</p>
            <p className="text-sm text-muted-foreground capitalize">{weather.summary}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <ThermometerSun className="h-4 w-4 text-orange-500" />
            <span>Feels like {weather.feelsLike}°F</span>
          </div>
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-500" />
            <span>{weather.precipProb}% precip</span>
          </div>
          <div className="flex items-center gap-2">
            <Wind className="h-4 w-4 text-gray-500" />
            <span>{weather.windSpeed} mph wind</span>
          </div>
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-gray-400" />
            <span>{weather.humidity}% humidity</span>
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground mt-3">
          Forecast for {forecastTime.toLocaleDateString()} at {forecastTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </CardContent>
    </Card>
  );
}
