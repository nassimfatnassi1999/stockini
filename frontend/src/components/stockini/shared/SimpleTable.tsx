import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from './PageHeader';
import { StateRows } from './StateRows';
import {
  DataTablePagination,
  type DataTablePaginationProps,
} from '@/components/ui/DataTablePagination';

export function SimpleTable({ title, subtitle, headers, rows, loading, error, pagination }: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: React.ReactNode[][];
  loading: boolean;
  error: unknown;
  pagination?: DataTablePaginationProps;
}) {
  return (
    <>
      {title && <PageHeader title={title} subtitle={subtitle} />}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header} className={header.toLowerCase() === 'actions' ? 'text-right' : undefined}>
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <StateRows loading={loading} error={error} empty={rows.length === 0} colSpan={headers.length} />
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      className={headers[cellIndex]?.toLowerCase() === 'actions' ? 'text-right' : undefined}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pagination && pagination.totalItems > 0 && (
            <DataTablePagination {...pagination} disabled={pagination.disabled || loading} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
