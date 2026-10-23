import { querySnowflake } from "@/lib/snowflake"
import { errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

// Shows the service identity vs the viewer identity side by side (per-viewer proof).
export async function GET() {
  try {
    const sql = "SELECT CURRENT_USER() AS USER_NAME, CURRENT_ROLE() AS ROLE_NAME"
    const [owner, caller] = await Promise.all([
      querySnowflake(sql),
      querySnowflake(sql, { callersRights: true }),
    ])
    return Response.json({ owner: owner[0], caller: caller[0] })
  } catch (e) {
    return errorResponse("[whoami]", e)
  }
}
