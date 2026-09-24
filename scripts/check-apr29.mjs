import { db } from "../server/db.js";
import { sql } from "drizzle-orm";

// Find dates that have 4+ events on the same day for the same owner
const overlap = await db.execute(sql`
  SELECT 
    DATE(start_time AT TIME ZONE 'America/New_York') as day_est,
    created_by,
    COUNT(*) as cnt,
    array_agg(id ORDER BY start_time) as ids
  FROM calendar_events
  WHERE start_time IS NOT NULL
  GROUP BY day_est, created_by
  HAVING COUNT(*) >= 4
  ORDER BY day_est DESC
  LIMIT 20
`);
console.log("Days with 4+ events for same owner (in EST):");
for (const r of overlap.rows) {
  console.log(`  ${r.day_est} | owner=${r.created_by} | count=${r.cnt} | event ids=${r.ids}`);
}

// For the top result, show details
if (overlap.rows.length > 0) {
  const top = overlap.rows[0];
  const ids = top.ids;
  const details = await db.execute(sql`
    SELECT id, title, start_time, end_time, status
    FROM calendar_events
    WHERE id = ANY(${ids}::int[])
    ORDER BY start_time
  `);
  console.log(`\nDetails for ${top.day_est} (owner ${top.created_by}):`);
  for (const r of details.rows) {
    const s = new Date(r.start_time).toLocaleString("en-US",{timeZone:"America/New_York", hour:"numeric", minute:"2-digit"});
    const e = r.end_time ? new Date(r.end_time).toLocaleString("en-US",{timeZone:"America/New_York", hour:"numeric", minute:"2-digit"}) : "(no end)";
    console.log(`  id=${r.id} | ${s} - ${e} | "${r.title}"`);
  }
}
process.exit(0);
