'use client';

import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { KpiDefinitionKey } from '@/lib/kpi-definitions';
import { MetricInfoTooltip } from './MetricInfoTooltip';

export type KpiColor = 'default' | 'blue' | 'purple' | 'amber' | 'teal' | 'green' | 'orange' | 'red' | 'slate';

interface Props {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  color?: KpiColor;
  metric?: KpiDefinitionKey;
  period?: string;
  filtersActive?: boolean;
  sub?: string;
  trend?: number | null;
  trendPositiveWhen?: 'up' | 'down';
  variant?: 'dashboard' | 'report';
}

export function KpiCard({
  icon: Icon, label, value, sub, trend, color = 'default', metric, period = 'Période affichée',
  filtersActive, trendPositiveWhen = 'up', variant = 'dashboard',
}: Props) {
  const iconBg: Record<KpiColor, string> = {
    default: 'bg-slate-100 text-slate-500', slate: 'bg-slate-100 text-slate-500',
    blue: 'bg-blue-100 text-blue-600', purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600', teal: 'bg-teal-100 text-teal-600',
    green: 'bg-emerald-100 text-emerald-600', orange: 'bg-orange-100 text-orange-600',
    red: 'bg-red-100 text-red-600',
  };
  const renderCard = (triggerProps?: React.HTMLAttributes<HTMLDivElement> & { ref?: React.RefObject<HTMLDivElement> }, infoButton?: React.ReactNode) => (
        <div {...triggerProps} className="h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ring focus-visible:ring-offset-2">
          <Card className="h-full border-border/80 shadow-card transition-shadow hover:shadow-card-hover">
            <CardContent className={variant === 'report' ? 'flex h-full min-h-36 flex-col p-5' : 'p-5'}>
              <div className="flex items-start justify-between gap-2">
                <div className={`rounded-xl p-2.5 ${iconBg[color]}`}><Icon aria-hidden="true" size={18} /></div>
                <div className="flex items-center gap-1">
                  {infoButton}
                  {trend !== undefined && (trend === null ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">—</span>
                  ) : (() => {
                    const favorable = trendPositiveWhen === 'up' ? trend >= 0 : trend <= 0;
                    return <span aria-label={`${trend >= 0 ? 'Hausse' : 'Baisse'} de ${Math.abs(trend)} %`} className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${favorable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {trend >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(trend)}%
                    </span>;
                  })())}
                </div>
              </div>
              <div className={variant === 'report' ? 'mt-auto pt-4' : 'mt-4'}>
                <p className={`${variant === 'report' ? 'truncate text-xl' : 'text-2xl'} font-bold leading-tight text-text-primary`}>{value}</p>
                <p className="mt-0.5 text-xs font-medium text-text-secondary">{label}</p>
                {sub && <p className="mt-1 text-[11px] text-text-muted">{sub}</p>}
              </div>
            </CardContent>
          </Card>
        </div>
  );
  if (!metric) return renderCard();
  return (
    <MetricInfoTooltip metric={metric} period={period} filtersActive={filtersActive}>
      {(triggerProps, infoButton) => renderCard(triggerProps, infoButton)}
    </MetricInfoTooltip>
  );
}
