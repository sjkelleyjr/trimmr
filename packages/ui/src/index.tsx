import type { ChangeEventHandler, PropsWithChildren, ReactNode } from 'react'

export function Panel({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: string }>) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: PropsWithChildren<{ label: string; hint?: ReactNode }>) {
  return (
    <label className="field">
      <span className="field-copy">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  )
}

export function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: ChangeEventHandler<HTMLInputElement>
  hint?: ReactNode
}) {
  return (
    <Field label={label} hint={hint}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} />
    </Field>
  )
}

export function PrimaryButton({
  children,
  ...buttonProps
}: PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button className="primary-button" {...buttonProps}>
      {children}
    </button>
  )
}
