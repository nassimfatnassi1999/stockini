'use client';

import { useQuery } from '@tanstack/react-query';
import { stockiniApi } from '@/lib/stockini/api';
import { money, statusLabel } from '@/lib/stockini/format';
import type { Customer } from '@/lib/stockini/types';
import { Identity } from '../shared/Identity';
import { SimpleTable } from '../shared/SimpleTable';

export function CustomersPage() {
  const query = useQuery({ queryKey: ['stockini-customers'], queryFn: stockiniApi.customers });
  const data = query.data ?? [];
  return (
    <SimpleTable
      title="Clients"
      subtitle="Clients particuliers, garages et sociétés issus du backend."
      loading={query.isLoading}
      error={query.error}
      headers={['Référence', 'Client', 'Type', 'Téléphone', 'Email', 'Crédit']}
      rows={data.map((customer: Customer) => [
        <span key="reference" className="font-mono font-semibold">{customer.reference}</span>,
        <Identity key="name" name={customer.name} />,
        statusLabel(customer.type),
        customer.phone ?? '-',
        customer.email ?? '-',
        money(customer.creditBalance),
      ])}
    />
  );
}
