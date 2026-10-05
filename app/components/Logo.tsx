// Logo de Life in Weeks : une petite grille de semaines, la dernière allumée = « maintenant ».
export default function Logo({ size = 22, accent = '#f5b544', color = 'currentColor', withName = false, className = '' }: {
  size?: number, accent?: string, color?: string, withName?: boolean, className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => {
          const cx = 4 + (i % 3) * 7
          const cy = 4 + Math.floor(i / 3) * 7
          const lit = i === 5
          const filled = i < 5
          return <circle key={i} cx={cx} cy={cy} r={2.4}
            fill={lit ? accent : filled ? color : 'none'}
            stroke={lit ? accent : color} strokeWidth={1} opacity={filled || lit ? 1 : 0.45} />
        })}
      </svg>
      {withName && <span className="font-semibold tracking-tight">Life in Weeks</span>}
    </span>
  )
}
