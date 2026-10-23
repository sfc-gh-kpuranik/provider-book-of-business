import { querySnowflake } from "@/lib/snowflake"
import { REQUESTS_TABLE, buildWhere, errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

// Two heatmap grids: metro x category (all metrics) and category x month (volume).
export async function GET(req: Request) {
  try {
    const t0 = Date.now()
    const w = buildWhere(new URL(req.url).searchParams)
    const [grid, season] = await Promise.all([
      querySnowflake(
        `SELECT METRO, SERVICE_CATEGORY AS CATEGORY, COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV,
                ROUND(AVG(SATISFACTION_SCORE), 2) AS CSAT,
                ROUND(100 * AVG(IFF(STATUS = 'COMPLETED', 1, 0)), 1) AS COMPLETION_PCT
         FROM ${REQUESTS_TABLE} ${w.sql} GROUP BY 1, 2`,
        { binds: w.binds },
      ),
      querySnowflake(
        `SELECT SERVICE_CATEGORY AS CATEGORY, MONTH(REQUEST_DATE) AS M, COUNT(*) AS REQUESTS
         FROM ${REQUESTS_TABLE} ${w.sql} GROUP BY 1, 2`,
        { binds: w.binds },
      ),
    ])
    return Response.json({ grid, season, queryMs: Date.now() - t0 })
  } catch (e) {
    return errorResponse("[heatmap]", e)
  }
}
