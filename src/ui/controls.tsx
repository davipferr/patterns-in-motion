import type { ReactNode } from 'react'

interface SliderProps {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  format?: (value: number) => string
  onChange: (value: number) => void
}

export function Slider({ label, value, min, max, step = 1, format, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider-label">
        <span>{label}</span>
        <output>{format ? format(value) : value}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function Checkbox({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Button({
  children,
  onClick,
  disabled,
  variant,
  pressed,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'ghost'
  pressed?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={['btn', variant, pressed ? 'pressed' : ''].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
    >
      {children}
    </button>
  )
}

/** The red "what goes wrong without the pattern" switch every section has. */
export function BreakIt({
  label,
  on,
  onChange,
  children,
}: {
  label: string
  on: boolean
  onChange: (on: boolean) => void
  children: ReactNode
}) {
  return (
    <div className={on ? 'break-it on' : 'break-it'}>
      <label className="break-switch">
        <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch" aria-hidden />
        <span>
          <span className="break-kicker">Break it</span>
          <strong>{label}</strong>
        </span>
      </label>
      <p>{children}</p>
    </div>
  )
}

export function Stat({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'ok' | 'bad' | 'warn' }) {
  return (
    <div className={tone ? `stat ${tone}` : 'stat'}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
