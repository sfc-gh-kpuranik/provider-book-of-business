"use client"

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import {
  Download,
  ExternalLink,
  Grid3x3,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Table2,
  X,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UsMap } from "@/components/us-map"
import { Heatmap } from "@/components/heatmap"
import { ChatDrawer } from "@/components/chat-drawer"
import { providerLinks, zipMapLink } from "@/lib/links"

type Filters = { metro: string; category: string; status: string; zip: string; from: string; to: string }
type Row = Record<string, any>

const EMPTY: Filters = { metro: "", category: "", status: "", zip: "", from: "", to: "" }
const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "map", label: "Market Map", icon: MapPin },
  { id: "heatmap", label: "Heatmaps", icon: Grid3x3 },
  { id: "detail", label: "Request Detail", icon: Table2 },
  { id: "notes", label: "Provider Notes", icon: MessageSquare },
] as const
type TabId = (typeof TABS)[number]["id"]

const NOTE_STATUSES = ["ON_TRACK", "AT_RISK", "FOLLOW_UP", "CHURN_RISK"]
const PALETTE = ["#f2553d", "#0b2545", "#ff8a65", "#13315c", "#ffb199", "#1d4e89", "#e2725b", "#8da9c4", "#c0392b", "#5c7fa3"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const fmtInt = (n: unknown) => (n == null ? "—" : Number(n).toLocaleString())
const fmtUsd = (n: unknown) => (n == null ? "—" : `$${Number(n).toLocaleString()}`)
const fmtCompact = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`
const fmtDate = (d: unknown) => (d ? String(d).slice(0, 10) : "—")

function toQuery(f: Filters, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== "" && v != null) p.set(k, String(v))
  return p.toString()
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const body = await r.json()
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
  return body as T
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <Alert variant="destructive">
      <AlertTitle>Query failed</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}

function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={`border-0 shadow-[0_1px_3px_rgba(11,37,69,0.08),0_8px_24px_rgba(11,37,69,0.06)] ${className}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base text-[#0b2545] dark:text-slate-100">{title}</CardTitle>
          {subtitle && <CardDescription className="mt-1">{subtitle}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
      {label}
      <select
        className="h-9 min-w-36 rounded-lg border-0 bg-white/95 px-2 text-sm font-medium normal-case tracking-normal text-[#0b2545] dark:bg-slate-800 dark:text-slate-100 shadow-sm outline-none focus:ring-2 focus:ring-[#f2553d]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function ProviderLinks({ name, city, state }: { name: string; city?: string; state?: string }) {
  if (!name) return null
  return (
    <div className="flex flex-wrap gap-1">
      {providerLinks(name, city, state).map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 rounded-full bg-[#fff1ec] px-2 py-0.5 text-[10px] font-semibold text-[#c2410c] hover:bg-[#f2553d] hover:text-white"
        >
          {l.label}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ))}
    </div>
  )
}

/** Minimal markdown (headings, bullets, **bold**) rendered as React nodes, no raw HTML. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    )
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`} className="ml-4 list-disc space-y-1">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (/^[-*•]\s+/.test(line)) {
      list.push(line.replace(/^[-*•]\s+/, ""))
      continue
    }
    flush()
    if (!line) continue
    const h = line.match(/^#{1,4}\s+(.*)$/)
    blocks.push(
      h ? (
        <p key={blocks.length} className="mt-2 font-bold text-[#0b2545] dark:text-slate-100">
          {inline(h[1])}
        </p>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    )
  }
  flush()
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>
}

export function BookOfBusiness() {
  const [tab, setTab] = useState<TabId>("overview")
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [options, setOptions] = useState<Record<string, string[]>>({ metro: [], category: [], status: [] })
  const [who, setWho] = useState<{ owner: Row; caller: Row } | null>(null)

  useEffect(() => {
    getJson<Record<string, string[]>>("/api/options").then(setOptions).catch(() => {})
    getJson<{ owner: Row; caller: Row }>("/api/whoami").then(setWho).catch(() => {})
  }, [])

  // Deep links: ?metro=Denver&category=Plumbing&tab=map preloads the view; the URL tracks the current view.
  const [urlReady, setUrlReady] = useState(false)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const next = { ...EMPTY }
    ;(Object.keys(EMPTY) as (keyof Filters)[]).forEach((k) => {
      const v = p.get(k)
      if (v) next[k] = v.slice(0, 100)
    })
    setFilters(next)
    const t = p.get("tab")
    if (t && TABS.some((x) => x.id === t)) setTab(t as TabId)
    setUrlReady(true)
  }, [])
  useEffect(() => {
    if (!urlReady) return
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v))
    if (tab !== "overview") p.set("tab", tab)
    const qs = p.toString()
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
  }, [filters, tab, urlReady])

  const set = (k: keyof Filters) => (v: string) =>
    setFilters((f) => ({ ...f, [k]: v, ...(k === "metro" && v !== f.metro ? { zip: "" } : {}) }))
  const active = Object.entries(filters).filter(([, v]) => v)

  return (
    <div className="flex flex-col gap-5">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2545] via-[#13315c] to-[#1d4e89] px-6 py-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#f2553d]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-[#ff8a65]/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ffb199]">Live on Snowflake</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Provider Book of Business</h1>
            <p className="mt-1 max-w-xl text-sm text-white/75">
              250K service requests, queried live as you filter. Map, heatmaps, drill-down, deep links and notes, all governed in Snowflake.
            </p>
          </div>
          {who && (
            <div className="flex flex-col items-end gap-1 text-[11px]">
              <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">
                Signed in as <b>{who.caller?.USER_NAME}</b> · {who.caller?.ROLE_NAME}
              </span>
              <span className="text-white/50">App service role: {who.owner?.ROLE_NAME}</span>
            </div>
          )}
        </div>
        <div className="relative mt-5 flex flex-wrap items-end gap-3">
          <Select label="Metro" value={filters.metro} options={options.metro} onChange={set("metro")} />
          <Select label="Category" value={filters.category} options={options.category} onChange={set("category")} />
          <Select label="Status" value={filters.status} options={options.status} onChange={set("status")} />
          {(["from", "to"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              {k}
              <input
                type="date"
                className="h-9 rounded-lg border-0 bg-white/95 px-2 text-sm text-[#0b2545] dark:bg-slate-800 dark:text-slate-100 dark:[color-scheme:dark] shadow-sm outline-none focus:ring-2 focus:ring-[#f2553d]"
                value={filters[k]}
                onChange={(e) => set(k)(e.target.value)}
              />
            </label>
          ))}
          {filters.zip && (
            <span className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#f2553d] px-3 text-sm font-semibold">
              ZIP {filters.zip}
              <button onClick={() => set("zip")("")} aria-label="Clear ZIP">
                <X className="h-4 w-4" />
              </button>
            </span>
          )}
          <button
            onClick={() => setFilters(EMPTY)}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-white/10 px-3 text-sm font-medium hover:bg-white/20"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
          {active.length > 0 && <span className="text-xs text-white/60">{active.length} filter(s) active</span>}
        </div>
      </section>

      <nav className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === id
                ? "bg-[#f2553d] text-white shadow-[0_6px_16px_rgba(242,85,61,0.35)]"
                : "bg-white text-[#0b2545] shadow-sm hover:bg-[#fff1ec] dark:bg-card dark:text-slate-100 dark:hover:bg-white/10"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview filters={filters} />}
      {tab === "map" && (
        <MarketMap
          filters={filters}
          onMetro={set("metro")}
          onZipDrill={(zip) => {
            setFilters((f) => ({ ...f, zip }))
            setTab("detail")
          }}
        />
      )}
      {tab === "heatmap" && (
        <Heatmaps
          filters={filters}
          onDrill={(metro, category) => {
            setFilters((f) => ({ ...f, metro, category, zip: "" }))
            setTab("detail")
          }}
        />
      )}
      {tab === "detail" && <RequestDetail filters={filters} />}
      {tab === "notes" && <ProviderNotes metro={filters.metro} />}
      <ChatDrawer filters={filters} render={(t) => <Markdown text={t} />} />
    </div>
  )
}

function Overview({ filters }: { filters: Filters }) {
  const [data, setData] = useState<{
    kpis: Row
    byMetro: Row[]
    byMonth: Row[]
    byStatus: Row[]
    byChannel: Row[]
    csatDist: Row[]
    byYear: Row[]
    topProviders: Row[]
    queryMs: number
  } | null>(null)
  const [cats, setCats] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [brief, setBrief] = useState<{ text: string; ms: number; model: string } | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const q = toQuery(filters)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setBrief(null)
    Promise.all([getJson<typeof data>(`/api/overview?${q}`), getJson<{ grid: Row[] }>(`/api/heatmap?${q}`)])
      .then(([o, h]) => {
        setData(o)
        const byCat = new Map<string, number>()
        for (const c of h.grid) byCat.set(c.CATEGORY, (byCat.get(c.CATEGORY) ?? 0) + Number(c.GMV))
        setCats([...byCat].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [q])

  async function runBrief() {
    setBriefLoading(true)
    try {
      const b = await getJson<{ brief: string; queryMs: number; model: string }>(`/api/brief?${q}`)
      setBrief({ text: b.brief, ms: b.queryMs, model: b.model })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Brief failed")
    } finally {
      setBriefLoading(false)
    }
  }

  const k = data?.kpis ?? {}
  const kpis: [string, string, string, string][] = [
    ["Service requests", fmtInt(k.REQUESTS), "var(--kpi-navy)", "in current slice"],
    ["Gross merchandise value", k.GMV != null ? fmtCompact(Number(k.GMV)) : "—", "#f2553d", fmtUsd(k.GMV)],
    ["Avg satisfaction", k.CSAT != null ? `${k.CSAT} / 5` : "—", "#0d9488", "customer CSAT"],
    ["Completion rate", k.COMPLETION_PCT != null ? `${k.COMPLETION_PCT}%` : "—", "#7c3aed", "jobs completed"],
    ["Avg job value", fmtUsd(k.AVG_JOB_COST), "var(--kpi-blue)", "GMV per request"],
    ["Active pros", fmtInt(k.ACTIVE_PROVIDERS), "#e2725b", `${fmtInt(k.CUSTOMERS)} homeowners served`],
    ["Cancel / dispute", k.CANCEL_DISPUTE_PCT != null ? `${k.CANCEL_DISPUTE_PCT}%` : "—", "#c0392b", "fulfillment leakage"],
    ["Happy customers", k.PROMOTER_PCT != null ? `${k.PROMOTER_PCT}%` : "—", "#0d9488", "rated 4 or 5 stars"],
  ]
  const years = data?.byYear ?? []
  const statusTotal = (data?.byStatus ?? []).reduce((s, r) => s + Number(r.REQUESTS), 0)
  const csatTotal = (data?.csatDist ?? []).reduce((s, r) => s + Number(r.REQUESTS), 0)
  const statusBar: Record<string, string> = {
    COMPLETED: "#0d9488",
    SCHEDULED: "#1d4e89",
    IN_PROGRESS: "#7c3aed",
    PENDING: "#f59e0b",
    CANCELLED: "#94a3b8",
    DISPUTED: "#c0392b",
  }

  return (
    <div className="flex flex-col gap-5">
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(([label, value, color, sub]) => (
          <div key={label} className="relative overflow-hidden rounded-2xl bg-white p-5 dark:bg-card shadow-[0_1px_3px_rgba(11,37,69,0.08),0_8px_24px_rgba(11,37,69,0.06)]">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-10" style={{ background: color }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-extrabold tabular-nums xl:text-3xl" style={{ color }}>
              {loading ? "…" : value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[#ffd5c8] bg-gradient-to-r from-[#fff6f2] to-white p-5 dark:border-[#f2553d]/30 dark:from-[#2a1d22] dark:to-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2553d] text-white shadow">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-[#0b2545] dark:text-slate-100">AI executive brief</p>
              <p className="text-xs text-muted-foreground">Snowflake Cortex reads this exact filtered slice and writes the story. Data never leaves Snowflake.</p>
            </div>
          </div>
          <Button onClick={runBrief} disabled={briefLoading} className="bg-[#0b2545] text-white hover:bg-[#13315c]">
            <Sparkles className="mr-1 h-4 w-4" />
            {briefLoading ? "Thinking…" : brief ? "Regenerate" : "Generate brief"}
          </Button>
        </div>
        {brief && (
          <div className="mt-4 rounded-xl bg-white p-4 text-slate-800 shadow-inner dark:bg-slate-900/70 dark:text-slate-200">
            <Markdown text={brief.text} />
            <p className="mt-3 text-[11px] text-muted-foreground">
              {brief.model} via SNOWFLAKE.CORTEX.COMPLETE · {(brief.ms / 1000).toFixed(1)}s
            </p>
          </div>
        )}
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">Live query {data ? `${data.queryMs} ms` : "…"} · re-runs on every filter change, no snapshot</p>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Panel title="Demand trend" subtitle="Monthly requests and GMV" className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.byMonth ?? []}>
                <defs>
                  <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f2553d" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#f2553d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" />
                <XAxis dataKey="MONTH" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v, n) => (n === "GMV" ? fmtUsd(v) : fmtInt(v))} />
                <Area type="monotone" dataKey="GMV" stroke="#f2553d" strokeWidth={2.5} fill="url(#gmvFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Category mix" subtitle="Share of GMV">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={cats} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={2}>
                  {cats.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtUsd(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {cats.slice(0, 6).map((c, i) => (
              <span key={c.name} className="flex items-center gap-1 truncate">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i] }} />
                {c.name}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="GMV by metro" subtitle="Ranked, live">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.byMetro ?? []} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" />
              <XAxis dataKey="METRO" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 11 }} width={60} />
              <Tooltip formatter={(v) => fmtUsd(v)} />
              <Bar dataKey="GMV" radius={[6, 6, 0, 0]}>
                {(data?.byMetro ?? []).map((_, i) => (
                  <Cell key={i} fill={i < 3 ? "#f2553d" : "#13315c"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Year over year" subtitle="First and last years may be partial in the demo data">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {years.map((y, i) => {
            const prev = years[i - 1]
            const d = prev ? (100 * (Number(y.GMV) - Number(prev.GMV))) / Number(prev.GMV) : null
            return (
              <div key={y.YR} className="rounded-xl border border-border p-4">
                <p className="text-sm font-bold text-[#0b2545] dark:text-slate-100">{y.YR}</p>
                <p className="mt-1 text-2xl font-extrabold text-[#f2553d]">{fmtCompact(Number(y.GMV))}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtInt(y.REQUESTS)} requests · CSAT {y.CSAT}
                </p>
                {d != null && (
                  <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${d >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
                    {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(0)}% GMV vs {prev.YR}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Panel title="Job status funnel" subtitle="Where requests end up">
          <div className="flex flex-col gap-3">
            {(data?.byStatus ?? []).map((s) => {
              const pct = statusTotal ? (100 * Number(s.REQUESTS)) / statusTotal : 0
              return (
                <div key={s.STATUS}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{s.STATUS.replace("_", " ")}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtInt(s.REQUESTS)} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full" style={{ width: `${Math.max(1, pct)}%`, background: statusBar[s.STATUS] ?? "#64748b" }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Acquisition channels" subtitle="GMV by how the homeowner arrived">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byChannel ?? []} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="CHANNEL" tick={{ fontSize: 11 }} width={110} />
                <Tooltip formatter={(v) => fmtUsd(v)} />
                <Bar dataKey="GMV" radius={[0, 6, 6, 0]}>
                  {(data?.byChannel ?? []).map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="CSAT distribution" subtitle="Share of rated jobs by star score">
          <div className="flex h-64 items-end gap-3">
            {[1, 2, 3, 4, 5].map((score) => {
              const r = (data?.csatDist ?? []).find((c) => Number(c.SCORE) === score)
              const pct = csatTotal && r ? (100 * Number(r.REQUESTS)) / csatTotal : 0
              return (
                <div key={score} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs font-semibold tabular-nums">{pct.toFixed(0)}%</span>
                  <div
                    className="w-full rounded-t-lg"
                    style={{ height: `${Math.max(2, pct * 1.8)}px`, background: score >= 4 ? "#0d9488" : score === 3 ? "#f59e0b" : "#f2553d" }}
                  />
                  <span className="text-xs text-muted-foreground">{"★".repeat(score)}</span>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Top 10 pros by GMV" subtitle="Live ranking for the current slice, with deep links">
        <div className="overflow-auto rounded-xl border border-border">
          <Table>
            <TableHeader className="bg-[#0b2545]">
              <TableRow className="hover:bg-transparent">
                {["#", "Provider", "Requests", "GMV", "CSAT", "Completion"].map((h) => (
                  <TableHead key={h} className="text-white">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.topProviders ?? []).map((p, i) => (
                <TableRow key={p.PROVIDER_ID} className="hover:bg-[#fff6f2] dark:hover:bg-white/5">
                  <TableCell className="font-bold text-[#f2553d]">{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 font-semibold text-[#0b2545] dark:text-slate-100">
                      {p.BUSINESS_NAME}
                      {p.IS_VERIFIED && <Badge className="h-4 bg-[#0d9488] px-1 text-[9px] text-white">Verified</Badge>}
                    </div>
                    <div className="mb-1 text-[11px] text-muted-foreground">
                      {p.CITY}, {p.STATE}
                    </div>
                    <ProviderLinks name={p.BUSINESS_NAME} city={p.CITY} state={p.STATE} />
                  </TableCell>
                  <TableCell className="tabular-nums">{fmtInt(p.REQUESTS)}</TableCell>
                  <TableCell className="tabular-nums">{fmtCompact(Number(p.GMV))}</TableCell>
                  <TableCell>★ {p.CSAT}</TableCell>
                  <TableCell>{p.COMPLETION_PCT}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  )
}

function MarketMap({ filters, onMetro, onZipDrill }: { filters: Filters; onMetro: (m: string) => void; onZipDrill: (zip: string) => void }) {
  const [data, setData] = useState<{ metros: Row[]; zips: Row[]; queryMs: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zipSel, setZipSel] = useState<Row | null>(null)
  const q = toQuery({ ...filters, zip: "" })

  useEffect(() => {
    setError(null)
    setZipSel(null)
    getJson<typeof data>(`/api/geo?${q}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [q])

  const list = filters.metro ? data?.zips ?? [] : data?.metros ?? []
  const totalGmv = list.reduce((s, r) => s + Number(r.GMV || 0), 0)

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Panel
        className="xl:col-span-2"
        title={filters.metro ? `${filters.metro}: ZIP code performance` : "National footprint"}
        subtitle={
          filters.metro
            ? "Each bubble is a ZIP. Click one to see its stats, then drill into its requests."
            : "Click a metro to zoom into ZIP-level analysis."
        }
        action={
          filters.metro ? (
            <Button size="sm" variant="outline" onClick={() => onMetro("")}>
              Back to US
            </Button>
          ) : undefined
        }
      >
        <ErrorBox error={error} />
        {data ? (
          <UsMap metros={data.metros} zips={data.zips} selectedMetro={filters.metro} onSelectMetro={onMetro} onSelectZip={setZipSel} />
        ) : (
          <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">Loading map…</div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Live query {data ? `${data.queryMs} ms` : "…"} · ZIP codes and coordinates are synthetic for this demo
        </p>
      </Panel>

      <div className="flex flex-col gap-5">
        {zipSel && (
          <div className="rounded-2xl bg-[#0b2545] p-5 text-white shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#ffb199]">Selected ZIP</p>
                <p className="text-3xl font-extrabold">{zipSel.ZIP}</p>
              </div>
              <button onClick={() => setZipSel(null)} aria-label="Close">
                <X className="h-5 w-5 text-white/60" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-white/60">GMV</p>
                <p className="font-bold">{fmtUsd(zipSel.GMV)}</p>
              </div>
              <div>
                <p className="text-white/60">Requests</p>
                <p className="font-bold">{fmtInt(zipSel.REQUESTS)}</p>
              </div>
              <div>
                <p className="text-white/60">CSAT</p>
                <p className="font-bold">{zipSel.CSAT}</p>
              </div>
              <div>
                <p className="text-white/60">Providers</p>
                <p className="font-bold">{zipSel.PROVIDERS}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-white/70">Top category: {zipSel.TOP_CATEGORY}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" className="bg-[#f2553d] text-white hover:bg-[#e04a33]" onClick={() => onZipDrill(zipSel.ZIP)}>
                View requests
              </Button>
              <a
                href={zipMapLink(zipSel.ZIP)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 text-sm hover:bg-white/20"
              >
                Google Maps <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
        <Panel title={filters.metro ? "ZIP leaderboard" : "Metro leaderboard"} subtitle="Share of GMV in view">
          <div className="flex max-h-[460px] flex-col gap-2 overflow-auto pr-1">
            {list.map((r, i) => {
              const share = totalGmv ? (100 * Number(r.GMV)) / totalGmv : 0
              const key = filters.metro ? r.ZIP : r.METRO
              return (
                <button
                  key={key}
                  onClick={() => (filters.metro ? setZipSel(r) : onMetro(r.METRO))}
                  className="group rounded-xl p-2 text-left hover:bg-[#fff1ec] dark:hover:bg-white/5"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-[#0b2545] dark:text-slate-100">
                      <span className="mr-2 text-muted-foreground">{i + 1}</span>
                      {key}
                    </span>
                    <span className="tabular-nums">{fmtCompact(Number(r.GMV))}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-[#ff8a65] to-[#f2553d]" style={{ width: `${Math.max(2, share)}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {fmtInt(r.REQUESTS)} requests · CSAT {r.CSAT} · {share.toFixed(1)}%
                  </div>
                </button>
              )
            })}
          </div>
        </Panel>
      </div>
    </div>
  )
}

const HEAT_METRICS = [
  { id: "GMV", label: "GMV", fmt: (v: number) => fmtCompact(v) },
  { id: "REQUESTS", label: "Requests", fmt: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)) },
  { id: "CSAT", label: "CSAT", fmt: (v: number) => v.toFixed(2) },
  { id: "COMPLETION_PCT", label: "Completion %", fmt: (v: number) => `${v.toFixed(0)}%` },
] as const

function Heatmaps({ filters, onDrill }: { filters: Filters; onDrill: (metro: string, category: string) => void }) {
  const [data, setData] = useState<{ grid: Row[]; season: Row[]; queryMs: number } | null>(null)
  const [metric, setMetric] = useState<(typeof HEAT_METRICS)[number]["id"]>("GMV")
  const [error, setError] = useState<string | null>(null)
  const q = toQuery({ ...filters, metro: "", category: "" })

  useEffect(() => {
    setError(null)
    getJson<typeof data>(`/api/heatmap?${q}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [q])

  const { metros, categories } = useMemo(() => {
    const gm = new Map<string, number>()
    const gc = new Map<string, number>()
    for (const c of data?.grid ?? []) {
      gm.set(c.METRO, (gm.get(c.METRO) ?? 0) + Number(c.GMV))
      gc.set(c.CATEGORY, (gc.get(c.CATEGORY) ?? 0) + Number(c.GMV))
    }
    const sorted = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    return { metros: sorted(gm), categories: sorted(gc) }
  }, [data])
  const fmt = HEAT_METRICS.find((m) => m.id === metric)!.fmt

  return (
    <div className="flex flex-col gap-5">
      <ErrorBox error={error} />
      <Panel
        title="Market x category heatmap"
        subtitle="Where the business is concentrated. Click any cell to drill into those requests."
        action={
          <div className="flex gap-1 rounded-full bg-muted p-1">
            {HEAT_METRICS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${metric === m.id ? "bg-[#0b2545] text-white" : "text-muted-foreground"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <Heatmap rows={metros} cols={categories} cells={data?.grid ?? []} rowKey="METRO" colKey="CATEGORY" metric={metric} format={fmt} onCellClick={onDrill} />
      </Panel>
      <Panel title="Seasonality heatmap" subtitle="Request volume by category and calendar month">
        <Heatmap
          rows={categories}
          cols={MONTHS.map((_, i) => String(i + 1))}
          colLabel={(c) => MONTHS[Number(c) - 1]}
          cells={data?.season ?? []}
          rowKey="CATEGORY"
          colKey="M"
          metric="REQUESTS"
          format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v))}
        />
      </Panel>
      <p className="text-xs text-muted-foreground">Live query {data ? `${data.queryMs} ms` : "…"}</p>
    </div>
  )
}

function RequestDetail({ filters }: { filters: Filters }) {
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState("REQUEST_DATE")
  const [dir, setDir] = useState<"asc" | "desc">("desc")
  const [data, setData] = useState<{ rows: Row[]; total: number; pageSize: number; queryMs: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const fq = toQuery(filters)

  useEffect(() => setPage(0), [fq])
  useEffect(() => {
    setError(null)
    getJson<typeof data>(`/api/requests?${toQuery(filters, { page, pageSize: 100, sort, dir })}`)
      .then(setData)
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fq, page, sort, dir])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const sortBy = (c: string) => {
    if (sort === c) setDir(dir === "asc" ? "desc" : "asc")
    else {
      setSort(c)
      setDir("desc")
    }
  }

  async function exportCsv() {
    setExporting("Querying…")
    const t0 = performance.now()
    try {
      const r = await fetch(`/api/requests/export?${fq}`)
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`)
      const blob = await r.blob()
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `service_requests_${r.headers.get("X-Row-Count")}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      setExporting(`${fmtInt(r.headers.get("X-Row-Count"))} rows in ${((performance.now() - t0) / 1000).toFixed(1)}s`)
    } catch (e) {
      setExporting(null)
      setError(e instanceof Error ? e.message : "Export failed")
    }
  }

  const statusColor: Record<string, string> = {
    COMPLETED: "bg-emerald-100 text-emerald-800",
    CANCELLED: "bg-slate-200 text-slate-700",
    DISPUTED: "bg-red-100 text-red-700",
    PENDING: "bg-amber-100 text-amber-800",
    SCHEDULED: "bg-sky-100 text-sky-800",
    IN_PROGRESS: "bg-violet-100 text-violet-800",
  }
  const cols: [string, string][] = [
    ["REQUEST_DATE", "Date"],
    ["METRO", "Metro / ZIP"],
    ["SERVICE_CATEGORY", "Category"],
    ["PROVIDER_ID", "Provider"],
    ["STATUS", "Status"],
    ["JOB_COST", "Job cost"],
    ["SATISFACTION_SCORE", "CSAT"],
  ]
  const sortable = new Set(["REQUEST_DATE", "JOB_COST", "SATISFACTION_SCORE", "METRO"])

  return (
    <Panel
      title="Service requests"
      subtitle={data ? `${fmtInt(data.total)} matching rows · server-side paging · ${data.queryMs} ms` : "Loading…"}
      action={
        <div className="flex items-center gap-2">
          {exporting && <span className="text-xs text-muted-foreground">{exporting}</span>}
          <Button size="sm" onClick={exportCsv} className="bg-[#f2553d] text-white hover:bg-[#e04a33]">
            <Download className="mr-1 h-4 w-4" /> Export all rows
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <ErrorBox error={error} />
        <div className="max-h-[600px] overflow-auto rounded-xl border border-border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-[#0b2545]">
              <TableRow className="hover:bg-transparent">
                {cols.map(([c, label]) => (
                  <TableHead
                    key={c}
                    className={`text-white ${sortable.has(c) ? "cursor-pointer select-none" : ""}`}
                    onClick={() => sortable.has(c) && sortBy(c)}
                  >
                    {label}
                    {sort === c ? (dir === "asc" ? " ▲" : " ▼") : ""}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).map((r) => (
                <TableRow key={r.REQUEST_ID} className="hover:bg-[#fff6f2] dark:hover:bg-white/5">
                  <TableCell>
                    <div>{fmtDate(r.REQUEST_DATE)}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{r.REQUEST_ID}</div>
                  </TableCell>
                  <TableCell>
                    <div>{r.METRO}</div>
                    <a href={zipMapLink(r.ZIP)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#c2410c] hover:underline">
                      {r.ZIP}
                    </a>
                  </TableCell>
                  <TableCell>{r.SERVICE_CATEGORY}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.BUSINESS_NAME ?? r.PROVIDER_ID}</div>
                    <ProviderLinks name={r.BUSINESS_NAME} city={r.CITY} state={r.STATE} />
                  </TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor[r.STATUS] ?? "bg-muted"}`}>{r.STATUS}</span>
                  </TableCell>
                  <TableCell className="tabular-nums">{fmtUsd(r.JOB_COST)}</TableCell>
                  <TableCell>{r.SATISFACTION_SCORE ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Prev
          </Button>
          <span>
            Page {page + 1} of {fmtInt(pages)}
          </span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </Panel>
  )
}

function ProviderNotes({ metro }: { metro: string }) {
  const [providers, setProviders] = useState<Row[]>([])
  const [selected, setSelected] = useState<Row | null>(null)
  const [notes, setNotes] = useState<Row[]>([])
  const [status, setStatus] = useState(NOTE_STATUSES[0])
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

  const loadProviders = () =>
    getJson<Row[]>(`/api/providers?${metro ? `metro=${encodeURIComponent(metro)}` : ""}`)
      .then(setProviders)
      .catch((e) => setError(e.message))

  useEffect(() => {
    loadProviders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metro])

  const loadNotes = (p: Row) =>
    getJson<Row[]>(`/api/notes?providerId=${encodeURIComponent(p.PROVIDER_ID)}`)
      .then(setNotes)
      .catch((e) => setError(e.message))

  useEffect(() => {
    if (selected) loadNotes(selected)
  }, [selected])

  const shown = useMemo(() => {
    const s = search.toLowerCase()
    return s ? providers.filter((p) => `${p.BUSINESS_NAME} ${p.PROVIDER_ID}`.toLowerCase().includes(s)) : providers
  }, [providers, search])

  async function save() {
    if (!selected || !text.trim()) return
    setSaving(true)
    setError(null)
    try {
      await getJson("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: selected.PROVIDER_ID, status, note: text }),
      })
      setText("")
      await Promise.all([loadNotes(selected), loadProviders()])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const noteColor: Record<string, string> = {
    ON_TRACK: "bg-emerald-100 text-emerald-800",
    AT_RISK: "bg-amber-100 text-amber-800",
    FOLLOW_UP: "bg-sky-100 text-sky-800",
    CHURN_RISK: "bg-red-100 text-red-700",
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <Panel
        className="xl:col-span-3"
        title={`Providers${metro ? ` in ${metro}` : ""}`}
        subtitle="Live volume, latest account status, and deep links. Click a provider to add notes."
        action={
          <input
            placeholder="Search provider…"
            className="h-9 w-48 rounded-lg border border-input bg-background px-3 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      >
        <div className="max-h-[620px] overflow-auto rounded-xl border border-border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-[#0b2545]">
              <TableRow className="hover:bg-transparent">
                {["Provider", "Category", "Requests", "GMV", "Rating", "Status"].map((h) => (
                  <TableHead key={h} className="text-white">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((p) => (
                <TableRow
                  key={p.PROVIDER_ID}
                  className={`cursor-pointer hover:bg-[#fff6f2] dark:hover:bg-white/5 ${selected?.PROVIDER_ID === p.PROVIDER_ID ? "bg-[#fff1ec] dark:bg-[#f2553d]/15" : ""}`}
                  onClick={() => setSelected(p)}
                >
                  <TableCell>
                    <div className="flex items-center gap-1 font-semibold text-[#0b2545] dark:text-slate-100">
                      {p.BUSINESS_NAME}
                      {p.IS_VERIFIED && <Badge className="h-4 bg-[#0d9488] px-1 text-[9px] text-white">Verified</Badge>}
                    </div>
                    <div className="mb-1 text-[11px] text-muted-foreground">
                      {p.CITY}, {p.STATE} · {p.TENURE_BAND}
                    </div>
                    <ProviderLinks name={p.BUSINESS_NAME} city={p.CITY} state={p.STATE} />
                  </TableCell>
                  <TableCell>{p.SERVICE_CATEGORY}</TableCell>
                  <TableCell className="tabular-nums">{fmtInt(p.REQUESTS)}</TableCell>
                  <TableCell className="tabular-nums">{p.GMV != null ? fmtCompact(Number(p.GMV)) : "—"}</TableCell>
                  <TableCell>{p.AVG_RATING != null ? `★ ${Number(p.AVG_RATING).toFixed(1)}` : "—"}</TableCell>
                  <TableCell>
                    {p.NOTE_STATUS ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${noteColor[p.NOTE_STATUS] ?? "bg-muted"}`}>{p.NOTE_STATUS}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel
        className="xl:col-span-2"
        title={selected ? selected.BUSINESS_NAME : "Select a provider"}
        subtitle="Notes write to DEMO_DB.APPS.PROVIDER_NOTES as the signed-in user (replaces the Google Sheet)."
      >
        <div className="flex flex-col gap-3">
          <ErrorBox error={error} />
          {selected ? (
            <>
              <div className="flex flex-wrap gap-2">
                {NOTE_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "ring-2 ring-[#0b2545] " : ""}${noteColor[s]}`}
                  >
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
              <textarea
                className="min-h-28 rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-[#f2553d]"
                placeholder="Add a note or feedback…"
                maxLength={4000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Button onClick={save} disabled={saving || !text.trim()} className="bg-[#f2553d] text-white hover:bg-[#e04a33]">
                {saving ? "Saving to Snowflake…" : "Save note"}
              </Button>
              <div className="relative flex flex-col gap-3 border-l-2 border-[#ffd5c8] pl-4">
                {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
                {notes.map((n) => (
                  <div key={n.NOTE_ID} className="relative rounded-xl bg-muted/60 p-3 text-sm">
                    <span className="absolute -left-[23px] top-4 h-3 w-3 rounded-full border-2 border-white bg-[#f2553d]" />
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${noteColor[n.STATUS] ?? "bg-muted"}`}>{n.STATUS}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {n.CREATED_BY} · {String(n.CREATED_AT).slice(0, 16)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{n.NOTE}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pick a provider on the left to view its history and log a note.</p>
          )}
        </div>
      </Panel>
    </div>
  )
}
