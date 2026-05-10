'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { hasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Permission {
  code: string;
  module: string;
  action: string;
  description: string;
}

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string | { name: string };
  isActive: boolean;
}

interface Override {
  code: string;
  module: string;
  action: string;
  granted: boolean;
}

const ROLES = [
  { value: 'ADMIN',            label: 'Administrateur' },
  { value: 'STOCK_MANAGER',    label: 'Responsable stock' },
  { value: 'SELLER',           label: 'Vendeur' },
  { value: 'PURCHASE_MANAGER', label: 'Responsable achats' },
];

// Display order for module sections
const MODULE_ORDER = [
  'dashboard',
  'clients',
  'products',
  'sales',
  'purchases',
  'suppliers',
  'stock',
  'payments',
  'expenses',
  'reports',
  'alerts',
  'settings',
  'audit_logs',
  'permissions',
  'users',
  'trash',
];

const MODULE_LABELS: Record<string, string> = {
  dashboard:   'Tableau de bord',
  clients:     'Clients',
  products:    'Produits',
  sales:       'Ventes',
  purchases:   'Achats',
  suppliers:   'Fournisseurs',
  stock:       'Stock',
  payments:    'Paiements clients',
  expenses:    'Dépenses / Paiements fournisseurs',
  reports:     'Rapports',
  alerts:      'Alertes',
  settings:    'Paramètres',
  audit_logs:  'Audit logs',
  permissions: 'Permissions',
  users:       'Utilisateurs',
  trash:       'Corbeille',
};

const ACTION_LABELS: Record<string, string> = {
  view:                   'Consulter',
  create:                 'Créer',
  update:                 'Modifier',
  delete:                 'Supprimer',
  create_order:           'Créer commande',
  create_receipt:         'Créer bon de réception',
  create_invoice:         'Créer facture',
  validate_receipt:       'Valider réception',
  pay_supplier:           'Payer fournisseur',
  receive_client_payment: 'Encaisser client',
  adjust:                 'Ajuster stock',
  transfer:               'Transférer stock',
  'movements.view':       'Voir mouvements',
  'financial.view':       'Voir rapports financiers',
  export:                 'Exporter',
  allow_low_margin:       'Autoriser marge < 20%',
  view_details:           'Voir détails',
  restore:                'Restaurer',
  permanent_delete:       'Supprimer définitivement',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByModule(perms: Permission[]): Record<string, Permission[]> {
  return perms.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

// ─── Tab: Role Permissions ────────────────────────────────────────────────────

function RolePermissionsTab({ permissions }: { permissions: Permission[] }) {
  const [selectedRole, setSelectedRole] = useState('ADMIN');
  const [roleCodes, setRoleCodes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadRolePerms = useCallback(async (role: string) => {
    const res = await api.get<Permission[]>(`/rbac/roles/${role}/permissions`);
    setRoleCodes(new Set(res.data.map((p) => p.code)));
  }, []);

  useEffect(() => { loadRolePerms(selectedRole); }, [selectedRole, loadRolePerms]);

  function togglePerm(code: string) {
    setRoleCodes((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
    setSaved(false);
  }

  function toggleModule(moduleCodes: string[]) {
    const allChecked = moduleCodes.every((c) => roleCodes.has(c));
    setRoleCodes((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        moduleCodes.forEach((c) => next.delete(c));
      } else {
        moduleCodes.forEach((c) => next.add(c));
      }
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await api.put(`/rbac/roles/${selectedRole}/permissions`, {
        role: selectedRole,
        permissionCodes: [...roleCodes],
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const grouped = groupByModule(permissions);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {ROLES.map((r) => (
          <Button
            key={r.value}
            onClick={() => { setSelectedRole(r.value); setSaved(false); }}
            variant={selectedRole === r.value ? 'default' : 'outline'}
            size="sm"
          >
            {r.label}
          </Button>
        ))}
      </div>

      <Card className="mb-4">
        <CardContent className="py-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Rôle sélectionné :</span>{' '}
          {ROLES.find((r) => r.value === selectedRole)?.label} — Cochez les permissions accordées à ce rôle.
          Les Super Admin ont toutes les permissions sans restriction.
        </CardContent>
      </Card>

      <div className="space-y-4">
        {MODULE_ORDER.filter((m) => grouped[m]).map((module) => {
          const moduleCodes = grouped[module].map((p) => p.code);
          const allChecked = moduleCodes.every((c) => roleCodes.has(c));
          const someChecked = !allChecked && moduleCodes.some((c) => roleCodes.has(c));

          return (
            <Card key={module}>
              <CardHeader className="py-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={allChecked}
                    data-state={someChecked ? 'indeterminate' : undefined}
                    onCheckedChange={() => toggleModule(moduleCodes)}
                    id={`module-${module}`}
                    className={someChecked ? 'opacity-60' : ''}
                  />
                  <Label htmlFor={`module-${module}`} className="text-base font-semibold cursor-pointer">
                    {MODULE_LABELS[module] ?? module}
                  </Label>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {grouped[module].map((perm) => (
                    <div
                      key={perm.code}
                      className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
                    >
                      <Checkbox
                        checked={roleCodes.has(perm.code)}
                        onCheckedChange={() => togglePerm(perm.code)}
                        id={`perm-${perm.code}`}
                      />
                      <Label htmlFor={`perm-${perm.code}`} className="text-sm cursor-pointer">
                        {actionLabel(perm.action)}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer les permissions'}
        </Button>
        {saved && (
          <span className="text-sm text-green-700 font-medium">✓ Permissions enregistrées</span>
        )}
      </div>
    </div>
  );
}

// ─── Tab: User Overrides ──────────────────────────────────────────────────────

function UserOverridesTab({ permissions }: { permissions: Permission[] }) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get<User[]>('/users').then((r) => setUsers(r.data));
  }, []);

  async function selectUser(userId: string) {
    setSelectedUserId(userId);
    setSelectedUser(users.find((u) => u.id === userId) ?? null);
    const res = await api.get<Override[]>(`/rbac/users/${userId}/overrides`);
    setOverrides(res.data);
    setMsg('');
  }

  async function setOverride(code: string, granted: boolean) {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await api.put('/rbac/users/overrides', { userId: selectedUserId, permissionCode: code, granted });
      const res = await api.get<Override[]>(`/rbac/users/${selectedUserId}/overrides`);
      setOverrides(res.data);
      setMsg('Override appliqué');
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride(code: string) {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await api.delete(`/rbac/users/${selectedUserId}/overrides/${encodeURIComponent(code)}`);
      const res = await api.get<Override[]>(`/rbac/users/${selectedUserId}/overrides`);
      setOverrides(res.data);
      setMsg('Override supprimé — permission héritée du rôle');
    } finally {
      setSaving(false);
    }
  }

  const overrideMap = new Map(overrides.map((o) => [o.code, o.granted]));
  const grouped = groupByModule(permissions);

  const selectCls = cn(
    'flex h-10 w-full max-w-sm items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  );

  return (
    <div>
      <div className="mb-6">
        <Label className="block mb-2">Sélectionner un utilisateur</Label>
        <select
          value={selectedUserId ?? ''}
          onChange={(e) => selectUser(e.target.value)}
          className={selectCls}
        >
          <option value="">-- Choisir un utilisateur --</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} ({typeof u.role === 'string' ? u.role : u.role.name}){!u.isActive ? ' — inactif' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedUser && (
        <>
          <Card className="mb-4">
            <CardContent className="py-4 text-sm text-muted-foreground">
              Rôle de base :{' '}
              <span className="font-medium text-foreground">
                {typeof selectedUser.role === 'string' ? selectedUser.role : selectedUser.role.name}
              </span>{' '}
              — Les overrides ci-dessous écrasent les permissions du rôle pour cet utilisateur.
              <span className="font-semibold text-green-700"> Forcer Oui</span> accorde même si le rôle ne l'a pas.
              <span className="font-semibold text-red-700"> Forcer Non</span> révoque même si le rôle l'a.
            </CardContent>
          </Card>

          <div className="space-y-4">
            {MODULE_ORDER.filter((m) => grouped[m]).map((module) => (
              <Card key={module}>
                <CardHeader className="py-3">
                  <CardTitle className="text-base">{MODULE_LABELS[module] ?? module}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableBody>
                      {grouped[module].map((perm) => {
                        const ov = overrideMap.get(perm.code);
                        return (
                          <TableRow key={perm.code}>
                            <TableCell className="w-48 font-medium">
                              {actionLabel(perm.action)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {perm.description}
                            </TableCell>
                            <TableCell className="text-right">
                              {ov === undefined ? (
                                <div className="flex gap-2 justify-end items-center flex-wrap">
                                  <span className="text-xs text-muted-foreground">Hérité du rôle</span>
                                  <Button size="sm" variant="secondary" onClick={() => setOverride(perm.code, true)}>
                                    Forcer Oui
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => setOverride(perm.code, false)}>
                                    Forcer Non
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex gap-2 justify-end items-center flex-wrap">
                                  <span
                                    className={cn(
                                      'text-xs font-semibold px-2 py-1 rounded-md border',
                                      ov
                                        ? 'bg-green-50 text-green-700 border-green-200'
                                        : 'bg-red-50 text-red-700 border-red-200',
                                    )}
                                  >
                                    Override : {ov ? 'Oui' : 'Non'}
                                  </span>
                                  <Button size="sm" variant="outline" onClick={() => removeOverride(perm.code)}>
                                    Retirer
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>

          {msg && <p className="mt-4 text-sm text-green-700 font-medium">{msg}</p>}
          {saving && <p className="mt-2 text-sm text-muted-foreground">Enregistrement…</p>}
        </>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function PermissionsAdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'roles' | 'users'>('roles');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasPermission('permissions.view')) {
      router.replace('/dashboard');
      return;
    }
    api.get<Permission[]>('/rbac/permissions')
      .then((r) => setPermissions(r.data))
      .catch(() => setError('Accès refusé ou erreur réseau'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Chargement des permissions…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Accès refusé</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            <p className="text-destructive font-medium">{error}</p>
            <p className="mt-2">Seuls les Super Admin et Admin peuvent gérer les permissions.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Gestion des permissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez les droits par rôle ou définissez des exceptions pour des utilisateurs spécifiques.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'roles' | 'users')}>
        <TabsList>
          <TabsTrigger value="roles">Permissions par rôle</TabsTrigger>
          <TabsTrigger value="users">Exceptions par utilisateur</TabsTrigger>
        </TabsList>
        <TabsContent value="roles">
          <RolePermissionsTab permissions={permissions} />
        </TabsContent>
        <TabsContent value="users">
          <UserOverridesTab permissions={permissions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
