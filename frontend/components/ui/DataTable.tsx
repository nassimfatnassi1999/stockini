'use client'

import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string | number
  footer?: React.ReactNode
}

export function DataTable<T>({ columns, data, keyExtractor, footer }: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={keyExtractor(row)}>
              {columns.map((col) => (
                <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                  {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          {footer}
        </div>
      )}
    </div>
  )
}

interface PaginationProps {
  page: number
  total: number
  pageSize?: number
  onPage: (p: number) => void
}

export function Pagination({ page, total, pageSize = 10, onPage }: PaginationProps) {
  const pages = Math.ceil(total / pageSize)
  const shown = Math.min(3, pages)
  const pageNums = Array.from({ length: shown }, (_, i) => i + 1)

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button
        className="btn btn-ghost"
        style={{ padding: '0 10px', height: 28, fontSize: 11 }}
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page === 1}
      >
        Précédent
      </button>
      {pageNums.map((p) => (
        <button
          key={p}
          className={cn('btn btn-ghost', p === page && 'active-page')}
          style={{
            padding: '0 10px', height: 28, fontSize: 11,
            background: p === page ? 'var(--accent-dim)' : undefined,
            color: p === page ? 'var(--accent2)' : undefined,
          }}
          onClick={() => onPage(p)}
        >
          {p}
        </button>
      ))}
      <button
        className="btn btn-ghost"
        style={{ padding: '0 10px', height: 28, fontSize: 11 }}
        onClick={() => onPage(Math.min(pages, page + 1))}
        disabled={page === pages}
      >
        Suivant
      </button>
    </div>
  )
}
