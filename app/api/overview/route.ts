import { querySnowflake } from "@/lib/snowflake"
import { PROVIDERS_TABLE, REQUESTS_TABLE, buildWhere, errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

// Live KPIs + breakdowns, re-queried on every filter change (owner's rights).
export async function GET(req: Request) {
  try {
    const t0 = Date.now()
    const params = new URL(req.url).searchParams
    const w = buildWhere(params)
    const wr = buildWhere(params, "r")
    const q = (sql: string) => querySnowflake(sql, { binds: w.binds })
    const [kpis, byMetro, byMonth, byStatus, byChannel, csatDist, byYear, topProviders] = await Promise.all([
      q(`SELECT COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV, ROUND(AVG(SATISFACTION_SCORE), 2) AS CSAT,
                ROUND(100 * AVG(IFF(STATUS = 'COMPLETED', 1, 0)), 1) AS COMPLETION_PCT,
                ROUND(AVG(JOB_COST)) AS AVG_JOB_COST,
                COUNT(DISTINCT PROVIDER_ID) AS ACTIVE_PROVIDERS,
                COUNT(DISTINCT CUSTOMER_ID) AS CUSTOMERS,
                ROUND(100 * AVG(IFF(STATUS IN ('CANCELLED', 'DISPUTED'), 1, 0)), 1) AS CANCEL_DISPUTE_PCT,
                ROUND(100 * AVG(IFF(SATISFACTION_SCORE >= 4, 1, 0)), 1) AS PROMOTER_PCT
         FROM ${REQUESTS_TABLE} ${w.sql}`),
      q(`SELECT METRO, COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV
         FROM ${REQUESTS_TABLE} ${w.sql} GROUP BY METRO ORDER BY GMV DESC`),
      q(`SELECT TO_CHAR(DATE_TRUNC('month', REQUEST_DATE), 'YYYY-MM') AS MONTH, COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV
         FROM ${REQUESTS_TABLE} ${w.sql} GROUP BY 1 ORDER BY 1`),
      q(`SELECT STATUS, COUNT(*) AS REQUESTS FROM ${REQUESTS_TABLE} ${w.sql} GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT COALESCE(ACQUISITION_CHANNEL, 'Unknown') AS CHANNEL, COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV,
                ROUND(AVG(SATISFACTION_SCORE), 2) AS CSAT
         FROM ${REQUESTS_TABLE} ${w.sql} GROUP BY 1 ORDER BY GMV DESC`),
      q(`SELECT ROUND(SATISFACTION_SCORE)::INT AS SCORE, COUNT(*) AS REQUESTS
         FROM ${REQUESTS_TABLE} ${w.sql ? `${w.sql} AND` : "WHERE"} SATISFACTION_SCORE IS NOT NULL GROUP BY 1 ORDER BY 1`),
      q(`SELECT YEAR(REQUEST_DATE) AS YR, COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV, ROUND(AVG(SATISFACTION_SCORE), 2) AS CSAT
         FROM ${REQUESTS_TABLE} ${w.sql} GROUP BY 1 ORDER BY 1`),
      querySnowflake(
        `SELECT r.PROVIDER_ID, p.BUSINESS_NAME, p.CITY, p.STATE, p.IS_VERIFIED, COUNT(*) AS REQUESTS,
                ROUND(SUM(r.JOB_COST)) AS GMV, ROUND(AVG(r.SATISFACTION_SCORE), 2) AS CSAT,
                ROUND(100 * AVG(IFF(r.STATUS = 'COMPLETED', 1, 0)), 1) AS COMPLETION_PCT
         FROM ${REQUESTS_TABLE} r JOIN ${PROVIDERS_TABLE} p ON p.PROVIDER_ID = r.PROVIDER_ID ${wr.sql}
         GROUP BY 1, 2, 3, 4, 5 ORDER BY GMV DESC LIMIT 10`,
        { binds: wr.binds },
      ),
    ])
    return Response.json({ kpis: kpis[0], byMetro, byMonth, byStatus, byChannel, csatDist, byYear, topProviders, queryMs: Date.now() - t0 })
  } catch (e) {
    return errorResponse("[overview]", e)
  }
}
