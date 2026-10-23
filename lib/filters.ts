// Shared filter parsing. Every user value goes into a bind (?) placeholder, never into SQL text.

export const REQUESTS_TABLE = "DEMO_DB.APPS.SERVICE_REQUESTS_LARGE"
// Demo copy of ANALYTICS.DIM_PROVIDER with gap-filled metro/category coverage (see PROGRESS.md).
export const PROVIDERS_TABLE = "DEMO_DB.APPS.DIM_PROVIDER_DEMO"
export const NOTES_TABLE = "DEMO_DB.APPS.PROVIDER_NOTES"
export const ZIP_TABLE = "DEMO_DB.APPS.DIM_ZIP"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface Where {
  sql: string
  binds: (string | number)[]
}

/** Builds a WHERE clause from ?metro=&category=&status=&from=&to= (column prefix optional). */
export function buildWhere(params: URLSearchParams, prefix = ""): Where {
  const clauses: string[] = []
  const binds: (string | number)[] = []
  const p = prefix ? `${prefix}.` : ""

  for (const [param, col] of [
    ["metro", "METRO"],
    ["category", "SERVICE_CATEGORY"],
    ["status", "STATUS"],
    ["zip", "ZIP"],
  ] as const) {
    const v = params.get(param)
    if (v) {
      clauses.push(`${p}${col} = ?`)
      binds.push(v)
    }
  }
  const from = params.get("from")
  if (from && DATE_RE.test(from)) {
    clauses.push(`${p}REQUEST_DATE >= ?`)
    binds.push(from)
  }
  const to = params.get("to")
  if (to && DATE_RE.test(to)) {
    clauses.push(`${p}REQUEST_DATE <= ?`)
    binds.push(to)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", binds }
}

export function intParam(params: URLSearchParams, name: string, def: number, min: number, max: number): number {
  const n = Number.parseInt(params.get(name) ?? "", 10)
  if (Number.isNaN(n)) return def
  return Math.min(max, Math.max(min, n))
}

export function errorResponse(tag: string, e: unknown) {
  console.error(new Date().toISOString(), tag, e)
  return Response.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 500 })
}
