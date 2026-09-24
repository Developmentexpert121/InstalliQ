import { db } from "./db";
import { weatherCache } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_TTL_MINUTES = 60;

export interface WeatherData {
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

function getTimeBucket(date: Date): string {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

async function getCachedWeather(
  lat: string,
  lng: string,
  timeBucket: string,
): Promise<WeatherData | null> {
  try {
    const cached = await db
      .select()
      .from(weatherCache)
      .where(
        and(
          eq(weatherCache.latitude, lat),
          eq(weatherCache.longitude, lng),
          eq(weatherCache.timeBucket, timeBucket),
          gt(weatherCache.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (cached.length > 0) {
      return JSON.parse(cached[0].payloadJson);
    }
    return null;
  } catch (error) {
    console.error("Error fetching cached weather:", error);
    return null;
  }
}
// Cache weather data for 60 minutes
async function cacheWeather(
  lat: string,
  lng: string,
  timeBucket: string,
  data: WeatherData,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MINUTES * 60 * 1000);
    await db.insert(weatherCache).values({
      latitude: lat,
      longitude: lng,
      timeBucket,
      provider: "openweather",
      payloadJson: JSON.stringify(data),
      expiresAt,
    });
  } catch (error) {
    console.error("Error caching weather:", error);
  }
}

export async function getWeatherForLocation(
  lat: string,
  lng: string,
  targetTime?: Date,
): Promise<WeatherData> {
  const time = targetTime || new Date();
  const timeBucket = getTimeBucket(time);

  const cached = await getCachedWeather(lat, lng, timeBucket);
  if (cached) {
    return cached;
  }

  if (!WEATHER_API_KEY) {
    return getMockWeather(time);
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${WEATHER_API_KEY}&units=imperial`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error("OpenWeather API error:", response.status);
      return getMockWeather(time);
    }

    const data = await response.json();

    const targetTimestamp = time.getTime() / 1000;
    let closestForecast = data.list[0];
    let minDiff = Math.abs(data.list[0].dt - targetTimestamp);

    for (const forecast of data.list) {
      const diff = Math.abs(forecast.dt - targetTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestForecast = forecast;
      }
    }

    const weatherData: WeatherData = {
      provider: "openweather",
      timeUsed: new Date(closestForecast.dt * 1000).toISOString(),
      temp: Math.round(closestForecast.main.temp),
      feelsLike: Math.round(closestForecast.main.feels_like),
      precipProb: Math.round((closestForecast.pop || 0) * 100),
      windSpeed: Math.round(closestForecast.wind.speed),
      summary: closestForecast.weather[0]?.description || "Unknown",
      icon: closestForecast.weather[0]?.icon || "01d",
      humidity: closestForecast.main.humidity,
    };

    await cacheWeather(lat, lng, timeBucket, weatherData);

    return weatherData;
  } catch (error) {
    console.error("Error fetching weather:", error);
    return getMockWeather(time);
  }
}

function getMockWeather(time: Date): WeatherData {
  return {
    provider: "mock",
    timeUsed: time.toISOString(),
    temp: 72,
    feelsLike: 70,
    precipProb: 10,
    windSpeed: 8,
    summary: "Partly cloudy",
    icon: "02d",
    humidity: 45,
  };
}

export interface DailyForecast {
  date: string;
  dayOfWeek: string;
  tempHigh: number;
  tempLow: number;
  precipProb: number;
  summary: string;
  icon: string;
  humidity: number;
  windSpeed: number;
}

export interface ForecastResponse {
  eventDay: WeatherData | null;
  fiveDayForecast: DailyForecast[];
}

export async function get5DayForecast(
  lat: string,
  lng: string,
  eventDate?: Date,
): Promise<ForecastResponse> {
  if (!WEATHER_API_KEY) {
    return getMock5DayForecast(eventDate);
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${WEATHER_API_KEY}&units=imperial`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error("OpenWeather API error:", response.status);
      return getMock5DayForecast(eventDate);
    }

    const data = await response.json();

    // Group forecasts by day
    const dailyData: Record<
      string,
      {
        temps: number[];
        pops: number[];
        humidities: number[];
        winds: number[];
        weather: any;
      }
    > = {};

    for (const forecast of data.list) {
      const date = new Date(forecast.dt * 1000);
      const dateKey = date.toISOString().split("T")[0];

      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          temps: [],
          pops: [],
          humidities: [],
          winds: [],
          weather: forecast.weather[0],
        };
      }
      dailyData[dateKey].temps.push(forecast.main.temp);
      dailyData[dateKey].pops.push(forecast.pop || 0);
      dailyData[dateKey].humidities.push(forecast.main.humidity || 0);
      dailyData[dateKey].winds.push(forecast.wind?.speed || 0);
    }

    const fiveDayForecast: DailyForecast[] = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, dayData]) => {
        const date = new Date(dateKey + "T12:00:00");
        return {
          date: dateKey,
          dayOfWeek: date.toLocaleDateString("en-US", { weekday: "short" }),
          tempHigh: Math.round(Math.max(...dayData.temps)),
          tempLow: Math.round(Math.min(...dayData.temps)),
          precipProb: Math.round(Math.max(...dayData.pops) * 100),
          summary: dayData.weather?.description || "Unknown",
          icon: dayData.weather?.icon || "01d",
          humidity: Math.round(
            dayData.humidities.reduce((a, b) => a + b, 0) /
              dayData.humidities.length,
          ),
          windSpeed: Math.round(Math.max(...dayData.winds)),
        };
      });

    // Ensure we always have 7 days by filling in missing days
    while (fiveDayForecast.length < 7) {
      const lastDay = fiveDayForecast[fiveDayForecast.length - 1];
      const nextDate = new Date(lastDay.date + "T12:00:00");
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateKey = nextDate.toISOString().split("T")[0];
      fiveDayForecast.push({
        date: nextDateKey,
        dayOfWeek: nextDate.toLocaleDateString("en-US", { weekday: "short" }),
        tempHigh: lastDay.tempHigh,
        tempLow: lastDay.tempLow,
        precipProb: lastDay.precipProb,
        summary: lastDay.summary,
        icon: lastDay.icon,
        humidity: lastDay.humidity,
        windSpeed: lastDay.windSpeed,
      });
    }

    // Get event day weather if eventDate provided
    let eventDay: WeatherData | null = null;
    if (eventDate) {
      eventDay = await getWeatherForLocation(lat, lng, eventDate);
    }

    return { eventDay, fiveDayForecast: fiveDayForecast.slice(0, 7) };
  } catch (error) {
    console.error("Error fetching 5-day forecast:", error);
    return getMock5DayForecast(eventDate);
  }
}

function getMock5DayForecast(eventDate?: Date): ForecastResponse {
  const today = new Date();
  const fiveDayForecast: DailyForecast[] = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    fiveDayForecast.push({
      date: date.toISOString().split("T")[0],
      dayOfWeek: date.toLocaleDateString("en-US", { weekday: "short" }),
      tempHigh: 72 + Math.floor(Math.random() * 10),
      tempLow: 55 + Math.floor(Math.random() * 10),
      precipProb: Math.floor(Math.random() * 30),
      summary: "Partly cloudy",
      icon: "02d",
      humidity: 40 + Math.floor(Math.random() * 20),
      windSpeed: 5 + Math.floor(Math.random() * 10),
    });
  }

  return {
    eventDay: eventDate ? getMockWeather(eventDate) : null,
    fiveDayForecast,
  };
}

function extractCityStateForGeocoding(address: string): string {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 2]
      .replace(/\d{5}(-\d{4})?/, "")
      .trim();
    const city = parts[parts.length - 3] || parts[0];
    const state = stateZip || parts[parts.length - 1];
    if (city && state) return `${city},${state},US`;
  }
  if (parts.length === 2) {
    return `${parts[0]},${parts[1]},US`;
  }
  return address;
}

async function tryGeocode(
  query: string,
): Promise<{ lat: string; lng: string; formattedAddress: string } | null> {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${WEATHER_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || data.length === 0) return null;
  const result = data[0];
  return {
    lat: result.lat.toString(),
    lng: result.lon.toString(),
    formattedAddress: `${result.name}${result.state ? `, ${result.state}` : ""}${result.country ? `, ${result.country}` : ""}`,
  };
}

export async function geocodeAddress(
  address: string,
): Promise<{ lat: string; lng: string; formattedAddress: string } | null> {
  if (!WEATHER_API_KEY) {
    console.log("Geocoding: No API key available");
    return null;
  }

  try {
    console.log("Geocoding address:", address);
    const cityState = extractCityStateForGeocoding(address);
    let result = await tryGeocode(cityState);
    if (result) {
      console.log(
        "Geocoded via city/state:",
        cityState,
        "->",
        result.lat,
        result.lng,
      );
      return result;
    }

    result = await tryGeocode(address);
    if (result) {
      console.log(
        "Geocoded via full address:",
        address,
        "->",
        result.lat,
        result.lng,
      );
      return result;
    }

    console.log("Geocoding: No results found for", address);
    return null;
  } catch (error) {
    console.error("Error geocoding address:", error);
    return null;
  }
}
