import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { planningStatusOptions, startQueryPlanning } from '../data';
import { countryLanguages, startPlanningSchema, type PlanningInput } from '../planning';
import type { Country } from '../server/store';
import { Badge } from './ui';

export function QueryGenerator(props: { segmentId: number; countries: Country[] }) {
  const client = useQueryClient();
  const status = createQuery(() => planningStatusOptions(props.segmentId));
  const [scope, setScope] = createSignal<'selected' | 'all'>('selected');
  const [selected, setSelected] = createSignal<number[]>([]);
  const [languages, setLanguages] = createSignal('');
  const [count, setCount] = createSignal(20);
  const [message, setMessage] = createSignal('');
  const countries = createMemo(() => props.countries.filter((country) => scope() === 'all' || selected().includes(country.id)));
  const override = () => languages().split(',').map((language) => language.trim()).filter(Boolean);
  const expected = createMemo(() => countries().reduce((total, country) => total + (override().length || countryLanguages[country.country_code]?.length || 0) * count(), 0));
  const mutation = createMutation(() => ({
    mutationFn: (input: PlanningInput) => startQueryPlanning({ data: input }),
    onSuccess: (response) => {
      if (response.error) { setMessage(response.error); void status.refetch(); }
      else { setMessage(''); client.setQueryData(['query-planning', props.segmentId], response.job); }
    },
    onError: () => {
      setMessage('Could not confirm that generation started. Refresh the job status before trying again.');
      void status.refetch();
    },
  }));
  const busy = () => mutation.isPending || status.data?.status === 'running';
  let lastProgress = '';
  createEffect(on(() => props.segmentId, () => {
    setScope('selected');
    setSelected([]);
    setLanguages('');
    setCount(20);
    setMessage('');
    lastProgress = '';
  }));
  createEffect(() => {
    const job = status.data;
    if (!job) return;
    const finished = job.countries.filter((country) => country.status === 'complete' || country.status === 'failed').length;
    const signature = `${job.id}:${finished}:${job.status}`;
    if (signature !== lastProgress && (finished > 0 || job.status === 'complete')) {
      lastProgress = signature;
      void client.invalidateQueries({ queryKey: ['segment', props.segmentId] });
      void client.invalidateQueries({ queryKey: ['segments'] });
      void client.invalidateQueries({ queryKey: ['query'] });
    }
  });
  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy()) return;
    const input = startPlanningSchema.safeParse({ segmentId: props.segmentId, countryIds: countries().map((country) => country.id), languages: override().length ? override() : undefined, queriesPerLanguage: count() });
    if (!input.success) { setMessage(input.error.issues[0]?.message ?? 'Check the generation settings.'); return; }
    setMessage('');
    mutation.mutate(input.data);
  }
  return <div class="rounded-2xl border border-teal-200 bg-white p-5 sm:p-6">
    <h2 class="text-lg font-semibold">Generate suggested queries</h2>
    <p class="mt-2 text-sm leading-6 text-slate-500">Use the AI planner to create and save queries for this segment. This uses your server’s OpenRouter API key and incurs model costs. It does not run searches.</p>
    <Show when={props.countries.length} fallback={<p class="mt-4 text-sm text-slate-500">Assign countries with the CLI before generating queries.</p>}>
      <form onSubmit={submit} class="mt-5">
        <fieldset disabled={busy() || status.isPending} class="space-y-5 disabled:opacity-60">
          <legend class="mb-3 text-sm font-medium">Generate for</legend>
          <div class="flex flex-wrap gap-5 text-sm"><label class="flex items-center gap-2"><input type="radio" name={`scope-${props.segmentId}`} checked={scope() === 'selected'} onChange={() => setScope('selected')} />Selected countries</label><label class="flex items-center gap-2"><input type="radio" name={`scope-${props.segmentId}`} checked={scope() === 'all'} onChange={() => setScope('all')} />All countries ({props.countries.length})</label></div>
          <Show when={scope() === 'selected'}><div class="grid gap-2 sm:grid-cols-3"><For each={props.countries}>{(country) => <label class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={selected().includes(country.id)} onChange={(event) => setSelected((ids) => event.currentTarget.checked ? [...ids, country.id] : ids.filter((id) => id !== country.id))} /><span class="font-medium">{country.country_code}</span><span class="text-xs text-slate-400">{countryLanguages[country.country_code]?.join(', ') ?? 'Set languages below'}</span></label>}</For></div></Show>
          <div class="grid gap-4 sm:grid-cols-[1fr_12rem]"><label><span class="mb-2 block text-sm font-medium">Languages (optional override)</span><input type="text" value={languages()} onInput={(event) => setLanguages(event.currentTarget.value)} placeholder="Automatic per country; or en, fr…" aria-describedby="language-help" class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label><label><span class="mb-2 block text-sm font-medium">Queries per language</span><input type="number" min="1" max="20" step="1" required value={count()} onInput={(event) => setCount(Number(event.currentTarget.value))} class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label></div>
          <p id="language-help" class="text-xs leading-5 text-slate-500">Leave blank to use the language tags shown for each country. An override applies to every selected country (1–8 BCP 47 tags). Country targeting stays unchanged.</p>
          <Show when={scope() === 'all'}><p class="text-xs leading-5 text-slate-500">Default languages: {props.countries.map((country) => `${country.country_code}: ${countryLanguages[country.country_code]?.join(', ') ?? 'override required'}`).join(' · ')}</p></Show>
          <button type="submit" disabled={!countries().length || status.isError} class="rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">{busy() ? 'Generating queries…' : `Generate queries for ${countries().length} ${countries().length === 1 ? 'country' : 'countries'}`}</button>
          <p class="text-xs text-slate-500">Up to {expected()} queries · Countries run sequentially · Existing exact matches are updated, not duplicated.</p>
        </fieldset>
      </form>
    </Show>
    <Show when={message()}><p role="alert" class="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{message()}</p></Show>
    <Show when={status.isError}><p role="alert" class="mt-4 text-sm text-rose-800">Could not load generation status. <button type="button" class="underline" onClick={() => void status.refetch()}>Retry status</button> before starting another job.</p></Show>
    <Show when={status.data}>{(job) => <div class="mt-6 border-t border-slate-200 pt-5">
      <p role="status" aria-live="polite" class="mb-3 text-sm font-medium">{job().status === 'running' ? 'Generating' : 'Generation finished'} · {job().countries.filter((country) => country.status === 'complete' || country.status === 'failed').length}/{job().countries.length} countries processed · {job().countries.reduce((total, country) => total + country.savedCount, 0)} queries saved{job().countries.some((country) => country.status === 'failed') ? ' · Some countries failed; select them to retry.' : ''}</p>
      <ul class="space-y-2"><For each={job().countries}>{(country) => <li class="rounded-lg bg-slate-50 p-3 text-sm"><div class="flex flex-wrap items-center gap-2"><span class="font-medium">{country.countryCode}</span><span class="text-xs text-slate-500">{country.languages.join(', ')}</span><Badge>{country.status}</Badge><Show when={country.status === 'complete'}><span class="text-xs text-teal-700">{country.savedCount} saved</span></Show></div><Show when={country.error}><p class="mt-2 text-xs text-rose-700">{country.error}</p></Show></li>}</For></ul>
      <p class="mt-3 text-xs text-slate-400">You may leave this page and return while the server stays running. Saved queries remain in SQLite; job progress is kept in memory for one hour.</p>
    </div>}</Show>
  </div>;
}
