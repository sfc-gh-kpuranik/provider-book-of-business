import { headers } from "next/headers"
import { getRestApiAuthHeader, getServiceToken, getSnowflakeBaseUrl } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

const AGENT_PATH = "/api/v2/databases/SNOWFLAKE_INTELLIGENCE/schemas/AGENTS/agents/BOB_AGENT:run"
const FILTER_KEYS = ["metro", "category", "status", "zip", "from", "to"] as const

type Msg = { role: "user" | "assistant"; text: string }

function contextBlock(filters: Record<string, string> = {}) {
  const parts = FILTER_KEYS.filter((k) => filters[k]).map((k) => `${k}=${String(filters[k]).slice(0, 80)}`)
  return parts.length ? `[Context] Book of Business app filters: ${parts.join(", ")}\n\n` : ""
}

async function callAgent(auth: string, body: string) {
  return fetch(`${getSnowflakeBaseUrl()}${AGENT_PATH}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "X-Snowflake-Authorization-Token-Type": "OAUTH",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body,
  })
}

export async function POST(req: Request) {
  const { messages = [], filters = {} } = (await req.json()) as { messages: Msg[]; filters: Record<string, string> }
  const history = messages.slice(-10)
  const lastUser = history.length - 1
  const body = JSON.stringify({
    messages: history.map((m, i) => ({
      role: m.role,
      content: [{ type: "text", text: (i === lastUser ? contextBlock(filters) : "") + m.text }],
    })),
  })

  // Prefer the signed-in user's identity (caller's rights); fall back to the app service role.
  const serviceToken = getServiceToken()
  const callerToken = (await headers()).get("sf-context-current-user-token")
  let mode = "service"
  let res: Response | null = null
  if (serviceToken && callerToken) {
    res = await callAgent(`Bearer ${serviceToken}.${callerToken}`, body)
    mode = "caller"
    if (!res.ok) {
      console.log(`[chat] caller token rejected (${res.status}): ${(await res.text()).slice(0, 300)}`)
      res = null
    }
  }
  if (!res) {
    mode = "service"
    res = await callAgent(getRestApiAuthHeader(), body)
  }
  console.log(`[chat] agent call mode=${mode} status=${res.status}`)
  if (!res.ok || !res.body) {
    const detail = (await res.text()).slice(0, 500)
    return Response.json({ error: `Agent call failed (${res.status}): ${detail}` }, { status: 502 })
  }

  const upstream = res.body.getReader()
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (t: string, v: unknown) =>
        controller.enqueue(enc.encode(JSON.stringify({ t, v: typeof v === "string" ? v : JSON.stringify(v ?? "") }) + "\n"))
      send("auth", mode)
      let buf = ""
      let event = ""
      try {
        while (true) {
          const { done, value } = await upstream.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let nl
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trimEnd()
            buf = buf.slice(nl + 1)
            if (line.startsWith("event:")) event = line.slice(6).trim()
            else if (line.startsWith("data:")) {
              let d: any
              try { d = JSON.parse(line.slice(5)) } catch { continue }
              if (event === "response.text.delta") send("text", d.text ?? "")
              else if (event === "response.status") send("status", d.message ?? d.status ?? "")
              else if (event === "response.tool_result") {
                const sql = (d.content ?? []).map((c: any) => c?.json?.sql).find(Boolean)
                if (sql) send("sql", sql)
              } else if (event === "error") send("error", d.message ?? JSON.stringify(d))
            }
          }
        }
      } catch (e) {
        send("error", e instanceof Error ? e.message : String(e))
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } })
}
