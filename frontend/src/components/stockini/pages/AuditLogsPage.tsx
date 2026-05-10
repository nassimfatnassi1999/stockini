'use client';

import { useQuery } from '@tanstack/react-query';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime } from '@/lib/stockini/format';
import type { AuditLog } from '@/lib/stockini/types';
import { SimpleTable } from '../shared/SimpleTable';

export function AuditLogsPage() {
  const query = useQuery({ queryKey: ['stockini-audit-logs'], queryFn: stockiniApi.auditLogs });
  const data = query.data ?? [];
  return (
    <SimpleTable
      title="Audit logs"
      subtitle="Journal des actions backend sur les entités métier."
      loading={query.isLoading}
      error={query.error}
      headers={['Date', 'Action', 'Entité', 'Identifiant', 'Utilisateur']}
      rows={data.map((log: AuditLog) => [
        dateTime(log.createdAt),
        log.action,
        log.entity,
        log.entityId ?? '-',
        log.user?.fullName ?? log.user?.email ?? '-',
      ])}
    />
  );
}
