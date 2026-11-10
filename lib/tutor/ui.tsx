import Link from "next/link";
import type { ReactNode } from "react";
import { textSettings, toggleSettings, type FieldProps, type PortalSettings } from "./fields";

export function TutorIntro({ title, description, back, children }: {
  title: string;
  description?: string;
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <header className="page-intro">
      {back && <Link className="muted" href={back.href}>← {back.label}</Link>}
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
      {children}
    </header>
  );
}

export function Field({ name, label, children }: FieldProps) {
  return <div className="grid min-w-0 gap-1.5"><label htmlFor={name}>{label}</label>{children}</div>;
}

export function SettingsFields({ prefix, settings, overrides = true }: {
  prefix: string;
  settings: PortalSettings;
  overrides?: boolean;
}) {
  return (
    <div className="form-grid">
      {toggleSettings.map(([key, label, fallback]) => (
        <Field key={key} name={`${prefix}-${key}`} label={label}>
          <select id={`${prefix}-${key}`} name={key} defaultValue={settings[key] === undefined ? (overrides ? "" : String(fallback)) : String(settings[key])}>
            {overrides && <option value="">Use default</option>}
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </Field>
      ))}
      {textSettings.map(([key, label]) => (
        <Field key={key} name={`${prefix}-${key}`} label={label}>
          <textarea id={`${prefix}-${key}`} name={key} rows={2} maxLength={1500} defaultValue={settings[key] ?? ""} />
        </Field>
      ))}
    </div>
  );
}
