"use client"

import { useMemo, useState } from "react"

type Cell = Record<string, any>
export type HeatMetric = "GMV" | "REQUESTS" | "CSAT" | "COMPLETION_PCT"

// Coral (low) -> amber -> teal (high). Inverted for metrics where low is good is not needed here.
function colorFor(t: number) {
  const stops = [
    [255, 241, 236],
    [255, 176, 140],
    [242, 85, 61],
    [140, 30, 40],
  ]
  const x = Math.min(0.999, Math.max(0, t)) * (stops.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export function Heatmap({
  rows,
  cols,
  cells,
  rowKey,
  colKey,
  metric,
  format,
  colLabel = (c) => c,
  onCellClick,
}: {
  rows: string[]
  cols: string[]
  cells: Cell[]
  rowKey: string
  colKey: string
  metric: string
  format: (v: number) => string
  colLabel?: (c: string) => string
  onCellClick?: (row: string, col: string) => void
}) {
  const [hover, setHover] = useState<Cell | null>(null)
  const { map, min, max } = useMemo(() => {
    const map = new Map<string, Cell>()
    let min = Infinity
    let max = -Infinity
    for (const c of cells) {
      map.set(`${c[rowKey]}|${c[colKey]}`, c)
      const v = Number(c[metric])
      if (!Number.isNaN(v)) {
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
    }
    return { map, min, max }
  }, [cells, rowKey, colKey, metric])

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-auto">
        <div className="grid gap-[3px] text-[11px]" style={{ gridTemplateColumns: `130px repeat(${cols.length}, minmax(56px, 1fr))` }}>
          <div />
          {cols.map((c) => (
            <div key={c} className="truncate px-1 pb-1 text-center font-semibold text-muted-foreground" title={colLabel(c)}>
              {colLabel(c)}
            </div>
          ))}
          {rows.map((r) => (
            <div key={r} className="contents">
              <div className="truncate pr-2 text-right font-semibold leading-8">{r}</div>
              {cols.map((c) => {
                const cell = map.get(`${r}|${c}`)
                const v = cell ? Number(cell[metric]) : NaN
                const t = max > min ? (v - min) / (max - min) : 0.5
                return (
                  <button
                    key={c}
                    onMouseEnter={() => setHover(cell ?? null)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => cell && onCellClick?.(r, c)}
                    className="h-8 rounded-[4px] font-medium tabular-nums transition hover:scale-105 hover:shadow-md"
                    style={{ background: Number.isNaN(v) ? "var(--muted)" : colorFor(t), color: t > 0.55 ? "#fff" : "#3b1d17" }}
                  >
                    {Number.isNaN(v) ? "" : format(v)}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{Number.isFinite(min) ? format(min) : ""}</span>
          <div className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${colorFor(0)}, ${colorFor(0.33)}, ${colorFor(0.66)}, ${colorFor(1)})` }} />
          <span>{Number.isFinite(max) ? format(max) : ""}</span>
        </div>
        <div className="h-4">
          {hover && (
            <span>
              <b className="text-foreground">
                {hover[rowKey]} · {colLabel(String(hover[colKey]))}
              </b>{" "}
              {Number(hover.REQUESTS).toLocaleString()} requests · ${Number(hover.GMV ?? 0).toLocaleString()} GMV
              {hover.CSAT != null && ` · CSAT ${hover.CSAT} · ${hover.COMPLETION_PCT}% completed`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
