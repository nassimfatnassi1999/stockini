'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { stockiniApi } from '@/lib/stockini/api';
import { money, statusLabel } from '@/lib/stockini/format';
import type { Customer } from '@/lib/stockini/types';
import { Identity } from '../shared/Identity';
import { SimpleTable } from '../shared/SimpleTable';
import { SearchBox } from '../shared/SearchBox';
import { PageHeader } from '../shared/PageHeader';
import { useUrlPagination } from '@/hooks/useUrlPagination';
import { getValidPage } from '@/lib/data-table-pagination';

export function CustomersPage() {
  const { page, limit, search, setSearch, urlSearch, updateParams } = useUrlPagination();
  const query = useQuery({
    queryKey: ['stockini-customers-page', page, limit, urlSearch],
    queryFn: ({ signal }) =>
      stockiniApi.customerPage({ page, limit, search: urlSearch || undefined }, signal),
    placeholderData: (previous) => previous,
  });
  const data = query.data?.data ?? [];
  const pagination = query.data?.pagination;
  useEffect(() => {
    if (pagination && page > Math.max(pagination.totalPages, 1)) {
      updateParams({ page: getValidPage(page, pagination.totalPages) }, 'replace');
    }
  }, [page, pagination, updateParams]);
  return (
    <>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <PageHeader title="Clients" subtitle="Clients particuliers, garages et sociétés issus du backend." />
      <SearchBox value={search} onChange={setSearch} placeholder="Rechercher un client…" />
    </div>
    <SimpleTable
      title=""
      subtitle=""
      loading={query.isPending}
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
      pagination={{
        page,
        limit,
        totalItems: pagination?.totalItems ?? 0,
        totalPages: pagination?.totalPages ?? 0,
        disabled: query.isFetching,
        onPageChange: (next) => updateParams({ page: next }),
        onLimitChange: (next) => updateParams({ limit: next, page: 1 }),
      }}
    />
    </>
  );
}
