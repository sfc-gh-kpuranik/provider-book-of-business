import { querySnowflake } from "@/lib/snowflake"
import { REQUESTS_TABLE, buildWhere, errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

const MAX_ROWS = 250_000
const COLS = ["REQUEST_ID", "REQUEST_DATE", "METRO", "ZIP", "SERVICE_CATEGORY", "PROVIDER_ID", "STATUS", "JOB_COST", "SATISFACTION_SCORE"]

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ""
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Full filtered result set (up to 250K rows) on demand as CSV (owner's rights).
export async function GET(req: Request) {
  try {
    const t0 = Date.now()
    const w = buildWhere(new URL(req.url).searchParams)
    const rows = await querySnowflake(
      `SELECT ${COLS.join(", ")} FROM ${REQUESTS_TABLE} ${w.sql} ORDER BY REQUEST_DATE DESC LIMIT ${MAX_ROWS}`,
      { binds: w.binds },
    )
    const body = [COLS.join(","), ...rows.map((r) => COLS.map((c) => csvCell(r[c])).join(","))].join("\n")
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="service_requests_${rows.length}.csv"`,
        "X-Row-Count": String(rows.length),
        "X-Query-Ms": String(Date.now() - t0),
      },
    })
  } catch (e) {
    return errorResponse("[export]", e)
  }
}
