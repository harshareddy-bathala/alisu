import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../lib/ThemeContext'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  style?: React.CSSProperties
  className?: string
  compact?: boolean
}

export function CustomSelect({ value, onChange, options, style, className, compact }: Props) {
  const t = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find(o => o.value === value)
  const pad = compact ? '4px 22px 4px 10px' : '7px 30px 7px 14px'

  return (
    <div
      ref={ref}
      className={className}
      style={{ position: 'relative', display: 'inline-block', ...style }}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          background: t.bgElevated,
          border: `1px solid ${open ? t.primary : t.border}`,
          color: t.text,
          borderRadius: 10,
          fontSize: compact ? 12 : 13,
          padding: pad,
          outline: 'none',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          position: 'relative',
          whiteSpace: 'nowrap',
          fontWeight: 500,
        }}
      >
        {selected?.label ?? value}
        <span
          style={{
            position: 'absolute',
            right: compact ? 8 : 12,
            top: '50%',
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            color: t.textMuted,
            pointerEvents: 'none',
            fontSize: 9,
            transition: 'transform 180ms ease',
          }}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          className="animate-fade-up"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: '100%',
            background: t.surface,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            zIndex: 100,
            overflow: 'hidden',
            boxShadow: t.shadowLg,
          }}
        >
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: compact ? '7px 12px' : '9px 16px',
                fontSize: compact ? 12 : 13,
                background: o.value === value ? t.primaryBg : 'transparent',
                color: o.value === value ? t.primary : t.text,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: o.value === value ? 600 : 500,
              }}
              onMouseEnter={e => {
                if (o.value !== value) (e.currentTarget as HTMLElement).style.background = t.surfaceHover
              }}
              onMouseLeave={e => {
                if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
