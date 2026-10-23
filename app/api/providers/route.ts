import { querySnowflake } from "@/lib/snowflake"
import { PROVIDERS_TABLE, NOTES_TABLE, REQUESTS_TABLE, errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

// Book of business: providers in a metro with live volume and latest note status.
export async function GET(req: Request) {
  try {
    const metro = new URL(req.url).searchParams.get("metro")
    const rows = await querySnowflake(
      `WITH vol AS (
         SELECT PROVIDER_ID, COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV, ROUND(AVG(SATISFACTION_SCORE), 2) AS CSAT
         FROM ${REQUESTS_TABLE} GROUP BY PROVIDER_ID
       ), last_note AS (
         SELECT PROVIDER_ID, STATUS AS NOTE_STATUS, CREATED_AT AS NOTE_AT
         FROM ${NOTES_TABLE} QUALIFY ROW_NUMBER() OVER (PARTITION BY PROVIDER_ID ORDER BY CREATED_AT DESC) = 1
       )
       SELECT p.PROVIDER_ID, p.BUSINESS_NAME, p.SERVICE_CATEGORY, p.CITY, p.STATE, p.METRO, p.AVG_RATING, p.TENURE_BAND, p.IS_VERIFIED,
              v.REQUESTS, v.GMV, v.CSAT, n.NOTE_STATUS, n.NOTE_AT
       FROM ${PROVIDERS_TABLE} p
       LEFT JOIN vol v USING (PROVIDER_ID)
       LEFT JOIN last_note n USING (PROVIDER_ID)
       ${metro ? "WHERE p.METRO = ?" : ""}
       ORDER BY v.GMV DESC NULLS LAST LIMIT 500`,
      { binds: metro ? [metro] : undefined },
    )
    return Response.json(rows)
  } catch (e) {
    return errorResponse("[providers]", e)
  }
}
