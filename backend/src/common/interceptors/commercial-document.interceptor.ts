import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { commercialTotalFinal } from '../utils/commercial-document';

type JsonRecord = Record<string, unknown>;

function enrich(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => enrich(item, seen));
    return value;
  }

  const record = value as JsonRecord;
  Object.values(record).forEach((item) => enrich(item, seen));

  // stampDuty is the discriminator: only persisted commercial-document
  // snapshots are enriched, never arbitrary report objects with a `total`.
  if ('stampDuty' in record && 'subtotal' in record && 'tax' in record && 'total' in record) {
    record.totalHT = record.subtotal;
    record.totalTVA = record.tax;
    record.totalTTC = record.total;
    record.totalFinal = commercialTotalFinal(
      record.total as number | string | { toString(): string },
      record.stampDuty as number | string | { toString(): string },
    );
  }
  return value;
}

@Injectable()
export class CommercialDocumentInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => enrich(data)));
  }
}
