import { LEGEND_COLORS, STATUS_DOT_COLORS } from '../constants'

const LEGEND_ITEMS = [
  { color: LEGEND_COLORS.absence, label: 'Absence' },
  { color: LEGEND_COLORS.holiday, label: 'Holiday' },
  { color: LEGEND_COLORS.other, label: 'Other' },
  { color: STATUS_DOT_COLORS.placeholder, label: 'Placeholder' },
  { color: STATUS_DOT_COLORS['needs-reqs'], label: 'Needs Reqs' },
  { color: STATUS_DOT_COLORS.confirmed, label: 'Confirmed' },
] as const

export function LegendBar() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground py-2 px-4 bg-muted/30 rounded-md">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-sm ${item.color}`} />
          <span>{item.label}</span>
        </div>
      ))}
      <span className="ml-auto text-muted-foreground/60">Ctrl+Click: copy/paste</span>
    </div>
  )
}
