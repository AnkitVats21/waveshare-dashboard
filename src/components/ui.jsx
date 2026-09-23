import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

export function Card({ title, icon: Icon, action, className, children, padded = true }) {
  return (
    <section className={clsx('card', padded && 'card-padded', className)}>
      {(title || action) && (
        <header className="card-header">
          {title && (
            <h2 className="card-title">
              {Icon && <Icon size={16} />} {title}
            </h2>
          )}
          {action && <div className="card-action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}

export function Button({ variant = 'secondary', size, icon: Icon, busy, children, className, ...rest }) {
  return (
    <button className={clsx('btn', `btn-${variant}`, size && `btn-${size}`, className)} disabled={busy || rest.disabled} {...rest}>
      {busy ? <Loader2 size={15} className="spin" /> : Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, active, danger, size = 18, className, ...rest }) {
  return (
    <button
      className={clsx('icon-btn', active && 'is-active', danger && 'is-danger', className)}
      title={label}
      aria-label={label}
      {...rest}
    >
      <Icon size={size} />
    </button>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className={clsx('switch', disabled && 'is-disabled')}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      {label && <span className="switch-label">{label}</span>}
    </label>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={clsx(value === o.value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <o.icon size={14} />}
          {o.label}
          {o.badge ? <span className="badge">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Pill({ tone = 'neutral', children, pulse }) {
  return <span className={clsx('pill', `pill-${tone}`, pulse && 'pill-pulse')}>{children}</span>;
}

export function Banner({ tone = 'info', icon: Icon, children, action }) {
  return (
    <div className={clsx('banner', `banner-${tone}`)}>
      {Icon && <Icon size={16} className="banner-icon" />}
      <div className="banner-body">{children}</div>
      {action}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-icon">
          <Icon size={22} />
        </div>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, children }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {children}
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Meter({ value, max = 100, tone }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const auto = pct > 85 ? 'danger' : pct > 65 ? 'warn' : 'ok';
  return (
    <div className="meter">
      <div className={clsx('meter-fill', `meter-${tone || auto}`)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Row({ label, children }) {
  return (
    <div className="kv-row">
      <span>{label}</span>
      <span className="mono">{children}</span>
    </div>
  );
}
