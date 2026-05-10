import { initials } from '@/lib/stockini/format';

export function Identity({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-bold text-primary">
        {initials(name)}
      </span>
      <span className="font-medium">{name}</span>
    </div>
  );
}
