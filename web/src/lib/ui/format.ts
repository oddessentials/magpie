import { t } from './strings';

const units = {
  minute: 60,
  hour: 3600,
  day: 86400
};

export function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function formatDateTime(value: string | null | undefined, local: boolean): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: local ? undefined : 'UTC'
  }).format(ms);
}

export function formatDate(value: string | null | undefined, local: boolean): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: local ? undefined : 'UTC'
  }).format(ms);
}

export function formatUtc(value: string | null | undefined): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  return new Date(ms)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
}

function span(seconds: number): string {
  if (seconds < units.hour) return t.time.minutes(Math.max(1, Math.round(seconds / units.minute)));
  if (seconds < units.day) return t.time.hours(Math.round(seconds / units.hour));
  if (seconds < units.day * 14) return t.time.days(Math.round(seconds / units.day));
  if (seconds < units.day * 60) return t.time.weeks(Math.round(seconds / (units.day * 7)));
  return t.time.months(Math.round(seconds / (units.day * 30)));
}

export function relativeTime(value: string | null | undefined, now: number): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  const delta = Math.round((now - ms) / 1000);
  const seconds = Math.abs(delta);
  if (seconds < 45) return t.time.justNow;
  const text = span(seconds);
  return delta >= 0 ? t.time.ago(text) : t.time.ahead(text);
}

export function ageText(value: string | null | undefined, now: number): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return t.time.ago(t.time.seconds(seconds));
  return t.time.ago(span(seconds));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return t.time.seconds(total);
  const days = Math.floor(total / units.day);
  const hours = Math.floor((total % units.day) / units.hour);
  const minutes = Math.floor((total % units.hour) / units.minute);
  if (days > 0)
    return hours > 0 ? `${t.time.days(days)} ${t.time.hours(hours)}` : t.time.days(days);
  if (hours > 0) {
    return minutes > 0 ? `${t.time.hours(hours)} ${t.time.minutes(minutes)}` : t.time.hours(hours);
  }
  const rest = total % units.minute;
  if (total < 600 && rest > 0) return `${t.time.minutes(minutes)} ${t.time.seconds(rest)}`;
  return t.time.minutes(minutes);
}

export function formatHours(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  const hours = seconds / units.hour;
  if (hours < 1) return t.time.minutes(Math.round(seconds / units.minute));
  if (hours < 10) return t.time.hours(Number(hours.toFixed(1)));
  return t.time.hours(Math.round(hours));
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatMegabytes(mb: number | null | undefined): string {
  if (mb === null || mb === undefined) return '';
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '';
  return `${Math.round(fraction * 100)}%`;
}
