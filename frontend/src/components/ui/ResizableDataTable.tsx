'use client';

import React from 'react';
import { ResizableTable } from './ResizableTable';

interface Column<T> {
  key: keyof T | string;
  label: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  sticky?: boolean;
  render?: (value: any, row: T, index: number) => React.ReactNode;
}

interface ResizableDataTableProps<T = any> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
  tableId?: string;
  className?: string;
  style?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  rowStyle?: React.CSSProperties;
  onRowClick?: (row: T, index: number) => void;
  onRowHover?: (row: T, index: number, isHovering: boolean) => void;
}

const DEFAULT_HEADER_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#9AAFC5',
  padding: '10px 16px',
  textAlign: 'left',
  borderBottom: '2px solid #D5DCE8',
  background: '#F7F9FC',
};

const DEFAULT_CELL_STYLE: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  borderBottom: '1px solid #D5DCE8',
  verticalAlign: 'middle',
};

const DEFAULT_ROW_STYLE: React.CSSProperties = {
  cursor: 'pointer',
};

/**
 * Tableau de données avec colonnes redimensionnables
 * 
 * @example
 * ```tsx
 * <ResizableDataTable
 *   tableId="clients"
 *   data={clients}
 *   columns={[
 *     { key: 'referenceInterne', label: 'Référence', minWidth: 100 },
 *     { key: 'nom', label: 'Client', sticky: true },
 *     { key: 'ville', label: 'Ville' },
 *   ]}
 *   onRowClick={(client) => navigate(`/clients/${client.referenceInterne}`)}
 * />
 * ```
 */
export function ResizableDataTable<T>({
  data,
  columns,
  loading = false,
  emptyMessage = 'Aucune donnée',
  tableId = 'default',
  className,
  style,
  headerStyle = DEFAULT_HEADER_STYLE,
  rowStyle = DEFAULT_ROW_STYLE,
  onRowClick,
  onRowHover,
}: ResizableDataTableProps<T>) {
  const handleRowMouseEnter = (row: T, index: number) => {
    if (onRowHover) {
      onRowHover(row, index, true);
    }
    // Effet de survol par défaut
    const rowElement = document.querySelector(`[data-row-index="${index}"]`) as HTMLTableRowElement;
    if (rowElement) {
      Array.from(rowElement.cells).forEach((td) => {
        (td as HTMLTableCellElement).style.background = '#F0F6FF';
      });
    }
  };

  const handleRowMouseLeave = (row: T, index: number) => {
    if (onRowHover) {
      onRowHover(row, index, false);
    }
    // Effet de survol par défaut
    const rowElement = document.querySelector(`[data-row-index="${index}"]`) as HTMLTableRowElement;
    if (rowElement) {
      Array.from(rowElement.cells).forEach((td) => {
        (td as HTMLTableCellElement).style.background = '';
      });
    }
  };

  const getCellAlignment = (align?: string) => {
    switch (align) {
      case 'center':
        return 'center';
      case 'right':
        return 'right';
      default:
        return 'left';
    }
  };

  const renderCell = (column: Column<T>, row: T, index: number) => {
    const value = row[column.key as keyof T];
    
    if (column.render) {
      return column.render(value, row, index);
    }

    // Formatage par défaut pour certains types
    if (value === null || value === undefined) {
      return '—';
    }

    if (typeof value === 'boolean') {
      return value ? 'Oui' : 'Non';
    }

    if (value instanceof Date) {
      return value.toLocaleDateString('fr-FR');
    }

    return String(value);
  };

  if (loading) {
    return (
      <ResizableTable tableId={tableId} className={className} style={style}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)} style={headerStyle}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #D5DCE8' }}>
                {columns.map((_, j) => (
                  <td key={j} style={DEFAULT_CELL_STYLE}>
                    <div 
                      className="rounded animate-pulse" 
                      style={{ height: 14, width: '70%', background: '#F0F4F8' }} 
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ResizableTable>
    );
  }

  if (data.length === 0) {
    return (
      <ResizableTable tableId={tableId} className={className} style={style}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)} style={headerStyle}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td 
                colSpan={columns.length} 
                style={{ 
                  ...DEFAULT_CELL_STYLE, 
                  textAlign: 'center', 
                  color: '#9AAFC5', 
                  padding: '48px 16px' 
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          </tbody>
        </table>
      </ResizableTable>
    );
  }

  return (
    <ResizableTable tableId={tableId} className={className} style={style}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th 
                key={String(column.key)} 
                style={{
                  ...headerStyle,
                  ...(column.width && { width: column.width }),
                  ...(column.minWidth && { minWidth: column.minWidth }),
                  ...(column.maxWidth && { maxWidth: column.maxWidth }),
                  ...(column.sticky && { 
                    position: 'sticky', 
                    left: 0, 
                    zIndex: 10,
                    background: '#F7F9FC',
                  }),
                  textAlign: getCellAlignment(column.align),
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={index}
              data-row-index={index}
              style={{
                ...DEFAULT_ROW_STYLE,
                ...rowStyle,
              }}
              onMouseEnter={() => handleRowMouseEnter(row, index)}
              onMouseLeave={() => handleRowMouseLeave(row, index)}
              onClick={(e) => { if ((e.target as HTMLElement).closest('[data-action]')) return; onRowClick?.(row, index); }}
              onMouseDown={(e) => { if ((e.target as HTMLElement).closest('[data-action]')) e.stopPropagation(); }}
            >
              {columns.map((column) => (
                <td
                  key={String(column.key)}
                  style={{
                    ...DEFAULT_CELL_STYLE,
                    ...(column.width && { width: column.width }),
                    ...(column.minWidth && { minWidth: column.minWidth }),
                    ...(column.maxWidth && { maxWidth: column.maxWidth }),
                    ...(column.sticky && { 
                      position: 'sticky', 
                      left: 0, 
                      zIndex: 5,
                      background: '#fff',
                    }),
                    textAlign: getCellAlignment(column.align),
                  }}
                >
                  {renderCell(column, row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ResizableTable>
  );
}

export default ResizableDataTable;
