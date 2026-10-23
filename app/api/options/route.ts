import { querySnowflake } from "@/lib/snowflake"
import { REQUESTS_TABLE, errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

// Filter dropdown values (owner's rights).
export async function GET() {
  try {
    const rows = await querySnowflake(`
      SELECT 'metro' AS K, METRO AS V FROM ${REQUESTS_TABLE} GROUP BY METRO
      UNION ALL SELECT 'category', SERVICE_CATEGORY FROM ${REQUESTS_TABLE} GROUP BY SERVICE_CATEGORY
      UNION ALL SELECT 'status', STATUS FROM ${REQUESTS_TABLE} GROUP BY STATUS
      ORDER BY 1, 2`)
    const out: Record<string, string[]> = { metro: [], category: [], status: [] }
    for (const r of rows) if (r.V) out[r.K].push(r.V)
    return Response.json(out)
  } catch (e) {
    return errorResponse("[options]", e)
  }
}
