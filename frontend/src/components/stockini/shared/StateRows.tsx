import { TableCell, TableRow } from '@/components/ui/table';

export function StateRows({ loading, error, empty, colSpan }: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  colSpan: number;
}) {
  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">Chargement...</TableCell>
      </TableRow>
    );
  }
  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-red-600">Impossible de charger les données.</TableCell>
      </TableRow>
    );
  }
  if (empty) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">Aucune donnée trouvée.</TableCell>
      </TableRow>
    );
  }
  return null;
}
