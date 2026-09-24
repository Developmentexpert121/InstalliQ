import { db } from "./db";
import { calendarEvents } from "@shared/schema";
import { and, eq, lt, gte, isNotNull, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getWeatherForLocation, geocodeAddress } from "./weather";

const ONE_HOUR_MS = 60 * 60 * 1000;

async function refreshWeatherForUpcomingJobs() {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * ONE_HOUR_MS);

    const upcoming = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          gte(calendarEvents.date, now),
          lt(calendarEvents.date, sevenDaysFromNow),
          isNotNull(calendarEvents.address),
          inArray(calendarEvents.status, ["SCHEDULED", "DRAFT"])
        )
      );

    if (upcoming.length === 0) {
      console.log("[Scheduler] Weather refresh: no upcoming jobs with addresses found");
      return;
    }

    console.log(`[Scheduler] Weather refresh: updating ${upcoming.length} upcoming job(s)`);
    let updated = 0;

    for (const event of upcoming) {
      try {
        const geo = await geocodeAddress(event.address!);
        if (!geo) continue;
        const targetTime = event.startTime || event.date;
        const weather = await getWeatherForLocation(geo.lat, geo.lng, targetTime);
        await db
          .update(calendarEvents)
          .set({
            weatherTemp: weather.temp,
            weatherFeelsLike: weather.feelsLike,
            weatherCondition: weather.summary,
            weatherHumidity: weather.humidity,
            weatherWindSpeed: weather.windSpeed,
            weatherIcon: weather.icon,
            weatherFetchedAt: new Date(),
          } as any)
          .where(eq(calendarEvents.id, event.id));
        updated++;
      } catch (err) {
        console.error(`[Scheduler] Weather refresh failed for event ${event.id}:`, err);
      }
    }

    console.log(`[Scheduler] Weather refresh complete: ${updated}/${upcoming.length} updated`);
  } catch (err) {
    console.error("[Scheduler] Weather refresh task failed:", err);
  }
}

async function escalatePastDueJobs() {
  try {
    const now = new Date();

    const result = await db
      .update(calendarEvents)
      .set({ status: "NEEDS_REVIEW" } as any)
      .where(
        and(
          lt(calendarEvents.date, now),
          eq(calendarEvents.status, "SCHEDULED")
        )
      )
      .returning({ id: calendarEvents.id });

    if (result.length > 0) {
      console.log(`[Scheduler] Escalated ${result.length} past-due SCHEDULED job(s) to NEEDS_REVIEW`);
    } else {
      console.log("[Scheduler] Escalation: no past-due SCHEDULED jobs found");
    }
  } catch (err) {
    console.error("[Scheduler] Escalation task failed:", err);
  }
}

async function runAllTasks() {
  console.log("[Scheduler] Running hourly tasks...");
  await refreshWeatherForUpcomingJobs();
  await escalatePastDueJobs();
  console.log("[Scheduler] Hourly tasks complete");
}

export function startScheduler() {
  console.log("[Scheduler] Starting — will run tasks every 1 hour");
  runAllTasks();
  setInterval(runAllTasks, ONE_HOUR_MS);
}
