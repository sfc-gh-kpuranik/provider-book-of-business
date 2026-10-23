import { querySnowflake } from "@/lib/snowflake"
import { REQUESTS_TABLE, PROVIDERS_TABLE, buildWhere, intParam, errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

const COLS = `r.REQUEST_ID, r.REQUEST_DATE, r.METRO, r.ZIP, r.SERVICE_CATEGORY, r.PROVIDER_ID, p.BUSINESS_NAME,
  p.CITY, p.STATE, r.STATUS, r.JOB_COST, r.SATISFACTION_SCORE`
const SORTABLE = new Set(["REQUEST_DATE", "JOB_COST", "SATISFACTION_SCORE", "METRO"])

// Server-side paged detail over the full filtered set, plus total count (owner's rights).
export async function GET(req: Request) {
  try {
    const t0 = Date.now()
    const params = new URL(req.url).searchParams
    const w = buildWhere(params, "r")
    const page = intParam(params, "page", 0, 0, 100_000)
    const pageSize = intParam(params, "pageSize", 100, 10, 1000)
    const sort = SORTABLE.has(params.get("sort") ?? "") ? params.get("sort") : "REQUEST_DATE"
    const dir = params.get("dir") === "asc" ? "ASC" : "DESC"

    const [rows, count] = await Promise.all([
      querySnowflake(
        `SELECT ${COLS} FROM ${REQUESTS_TABLE} r LEFT JOIN ${PROVIDERS_TABLE} p ON p.PROVIDER_ID = r.PROVIDER_ID
         ${w.sql} ORDER BY r.${sort} ${dir}, r.REQUEST_ID LIMIT ${pageSize} OFFSET ${page * pageSize}`,
        { binds: w.binds },
      ),
      querySnowflake(`SELECT COUNT(*) AS N FROM ${REQUESTS_TABLE} r ${w.sql}`, { binds: w.binds }),
    ])
    return Response.json({ rows, total: count[0]?.N ?? 0, page, pageSize, queryMs: Date.now() - t0 })
  } catch (e) {
    return errorResponse("[requests]", e)
  }
}
