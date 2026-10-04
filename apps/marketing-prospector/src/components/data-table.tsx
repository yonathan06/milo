import { Fragment, useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { flexRender, getCoreRowModel, getExpandedRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, SortingState } from '@tanstack/react-table'

export type TableRecord = Record<string, unknown>

export function Status({ value }: { value: unknown }) {
  const text = String(value ?? 'unknown')
  const color = ['selected', 'completed', 'complete', 'succeeded'].includes(text) ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : ['failed', 'rejected'].includes(text) ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${color}`}>{text.replaceAll('_', ' ')}</span>
}

export function DataTable({ data, columns, label, emptyMessage, renderDetails }: {
  data: TableRecord[]
  columns: ColumnDef<TableRecord>[]
  label: string
  emptyMessage: string
  renderDetails?: (record: TableRecord) => ReactNode
}) {
  const id = useId()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const table = useReactTable({
    data, columns, state: { sorting, globalFilter }, onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter, getRowId: row => String(row.id),
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(), getRowCanExpand: () => Boolean(renderDetails),
    paginateExpandedRows: false, autoResetExpanded: false, autoResetPageIndex: false,
    initialState: { pagination: { pageSize: 10 } },
  })
  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = table.getPageCount()
  useEffect(() => {
    // Preserve the current page on background updates; clamp only when rows
    // disappear (for example, after clearing a run or changing a filter).
    const lastPage = Math.max(0, pageCount - 1)
    if (pageIndex > lastPage) table.setPageIndex(lastPage)
  }, [table, pageIndex, pageCount])
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 p-4">
      <div className="w-full sm:max-w-sm"><label className="sr-only" htmlFor={id}>Search {label.toLowerCase()}</label><input id={id} type="search" placeholder="Search…" value={globalFilter} onChange={e => setGlobalFilter(e.target.value)} /></div>
      <p className="text-sm text-slate-500" role="status">{table.getFilteredRowModel().rows.length} results</p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{label}. Use column headings to sort.</caption>
        <thead className="bg-slate-50 text-slate-500">{table.getHeaderGroups().map(group => <tr key={group.id}>
          {group.headers.map(header => <th key={header.id} scope="col" className="px-4 py-3" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}>
            {header.column.getCanSort() ? <button className="table-sort" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}<span aria-hidden="true">{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ' ↕'}</span></button> : flexRender(header.column.columnDef.header, header.getContext())}
          </th>)}
          {renderDetails && <th scope="col" className="px-4 py-3">Details</th>}
        </tr>)}</thead>
        <tbody className="divide-y divide-slate-100">{table.getRowModel().rows.map(row => <Fragment key={row.id}>
          <tr className="transition-colors hover:bg-slate-50/80">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-4 py-4 align-top">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
            {renderDetails && <td className="px-4 py-4 align-top"><button className="secondary whitespace-nowrap" aria-expanded={row.getIsExpanded()} aria-controls={`${id}-${row.id}`} onClick={row.getToggleExpandedHandler()}>{row.getIsExpanded() ? 'Hide details' : 'Review details'}</button></td>}
          </tr>
          {renderDetails && row.getIsExpanded() && <tr><td colSpan={columns.length + 1} className="bg-slate-50 p-4 sm:p-6"><div id={`${id}-${row.id}`}>{renderDetails(row.original)}</div></td></tr>}
        </Fragment>)}</tbody>
      </table>
      {table.getRowModel().rows.length === 0 && <div className="px-6 py-12 text-center"><h3>{globalFilter ? 'No results' : emptyMessage}</h3></div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm">
      <label className="flex items-center gap-2">Rows per page<select className="w-auto" value={table.getState().pagination.pageSize} onChange={e => table.setPageSize(Number(e.target.value))}>{[10, 25, 50].map(size => <option key={size}>{size}</option>)}</select></label>
      <div className="flex items-center gap-3"><button className="secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</button><span>Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span><button className="secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button></div>
    </div>
  </div>
}
