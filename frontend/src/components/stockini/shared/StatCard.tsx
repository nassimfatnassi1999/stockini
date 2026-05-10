import { Card, CardContent } from '@/components/ui/card';

export function StatCard({ icon: Icon, label, value, tone = 'primary' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  tone?: 'primary' | 'accent' | 'green' | 'red';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  }[tone];

  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">{label}</p>
          <p className="mt-1 truncate font-mono text-xl font-bold text-text-primary">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
