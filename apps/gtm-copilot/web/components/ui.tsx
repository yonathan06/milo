import { For, Show, type JSX } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { fieldLabel } from '../enrichment-display';
import type { Json } from '../server/store';

export function Badge(props: { children: JSX.Element }) {
  return <span class="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">{props.children}</span>;
}
export function Empty(props: { title: string; children?: JSX.Element }) {
  return <div class="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><h2 class="text-lg font-semibold">{props.title}</h2><p class="mt-2 text-sm text-slate-500">{props.children}</p></div>;
}
export function PageHeading(props: { eyebrow: string; title: string; description?: string; children?: JSX.Element }) {
  return <header class="mb-8"><p class="mb-3 text-xs font-semibold tracking-widest text-teal-700 uppercase">{props.eyebrow}</p><h1 class="text-3xl font-semibold tracking-tight break-words sm:text-4xl">{props.title}</h1><Show when={props.description}><p class="mt-4 max-w-3xl whitespace-pre-wrap leading-7 text-slate-500">{props.description}</p></Show><div class="mt-4 flex flex-wrap gap-2">{props.children}</div></header>;
}
export function Section(props: { title: string; children: JSX.Element }) {
  return <section class="mt-8"><h2 class="mb-4 text-lg font-semibold">{props.title}</h2>{props.children}</section>;
}
export function NotFound() {
  return <Empty title="Not found">This record does not exist. <Link to="/" class="text-teal-700 underline">Return to segments</Link>.</Empty>;
}
export function RouteError(props: { reset: () => void }) {
  return <Empty title="Could not load data"><span class="block">Check that the SQLite database exists, is initialized, and GTM_DATABASE_PATH is correct. See the app README for setup.</span><button type="button" onClick={props.reset} class="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white">Try again</button></Empty>;
}
export function safeUrl(value: string): string | undefined {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export function ExternalLink(props: { url: string; children?: JSX.Element }) {
  return <Show when={safeUrl(props.url)} fallback={<span class="break-all text-slate-500">{props.children ?? props.url}</span>}><a href={safeUrl(props.url)} target="_blank" rel="noopener noreferrer" class="break-all text-teal-700 underline decoration-teal-200 underline-offset-4 hover:decoration-teal-700">{props.children ?? props.url} ↗</a></Show>;
}
export function JsonData(props: { value: Json }) {
  const entries = () => props.value && typeof props.value === 'object' && !Array.isArray(props.value) ? Object.entries(props.value) : [];
  return <Show when={props.value !== null} fallback={<p class="text-sm text-slate-500">No data recorded.</p>}>
    <Show when={Array.isArray(props.value)} fallback={
      <Show when={typeof props.value === 'object'} fallback={<span class="whitespace-pre-wrap break-words text-sm leading-6">{String(props.value)}</span>}>
        <dl class="divide-y divide-slate-100"><For each={entries()}>{([key, value]) => <div class="py-3 first:pt-0 last:pb-0"><dt class="mb-2 text-xs font-semibold tracking-wide text-slate-500">{fieldLabel(key)}</dt><dd class="border-l-2 border-slate-100 pl-4"><JsonData value={value} /></dd></div>}</For></dl>
      </Show>
    }>
      <Show when={(props.value as Json[]).length > 0} fallback={<p class="text-sm text-slate-500">None recorded.</p>}><ul class="space-y-3"><For each={props.value as Json[]}>{(value) => <li class="rounded-lg bg-slate-50 p-3"><JsonData value={value} /></li>}</For></ul></Show>
    </Show>
  </Show>;
}
