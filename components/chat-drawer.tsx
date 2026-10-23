"use client"
import { Component, useEffect, useRef, useState, type ReactNode } from "react"

function report(kind: string, detail: unknown) {
  const e = detail as { message?: string; stack?: string }
  fetch("/api/client-log", {
    method: "POST",
    body: JSON.stringify({ kind, message: e?.message ?? String(detail), stack: e?.stack?.slice(0, 1200) }),
  }).catch(() => {})
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (ev) => report("window.error", ev.error ?? ev.message))
  window.addEventListener("unhandledrejection", (ev) => report("unhandledrejection", ev.reason))
}

class ChatBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message }
  }
  componentDidCatch(e: Error) {
    report("render", e)
  }
  render() {
    if (this.state.error)
      return (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl bg-red-50 p-3 text-xs text-red-700 shadow-lg">
          Chat error: {this.state.error}{" "}
          <button className="underline" onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      )
    return this.props.children
  }
}
import { Bot, Code2, Loader2, Send, Sparkles, SquarePen, X } from "lucide-react"

type Msg = { role: "user" | "assistant"; text: string; status?: string; sql?: string; auth?: string; error?: string }

const SAMPLES = [
  "Which metros have the lowest CSAT and highest cancel/dispute rate?",
  "Who are the top 10 pros by GMV and how is their completion rate?",
  "What are customers complaining about, and where?",
]

export function ChatDrawer(props: { filters: Record<string, string>; render: (text: string) => ReactNode }) {
  return (
    <ChatBoundary>
      <ChatDrawerInner {...props} />
    </ChatBoundary>
  )
}

function ChatDrawerInner({ filters, render }: { filters: Record<string, string>; render: (text: string) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs])

  const active = Object.entries(filters).filter(([, v]) => v)

  async function ask(q: string) {
    if (!q.trim() || busy) return
    const history = [...msgs, { role: "user" as const, text: q }]
    setMsgs([...history, { role: "assistant", text: "", status: "Thinking..." }])
    setInput("")
    setBusy(true)
    const patch = (p: Partial<Msg> | ((m: Msg) => Partial<Msg>)) =>
      setMsgs((all) => {
        const copy = [...all]
        const last = copy[copy.length - 1]
        copy[copy.length - 1] = { ...last, ...(typeof p === "function" ? p(last) : p) }
        return copy
      })
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, text }) => ({ role, text })), filters }),
      })
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const l of lines) {
          if (!l) continue
          let t: string, v: string
          try {
            const p = JSON.parse(l)
            t = p.t
            v = typeof p.v === "string" ? p.v : JSON.stringify(p.v ?? "")
          } catch {
            continue
          }
          if (t === "text") patch((m) => ({ text: m.text + v, status: undefined }))
          else if (t === "status") patch({ status: v })
          else if (t === "sql") patch({ sql: v })
          else if (t === "auth") patch({ auth: v })
          else if (t === "error") patch({ error: v })
        }
      }
      patch({ status: undefined })
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : String(e), status: undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-[#f2553d] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(242,85,61,0.45)] hover:bg-[#e04429]"
      >
        <Sparkles className="h-4 w-4" /> Ask the data
      </button>
      {open && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform dark:bg-slate-900 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="bg-gradient-to-br from-[#0b2545] to-[#1d4e89] px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-[#ffb199]" />
              <div>
                <p className="font-bold">Book of Business agent</p>
                <p className="text-[11px] text-white/60">Cortex Agent · BOB_AGENT</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {msgs.length > 0 && (
                <button
                  onClick={() => {
                    if (!busy) setMsgs([])
                  }}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20 disabled:opacity-50"
                >
                  <SquarePen className="h-3.5 w-3.5" /> New chat
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close chat">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-white/70">
            {active.length ? `Using filters: ${active.map(([k, v]) => `${k}=${v}`).join(", ")}` : "No filters applied: asking about the whole book"}
          </p>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-slate-800 dark:text-slate-100">
          {msgs.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">Ask anything about requests, pros, CSAT or customer feedback.</p>
              {SAMPLES.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-[#f2553d] hover:bg-[#fff1ec] dark:border-slate-700 dark:hover:bg-white/5"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-[#0b2545] px-4 py-2 text-sm text-white dark:bg-[#1d4e89]">
                {m.text}
              </div>
            ) : (
              <div key={i} className="mr-4 space-y-2">
                {m.text && render(m.text)}
                {m.status && (
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> {m.status}
                  </p>
                )}
                {m.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{m.error}</p>}
                {m.sql && (
                  <details className="text-xs">
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-slate-500">
                      <Code2 className="h-3 w-3" /> SQL generated by Cortex Analyst
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-100 p-2 text-[11px] dark:bg-slate-800">{m.sql}</pre>
                  </details>
                )}
                {m.auth && !m.status && (
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    {m.auth === "caller" ? "Ran as you (caller's rights)" : "Ran as app service role"}
                  </p>
                )}
              </div>
            ),
          )}
          <div ref={end} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(input)
          }}
          className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#f2553d] dark:border-slate-700 dark:bg-slate-800"
          />
          <button disabled={busy} className="rounded-xl bg-[#f2553d] px-3 text-white disabled:opacity-50" aria-label="Send">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </aside>
    </>
  )
}
