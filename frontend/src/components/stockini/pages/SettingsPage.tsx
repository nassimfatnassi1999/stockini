'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import type { DropdownOption } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { RowActions } from '../shared/RowActions';
import { StateRows } from '../shared/StateRows';
import { Status } from '../shared/Status';
import { cleanPayload, emptyForm } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

function DropdownOptionsManager({ loading, options }: { loading: boolean; options: DropdownOption[] }) {
  const queryClient = useQueryClient();
  const categories = Array.from(new Set([
    'customer_types',
    'payment_methods',
    'payment_types',
    'stock_operation_types',
    'stock_movement_reasons',
    'sale_statuses',
    'purchase_statuses',
    'payment_statuses',
    'report_types',
    'alert_types',
    'units',
    'stock_locations',
    ...options.map((option) => option.category),
  ])).sort();
  const [selectedCategory, setSelectedCategory] = useState(categories[0] ?? 'customer_types');
  const [editing, setEditing] = useState<DropdownOption | null>(null);
  const fields: FieldConfig[] = [
    { name: 'category', label: 'Catégorie', required: true },
    { name: 'label', label: 'Libellé', required: true },
    { name: 'value', label: 'Valeur', required: true },
    { name: 'sortOrder', label: 'Ordre', type: 'number' },
    { name: 'active', label: 'Actif', type: 'checkbox' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>({ category: selectedCategory, label: '', value: '', sortOrder: '0', active: true });
  const visibleOptions = options.filter((option) => option.category === selectedCategory);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stockini-dropdown-options'] });
    queryClient.invalidateQueries({ queryKey: ['stockini-dropdown-options', selectedCategory] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      return editing?.id
        ? stockiniApi.updateDropdownOption(editing.id, payload)
        : stockiniApi.createDropdownOption(payload);
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      setForm({ category: selectedCategory, label: '', value: '', sortOrder: '0', active: true });
      toast.success('Option enregistrée');
    },
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => stockiniApi.toggleDropdownOption(id, active),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteDropdownOption,
    onSuccess: () => {
      invalidate();
      toast.success('Option supprimée');
    },
    onError: () => toast.error("Option utilisée: désactivez-la au lieu de la supprimer."),
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 p-4">
        <div>
          <CardTitle>Listes déroulantes</CardTitle>
          <p className="mt-1 text-sm text-text-secondary">Options actives triées par ordre puis libellé dans les formulaires.</p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing({} as DropdownOption);
            setForm({ category: selectedCategory, label: '', value: '', sortOrder: String(visibleOptions.length + 1), active: true });
          }}
        >
          <Plus size={14} />
          Ajouter
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${category === selectedCategory ? 'bg-primary/10 font-semibold text-primary' : 'text-text-secondary hover:bg-muted'}`}
            >
              <span>{category}</span>
              <span className="font-mono text-xs">{options.filter((option) => option.category === category).length}</span>
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead>Valeur</TableHead>
                <TableHead>Ordre</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <StateRows loading={loading} error={null} empty={visibleOptions.length === 0} colSpan={5} />
              {visibleOptions.map((option) => (
                <TableRow key={option.id}>
                  <TableCell className="font-medium">{option.label}</TableCell>
                  <TableCell className="font-mono text-xs">{option.value}</TableCell>
                  <TableCell className="font-mono">{option.sortOrder}</TableCell>
                  <TableCell><Status value={option.active ? 'ACTIVE' : 'DISABLED'} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: option.id, active: !option.active })}>
                        {option.active ? 'Désactiver' : 'Activer'}
                      </Button>
                      <RowActions
                        onEdit={() => {
                          setEditing(option);
                          setForm({ category: option.category, label: option.label, value: option.value, sortOrder: String(option.sortOrder), active: option.active });
                        }}
                        onDelete={() => {
                          if (window.confirm('Supprimer cette option ?')) {
                            deleteMutation.mutate(option.id);
                          }
                        }}
                        deleting={deleteMutation.isPending}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {editing && (
        <CrudModal
          title={editing.id ? 'Modifier option' : 'Nouvelle option'}
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          saving={saveMutation.isPending}
        />
      )}
    </Card>
  );
}

function MiniList({ title, items, loading, error }: { title: string; items: string[]; loading: boolean; error: unknown }) {
  return (
    <Card className="shadow-card">
      <CardHeader className="p-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {loading && <p className="text-sm text-text-secondary">Chargement...</p>}
        {Boolean(error) && <p className="text-sm text-red-600">Chargement impossible.</p>}
        {!loading && !error && items.length === 0 && <p className="text-sm text-text-secondary">Aucune donnée.</p>}
        {items.map((item) => (
          <div key={item} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-text-primary">
            {item}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EditableMiniList({
  deleteItem,
  fields,
  items,
  loading,
  queryKey,
  saveItem,
  title,
}: {
  deleteItem: (item: Record<string, any>) => Promise<unknown>;
  fields: FieldConfig[];
  items: Array<Record<string, any>>;
  loading: boolean;
  queryKey: string;
  saveItem: (item: Record<string, any>, editing?: Record<string, any>) => Promise<unknown>;
  title: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const saveMutation = useMutation({
    mutationFn: () => saveItem(cleanPayload(form, fields) as Record<string, string>, editing ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setEditing(null);
      setForm(emptyForm(fields));
      toast.success('Enregistré');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Supprimé');
    },
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
        <CardTitle>{title}</CardTitle>
        <Button type="button" size="sm" onClick={() => { setEditing({}); setForm(emptyForm(fields)); }}>
          <Plus size={14} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {loading && <p className="text-sm text-text-secondary">Chargement...</p>}
        {!loading && items.length === 0 && <p className="text-sm text-text-secondary">Aucune donnée.</p>}
        {items.map((item) => (
          <div key={item.id ?? item.key ?? item.name} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-text-primary">
            <span>{item.name ?? `${item.key}: ${item.value}`}</span>
            <RowActions
              onEdit={() => {
                setEditing(item);
                setForm(item);
              }}
              onDelete={() => deleteMutation.mutate(item)}
              deleting={deleteMutation.isPending}
            />
          </div>
        ))}
      </CardContent>
      {editing && (
        <CrudModal
          title={editing.id || editing.key ? `Modifier ${title.toLowerCase()}` : `Nouveau ${title.toLowerCase()}`}
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          saving={saveMutation.isPending}
        />
      )}
    </Card>
  );
}

export function SettingsPage() {
  const settings = useQuery({ queryKey: ['stockini-settings'], queryFn: stockiniApi.settings });
  const categories = useQuery({ queryKey: ['stockini-categories'], queryFn: stockiniApi.categories });
  const brands = useQuery({ queryKey: ['stockini-brands'], queryFn: stockiniApi.brands });
  const dropdownOptions = useQuery({ queryKey: ['stockini-dropdown-options'], queryFn: stockiniApi.dropdownOptions });
  return (
    <>
      <PageHeader title="Paramètres Stockini" subtitle="Référentiels backend, catégories, marques et listes déroulantes." />
      <div className="mb-4">
        <DropdownOptionsManager loading={dropdownOptions.isLoading} options={dropdownOptions.data ?? []} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <EditableMiniList
          title="Paramètres"
          queryKey="stockini-settings"
          loading={settings.isLoading}
          items={(settings.data ?? []).map((item) => ({ key: item.key, value: item.value }))}
          fields={[{ name: 'key', label: 'Clé', required: true }, { name: 'value', label: 'Valeur', required: true }]}
          saveItem={(item, editing) => editing?.key ? stockiniApi.updateSetting(editing.key, { value: item.value }) : stockiniApi.createSetting({ key: item.key, value: item.value })}
          deleteItem={(item) => stockiniApi.deleteSetting(item.key)}
        />
        <EditableMiniList
          title="Catégories"
          queryKey="stockini-categories"
          loading={categories.isLoading}
          items={categories.data ?? []}
          fields={[{ name: 'name', label: 'Nom', required: true }, { name: 'description', label: 'Description' }]}
          saveItem={(item, editing) => editing?.id ? stockiniApi.updateCategory(editing.id, item) : stockiniApi.createCategory({ name: item.name, description: item.description })}
          deleteItem={(item) => stockiniApi.deleteCategory(item.id)}
        />
        <EditableMiniList
          title="Marques"
          queryKey="stockini-brands"
          loading={brands.isLoading}
          items={brands.data ?? []}
          fields={[{ name: 'name', label: 'Nom', required: true }]}
          saveItem={(item, editing) => editing?.id ? stockiniApi.updateBrand(editing.id, item) : stockiniApi.createBrand({ name: item.name })}
          deleteItem={(item) => stockiniApi.deleteBrand(item.id)}
        />
      </div>
    </>
  );
}

// Suppress unused warning — MiniList is defined for potential use
export { MiniList };
