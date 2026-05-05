'use client';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  filters: FilterOption[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}

export function FilterBar({ filters, active, onChange, className }: FilterBarProps) {
  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}
    >
      {filters.map((f) => {
        const isActive = f.value === active;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              border: `1.5px solid ${isActive ? '#1B4F72' : '#D5DCE8'}`,
              background: isActive ? '#1B4F72' : '#fff',
              color: isActive ? '#fff' : '#5A6A7E',
              transition: 'all 0.13s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.borderColor = '#9EB0C8';
                (e.currentTarget as HTMLElement).style.color = '#1A2332';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.borderColor = '#D5DCE8';
                (e.currentTarget as HTMLElement).style.color = '#5A6A7E';
              }
            }}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
