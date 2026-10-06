import { Link } from '@tanstack/solid-router';
import { createEffect, For, on, Show } from 'solid-js';
import { sortFn_alphanumeric, sortFn_text, sortFn_basic, createColumnHelper, createTable, createPaginatedRowModel, createSortedRowModel, rowPaginationFeature, rowSortingFeature, tableFeatures } from '@tanstack/solid-table';
import { matchLabel, permissionLabel } from '../assessment-display';
import type { AllResultDiscovery, SegmentResult } from '../server/store';
import type { ResultsPageRequest } from '../results-page';
import { Badge, ExternalLink } from './ui';

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature, sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, basic: sortFn_basic }, sortedRowModel: createSortedRowModel(), paginatedRowModel: createPaginatedRowModel() });
const helper = createColumnHelper<typeof features, SegmentResult>();
const segmentDiscoveries = (result: SegmentResult) => result.discoveries.filter((item): item is AllResultDiscovery => 'segment_id' in item && 'segment_name' in item);
const columns = helper.columns([
  helper.accessor((result) => result.match_score ?? undefined, {
    id: 'fit', header: 'Match score', sortFn: sortFn_basic, sortUndefined: 'last',
    cell: (info) => <div><Badge>{matchLabel(info.row.original)}</Badge><Show when={info.row.original.match_confidence}><p class="mt-1 text-xs text-slate-500">{info.row.original.match_confidence} confidence</p></Show></div>,
  }),
  helper.accessor((result) => result.posting_permission ?? 'unknown', { id: 'posting', header: 'Posting permission', cell: (info) => <Badge>{permissionLabel(info.getValue())}</Badge> }),
  helper.accessor((result) => result.admin_contact_permission ?? 'unknown', { id: 'adminContact', header: 'Admin contact', cell: (info) => <Badge>{permissionLabel(info.getValue())}</Badge> }),
  helper.accessor((result) => result.title || result.url, {
    id: 'result', header: 'Result',
    cell: (info) => <div class="min-w-64 max-w-md">
      <Link to="/results/$resultId" params={{ resultId: String(info.row.original.id) }} class="font-semibold break-words hover:text-teal-700">{info.getValue()}</Link>
      <p class="mt-2 text-xs leading-5 break-words text-slate-500">{info.row.original.description || 'No description recorded.'}</p>
      <div class="mt-2 text-xs"><ExternalLink url={info.row.original.url} /></div>
    </div>,
  }),
  helper.accessor((result) => [...new Set(result.discoveries.map((item) => item.country_code))].sort().join(', '), {
    id: 'countries', header: 'Countries',
    cell: (info) => <div class="flex flex-wrap gap-1"><For each={info.getValue().split(', ').filter(Boolean)}>{(code) => <Badge>{code}</Badge>}</For><Show when={!info.getValue()}><span class="text-xs text-slate-400">No linked countries</span></Show></div>,
  }),
  helper.accessor((result) => [...new Set(segmentDiscoveries(result).map((item) => item.segment_name))].sort().join(', '), {
    id: 'segments', header: 'Segments',
    cell: (info) => <ul class="min-w-40 space-y-2"><For each={[...new Map(segmentDiscoveries(info.row.original).map((item) => [item.segment_id, item])).values()]}>{(item) => <li><Link to="/segments/$segmentId" params={{ segmentId: String(item.segment_id) }} class="text-teal-700 hover:underline">{item.segment_name}</Link></li>}</For><Show when={!info.getValue()}><li class="text-xs text-slate-400">No linked segments</li></Show></ul>,
  }),
  helper.accessor((result) => result.discoveries.map((item) => item.query).join(', '), {
    id: 'queries', header: 'Discovery queries',
    cell: (info) => <ul class="min-w-40 max-w-sm space-y-2"><For each={info.row.original.discoveries}>{(item) => <li><Link to="/queries/$queryId" params={{ queryId: String(item.query_id) }} class="break-words text-teal-700 hover:underline">{item.query}</Link><p class="mt-1 text-xs text-slate-400">{item.country_code} · {item.language} · Rank {item.rank}</p></li>}</For></ul>,
  }),
  helper.accessor((result) => result.discoveries[0]?.collected_at ?? '', {
    id: 'collected', header: 'Last collected',
    cell: (info) => <span class="whitespace-nowrap text-xs text-slate-500">{info.getValue() || 'Not recorded'}</span>,
  }),
]);

export function ResultsTable(props: { results: SegmentResult[]; context: 'segments' | 'queries'; caption: string; serverPaginated?: boolean; sort?: ResultsPageRequest['sort']; descending?: boolean; onSort?: (column: ResultsPageRequest['sort']) => void }) {
  const table = createTable({
    features,
    get columns() { return columns.filter((column) => column.id !== (props.context === 'segments' ? 'queries' : 'segments')); },
    get data() { return props.results; },
    getRowId: (row) => String(row.id),
    get manualPagination() { return !!props.serverPaginated; },
    get manualSorting() { return !!props.serverPaginated; },
    initialState: { pagination: { pageIndex: 0, pageSize: 25 }, sorting: [{ id: 'fit', desc: true }] },
  });
  createEffect(on(() => props.results, () => table.firstPage(), { defer: true }));
  const buttonClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

  return <>
    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table class="w-full min-w-[48rem] text-left text-sm">
        <caption class="sr-only">{props.caption}</caption>
        <thead class="border-b border-slate-200 bg-slate-50 text-xs text-slate-600"><For each={table.getHeaderGroups()}>{(group) => <tr><For each={group.headers}>{(header) => <th scope="col" class="px-5 py-3" aria-sort={props.serverPaginated ? (props.sort === header.column.id ? (props.descending ? 'descending' : 'ascending') : 'none') : header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}><button type="button" class="flex items-center gap-2" onClick={props.serverPaginated ? () => props.onSort?.(header.column.id as ResultsPageRequest['sort']) : header.column.getToggleSortingHandler()}><table.FlexRender header={header} /><span aria-hidden="true">{props.serverPaginated ? (props.sort === header.column.id ? (props.descending ? '↓' : '↑') : '↕') : header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : '↕'}</span></button></th>}</For></tr>}</For></thead>
        <tbody class="divide-y divide-slate-100"><For each={table.getRowModel().rows}>{(row) => <tr class="align-top hover:bg-slate-50"><For each={row.getAllCells()}>{(cell) => <td class="px-5 py-4"><table.FlexRender cell={cell} /></td>}</For></tr>}</For></tbody>
      </table>
    </div>
    <Show when={!props.serverPaginated}><div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <label class="flex items-center gap-2 text-sm text-slate-600">Rows per page<select class="rounded-lg border border-slate-200 bg-white px-3 py-2" value={table.atoms.pagination.get().pageSize} onChange={(event) => { table.setPageSize(Number(event.currentTarget.value)); table.firstPage(); }}><For each={[25, 50, 100]}>{(size) => <option value={size}>{size}</option>}</For></select></label>
      <div class="flex items-center gap-3"><button type="button" class={buttonClass} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</button><span class="text-sm text-slate-500">Page {table.atoms.pagination.get().pageIndex + 1} of {table.getPageCount()}</span><button type="button" class={buttonClass} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button></div>
    </div></Show>
  </>;
}
