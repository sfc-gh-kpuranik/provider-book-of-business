import { querySnowflake } from "@/lib/snowflake"
import { NOTES_TABLE, errorResponse } from "@/lib/filters"

export const dynamic = "force-dynamic"

const STATUSES = new Set(["ON_TRACK", "AT_RISK", "FOLLOW_UP", "CHURN_RISK"])
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

// Notes run with caller's rights: the viewer's own role must be able to read/insert,
// and CREATED_BY is the real Snowflake user, not the service.
export async function GET(req: Request) {
  try {
    const providerId = new URL(req.url).searchParams.get("providerId") ?? ""
    if (!ID_RE.test(providerId)) return Response.json({ error: "Invalid providerId" }, { status: 400 })
    const rows = await querySnowflake(
      `SELECT NOTE_ID, STATUS, NOTE, CREATED_BY, CREATED_AT FROM ${NOTES_TABLE}
       WHERE PROVIDER_ID = ? ORDER BY CREATED_AT DESC LIMIT 200`,
      { callersRights: true, binds: [providerId] },
    )
    return Response.json(rows)
  } catch (e) {
    return errorResponse("[notes GET]", e)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const providerId = String(body.providerId ?? "")
    const status = String(body.status ?? "")
    const note = String(body.note ?? "").trim()
    if (!ID_RE.test(providerId)) return Response.json({ error: "Invalid providerId" }, { status: 400 })
    if (!STATUSES.has(status)) return Response.json({ error: "Invalid status" }, { status: 400 })
    if (!note || note.length > 4000) return Response.json({ error: "Note must be 1-4000 characters" }, { status: 400 })

    await querySnowflake(
      `INSERT INTO ${NOTES_TABLE} (PROVIDER_ID, STATUS, NOTE, CREATED_BY) SELECT ?, ?, ?, CURRENT_USER()`,
      { callersRights: true, binds: [providerId, status, note] },
    )
    return Response.json({ ok: true })
  } catch (e) {
    return errorResponse("[notes POST]", e)
  }
}
