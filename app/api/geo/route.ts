import { querySnowflake } from "@/lib/snowflake"
import { REQUESTS_TABLE, ZIP_TABLE, buildWhere, errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

// Metro bubbles for the national map; ZIP-level detail when ?metro= is set (owner's rights).
export async function GET(req: Request) {
  try {
    const t0 = Date.now()
    const params = new URL(req.url).searchParams
    const metro = params.get("metro")
    const national = new URLSearchParams(params)
    national.delete("metro")
    const wn = buildWhere(national, "r")

    const metrosP = querySnowflake(
      `SELECT r.METRO, r.STATE, z.METRO_LAT AS LAT, z.METRO_LON AS LON, COUNT(*) AS REQUESTS,
              ROUND(SUM(r.JOB_COST)) AS GMV, ROUND(AVG(r.SATISFACTION_SCORE), 2) AS CSAT,
              ROUND(100 * AVG(IFF(r.STATUS = 'COMPLETED', 1, 0)), 1) AS COMPLETION_PCT
       FROM ${REQUESTS_TABLE} r JOIN ${ZIP_TABLE} z ON z.ZIP = r.ZIP
       ${wn.sql} GROUP BY 1, 2, 3, 4 ORDER BY GMV DESC`,
      { binds: wn.binds },
    )

    let zips: Record<string, any>[] = []
    if (metro) {
      const wz = buildWhere(params, "r")
      zips = await querySnowflake(
        `SELECT r.ZIP, z.LAT, z.LON, COUNT(*) AS REQUESTS, ROUND(SUM(r.JOB_COST)) AS GMV,
                ROUND(AVG(r.SATISFACTION_SCORE), 2) AS CSAT,
                ROUND(100 * AVG(IFF(r.STATUS = 'COMPLETED', 1, 0)), 1) AS COMPLETION_PCT,
                MODE(r.SERVICE_CATEGORY) AS TOP_CATEGORY, COUNT(DISTINCT r.PROVIDER_ID) AS PROVIDERS
         FROM ${REQUESTS_TABLE} r JOIN ${ZIP_TABLE} z ON z.ZIP = r.ZIP
         ${wz.sql} GROUP BY 1, 2, 3 ORDER BY GMV DESC`,
        { binds: wz.binds },
      )
    }
    return Response.json({ metros: await metrosP, zips, queryMs: Date.now() - t0 })
  } catch (e) {
    return errorResponse("[geo]", e)
  }
}
