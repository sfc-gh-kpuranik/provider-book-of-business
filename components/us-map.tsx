"use client"

import { useEffect, useMemo, useState } from "react"
import { geoAlbersUsa, geoMercator, geoPath } from "d3-geo"
import { feature, mesh } from "topojson-client"
import statesTopo from "us-atlas/states-10m.json"

type Row = Record<string, any>

const W = 960
const H = 560
const topo = statesTopo as any
const states = feature(topo, topo.objects.states) as any
const borders = mesh(topo, topo.objects.states, (a: any, b: any) => a !== b) as any

// CSAT -> color over the data's own range: coral (weakest) to teal (strongest).
function makeCsatColor(min: number, max: number) {
  return (csat: number) => {
    const t = max > min ? Math.min(1, Math.max(0, (csat - min) / (max - min))) : 0.5
    const a = [242, 85, 61]
    const m = [251, 191, 36]
    const b = [13, 148, 136]
    const [from, to, f] = t < 0.5 ? [a, m, t * 2] : [m, b, (t - 0.5) * 2]
    return `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * f)).join(",")})`
  }
}

export function UsMap({
  metros,
  zips,
  selectedMetro,
  onSelectMetro,
  onSelectZip,
}: {
  metros: Row[]
  zips: Row[]
  selectedMetro: string
  onSelectMetro: (m: string) => void
  onSelectZip: (z: Row) => void
}) {
  const [hover, setHover] = useState<{ row: Row; x: number; y: number } | null>(null)
  const [counties, setCounties] = useState<any>(null)
  const zoomed = Boolean(selectedMetro && zips.length)

  // County lines give the metro view real geography; loaded lazily to keep the first paint light.
  useEffect(() => {
    if (!zoomed || counties) return
    import("us-atlas/counties-10m.json").then((m: any) => {
      const t = m.default ?? m
      setCounties(mesh(t, t.objects.counties, (a: any, b: any) => a !== b))
    })
  }, [zoomed, counties])

  const projection = useMemo(() => {
    if (zoomed) {
      const pts = { type: "MultiPoint", coordinates: zips.map((z) => [Number(z.LON), Number(z.LAT)]) } as any
      return geoMercator().fitExtent([[80, 60], [W - 80, H - 60]], pts)
    }
    return geoAlbersUsa().fitExtent([[10, 10], [W - 10, H - 10]], states)
  }, [zoomed, zips])
  const path = useMemo(() => geoPath(projection), [projection])

  const points = zoomed ? zips : metros
  const maxGmv = Math.max(1, ...points.map((p) => Number(p.GMV) || 0))
  const radius = (gmv: number) => (zoomed ? 7 + 30 * Math.sqrt(gmv / maxGmv) : 8 + 34 * Math.sqrt(gmv / maxGmv))
  const csats = points.map((p) => Number(p.CSAT)).filter((v) => !Number.isNaN(v))
  const csatColor = makeCsatColor(Math.min(...csats), Math.max(...csats))

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-xl bg-gradient-to-b from-[#eef4fb] to-[#f8fafc]">
        <defs>
          <radialGradient id="heat">
            <stop offset="0%" stopColor="#f2553d" stopOpacity={0.55} />
            <stop offset="45%" stopColor="#ff8a65" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#ffb199" stopOpacity={0} />
          </radialGradient>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0b2545" floodOpacity="0.35" />
          </filter>
        </defs>
        <g>
          {states.features.map((f: any) => (
            <path key={f.id} d={path(f) ?? ""} fill={zoomed ? "#e9eff6" : "#dbe5f0"} stroke="none" />
          ))}
          {zoomed && counties && <path d={path(counties) ?? ""} fill="none" stroke="#c3d1e0" strokeWidth={1} strokeDasharray="4 3" />}
          <path d={path(borders) ?? ""} fill="none" stroke={zoomed ? "#8da9c4" : "#ffffff"} strokeWidth={zoomed ? 2.5 : 1.2} />
        </g>
        <g style={{ mixBlendMode: "multiply" }}>
          {points.map((p) => {
            const xy = projection([Number(p.LON), Number(p.LAT)])
            if (!xy) return null
            const heatR = (zoomed ? 40 : 30) + (zoomed ? 90 : 70) * Math.sqrt((Number(p.GMV) || 0) / maxGmv)
            return <circle key={`h-${p.ZIP ?? p.METRO}`} cx={xy[0]} cy={xy[1]} r={heatR} fill="url(#heat)" />
          })}
        </g>
        {points.map((p) => {
          const xy = projection([Number(p.LON), Number(p.LAT)])
          if (!xy) return null
          const r = radius(Number(p.GMV) || 0)
          const key = zoomed ? p.ZIP : p.METRO
          return (
            <g
              key={key}
              transform={`translate(${xy[0]},${xy[1]})`}
              className="cursor-pointer"
              onMouseEnter={() => setHover({ row: p, x: xy[0], y: xy[1] })}
              onMouseLeave={() => setHover(null)}
              onClick={() => (zoomed ? onSelectZip(p) : onSelectMetro(p.METRO))}
            >
              <circle r={r} fill={csatColor(Number(p.CSAT))} fillOpacity={0.92} stroke="#fff" strokeWidth={2.5} filter="url(#shadow)" />
              {(!zoomed || r > 14) && (
                <text
                  y={zoomed ? 4 : r + 15}
                  textAnchor="middle"
                  className={`pointer-events-none text-[12px] font-bold ${zoomed ? "fill-white" : "fill-[#0b2545]"}`}
                  style={zoomed ? { paintOrder: "stroke", stroke: "rgba(11,37,69,0.35)", strokeWidth: 2 } : undefined}
                >
                  {zoomed ? p.ZIP : p.METRO}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 min-w-48 -translate-x-1/2 -translate-y-full rounded-lg bg-[#0b2545] px-3 py-2 text-xs text-white shadow-xl"
          style={{ left: `${(hover.x / W) * 100}%`, top: `calc(${(hover.y / H) * 100}% - 14px)` }}
        >
          <div className="mb-1 text-sm font-bold">{hover.row.ZIP ? `ZIP ${hover.row.ZIP}` : `${hover.row.METRO}, ${hover.row.STATE}`}</div>
          <div>GMV ${Number(hover.row.GMV).toLocaleString()}</div>
          <div>{Number(hover.row.REQUESTS).toLocaleString()} requests</div>
          <div>
            CSAT {hover.row.CSAT} · {hover.row.COMPLETION_PCT}% completed
          </div>
          {hover.row.TOP_CATEGORY && <div>Top category: {hover.row.TOP_CATEGORY}</div>}
          <div className="mt-1 text-[10px] text-white/60">{hover.row.ZIP ? "Click for ZIP detail" : "Click to zoom into ZIP codes"}</div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg bg-white/90 px-3 py-2 text-[11px] shadow">
        <span className="font-semibold">Bubble size = GMV</span>
        <span className="flex items-center gap-1">
          CSAT low
          <span className="h-2 w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${csatColor(Math.min(...csats))}, ${csatColor((Math.min(...csats) + Math.max(...csats)) / 2)}, ${csatColor(Math.max(...csats))})` }} />
          high
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-full" style={{ background: "radial-gradient(#f2553d, transparent)" }} />
          demand heat
        </span>
      </div>
    </div>
  )
}
