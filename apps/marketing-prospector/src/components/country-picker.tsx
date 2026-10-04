import { useId, useState } from 'react'
import { countries } from '../search-filters'

export function CountryPicker({ value, onChange }: { value: string[]; onChange: (countries: string[]) => void }) {
  const [search, setSearch] = useState('')
  const id = useId()
  const query = search.trim().toLocaleLowerCase('en')
  const visible = countries.filter(country => `${country.name} ${country.code}`.toLocaleLowerCase('en').includes(query))
  const selected = countries.filter(country => value.includes(country.code))
  function toggle(code: string) {
    onChange(value.includes(code) ? value.filter(item => item !== code) : [...value, code])
  }
  return <fieldset className="min-w-0 w-full sm:w-80">
    <legend className="mb-1.5 text-sm font-medium text-slate-700">Countries</legend>
    <p id={`${id}-hint`} className="text-xs">{value.length ? `${value.length} selected — match any selected country` : 'Any country (no restriction)'}</p>
    {selected.length > 0 && <div className="mb-2 flex flex-wrap gap-1">
      {selected.map(country => <button type="button" className="secondary px-2 py-1 text-xs" key={country.code} aria-label={`Remove ${country.name}`} onClick={() => toggle(country.code)}>{country.name} ×</button>)}
      <button type="button" className="secondary px-2 py-1 text-xs" onClick={() => onChange([])}>Clear countries</button>
    </div>}
    <label className="sr-only" htmlFor={`${id}-search`}>Search countries</label>
    <input id={`${id}-search`} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by country name or code…" aria-describedby={`${id}-hint`} aria-controls={`${id}-options`} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault() }} />
    <div id={`${id}-options`} className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2">
      {visible.map(country => <label key={country.code} className="mb-0 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
        <input type="checkbox" className="h-4 w-4 shrink-0 p-0 shadow-none" checked={value.includes(country.code)} onChange={() => toggle(country.code)} />
        <span>{country.name}</span>
      </label>)}
      {!visible.length && <p className="px-2 text-sm">No countries found.</p>}
    </div>
    <span role="status" className="sr-only">{visible.length} countries shown; {value.length} selected</span>
  </fieldset>
}
