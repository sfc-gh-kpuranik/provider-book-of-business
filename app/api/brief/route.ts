import { querySnowflake } from "@/lib/snowflake"
import { REQUESTS_TABLE, buildWhere, errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

const MODEL = "claude-sonnet-4-5"

// Cortex AI executive brief over the currently filtered slice. Facts are computed in SQL,
// then passed to the model as a bound JSON string, so the model only narrates real numbers.
export async function GET(req: Request) {
  try {
    const t0 = Date.now()
    const params = new URL(req.url).searchParams
    const w = buildWhere(params)
    const facts = await querySnowflake(
      `WITH base AS (SELECT * FROM ${REQUESTS_TABLE} ${w.sql}),
       totals AS (SELECT COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV, ROUND(AVG(SATISFACTION_SCORE), 2) AS CSAT,
                         ROUND(100 * AVG(IFF(STATUS = 'COMPLETED', 1, 0)), 1) AS COMPLETION_PCT,
                         ROUND(100 * AVG(IFF(STATUS IN ('CANCELLED', 'DISPUTED'), 1, 0)), 1) AS CANCEL_DISPUTE_PCT FROM base),
       metro AS (SELECT METRO, ROUND(SUM(JOB_COST)) AS GMV, ROUND(AVG(SATISFACTION_SCORE), 2) AS CSAT FROM base GROUP BY 1),
       cat AS (SELECT SERVICE_CATEGORY, ROUND(SUM(JOB_COST)) AS GMV, ROUND(AVG(SATISFACTION_SCORE), 2) AS CSAT FROM base GROUP BY 1),
       yr AS (SELECT YEAR(REQUEST_DATE) AS Y, COUNT(*) AS REQUESTS, ROUND(SUM(JOB_COST)) AS GMV FROM base GROUP BY 1)
       SELECT OBJECT_CONSTRUCT(
         'filters', PARSE_JSON(?),
         'totals', (SELECT OBJECT_CONSTRUCT(*) FROM totals),
         'top_metros_by_gmv', (SELECT ARRAY_AGG(OBJECT_CONSTRUCT(*)) WITHIN GROUP (ORDER BY GMV DESC) FROM (SELECT * FROM metro ORDER BY GMV DESC LIMIT 5)),
         'lowest_csat_metros', (SELECT ARRAY_AGG(OBJECT_CONSTRUCT(*)) WITHIN GROUP (ORDER BY CSAT) FROM (SELECT * FROM metro ORDER BY CSAT LIMIT 3)),
         'categories', (SELECT ARRAY_AGG(OBJECT_CONSTRUCT(*)) WITHIN GROUP (ORDER BY GMV DESC) FROM cat),
         'by_year', (SELECT ARRAY_AGG(OBJECT_CONSTRUCT(*)) WITHIN GROUP (ORDER BY Y) FROM yr)
       )::STRING AS FACTS`,
      { binds: [...w.binds, JSON.stringify(Object.fromEntries(params))] },
    )
    const factsJson = facts[0]?.FACTS ?? "{}"
    const prompt =
      "You are a chief of staff at a home services marketplace. Using ONLY the JSON facts below, " +
      "write a crisp executive brief in markdown: a one-line headline, 3 bullet 'What stands out' insights with numbers, " +
      "and 2 bullet 'Recommended actions'. The first and last years in by_year may be partial years, so never compute " +
      "growth rates from them. Do not project or extrapolate. No preamble. Under 160 words. Facts:\n"
    const out = await querySnowflake(`SELECT SNOWFLAKE.CORTEX.COMPLETE(?, ? || ?) AS BRIEF`, {
      binds: [MODEL, prompt, factsJson],
    })
    return Response.json({ brief: out[0]?.BRIEF ?? "", model: MODEL, queryMs: Date.now() - t0 })
  } catch (e) {
    return errorResponse("[brief]", e)
  }
}
