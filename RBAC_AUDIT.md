# RBAC_AUDIT.md — Stockini Permissions System Audit

**Date:** 2026-05-15  
**Auditeur:** Principal Fullstack Engineer  
**Périmètre:** Backend NestJS + Frontend Next.js

---

## Résumé Exécutif

Le système RBAC/Permissions comporte **8 bugs critiques** qui rendent les permissions de l'interface utilisateur inefficaces ou ignorées. Le problème principal : les overrides utilisateur-spécifiques ne sont **jamais persistés** (méthodes stub), et plusieurs contrôleurs contournent le système de permissions avec des rôles hardcodés.

---

## 1. BACKEND — Bugs Critiques

### BUG-001 — UsersController : @Roles('ADMIN') hardcodé

| Champ | Valeur |
|-------|--------|
| Fichier | `backend/src/users/users.controller.ts` |
| Endpoints | `GET/POST/PATCH/DELETE /users` |
| Permission attendue | `users.view`, `users.create`, `users.update`, `users.delete` |
| Permission vérifiée | `role === 'ADMIN'` (hardcodé) |
| **Problème** | Un utilisateur avec `users.view` mais rôle non-ADMIN obtient 403 |
| **Risque sécurité** | MEDIUM — verrouillage excessif, mais crée fausse impression de contrôle fin |
| **Correction** | Remplacer `@Roles('ADMIN')` + `RolesGuard` par `@RequirePermissions('users.*')` + `PermissionsGuard` |
| **Priorité** | **HIGH** |

---

### BUG-002 — TrashController : Aucun guard de permissions

| Champ | Valeur |
|-------|--------|
| Fichier | `backend/src/trash/trash.controller.ts` |
| Endpoints | `GET /trash`, `PATCH /trash/:entity/:id/restore`, `DELETE /trash/:entity/:id/permanent` |
| Permission attendue | `trash.view`, `trash.restore`, `trash.permanent_delete` |
| Permission vérifiée | **AUCUNE** (uniquement `JwtAuthGuard`) |
| **Problème** | Tout utilisateur authentifié peut lire la corbeille, restaurer et supprimer définitivement |
| **Risque sécurité** | **HIGH** — tout employé peut supprimer définitivement des données sans restriction |
| **Correction** | Ajouter `PermissionsGuard` + `@RequirePermissions` sur chaque endpoint |
| **Priorité** | **HIGH** |

---

### BUG-003 — DocumentsController : Permissions sales.* au lieu de documents.*

| Champ | Valeur |
|-------|--------|
| Fichier | `backend/src/documents/documents.controller.ts` |
| Endpoints | `GET/POST/PUT/DELETE /documents`, `/documents/:id/download`, `/documents/:id/send-email` |
| Permission attendue | `documents.view`, `documents.create`, `documents.download`, `documents.email` |
| Permission vérifiée | `sales.view`, `sales.create`, `sales.update`, `sales.delete` |
| **Problème** | Impossible de donner accès aux documents sans donner accès aux ventes. Les permissions `documents.*` de l'UI n'ont aucun effet sur ces endpoints. |
| **Risque sécurité** | MEDIUM — couplage non intentionnel des modules |
| **Correction** | Créer permissions `documents.*` dédiées et les appliquer |
| **Priorité** | **HIGH** |

---

### BUG-004 — RbacService.userOverrides() : Méthode stub

| Champ | Valeur |
|-------|--------|
| Fichier | `backend/src/rbac/rbac.service.ts` (lignes 435–456) |
| Endpoints | `GET /rbac/users/:userId/overrides`, `PUT /rbac/users/overrides`, `DELETE /rbac/users/:userId/overrides/:code` |
| Permission attendue | Lire/écrire les overrides utilisateur depuis la DB |
| Permission vérifiée | **STUB** — `userOverrides()` retourne toujours `[]`, `setUserOverride()` ne persiste rien |
| **Problème** | **Toute la fonctionnalité "Exceptions par utilisateur" de l'UI Permissions est non-fonctionnelle.** Les overrides ALLOW/DENY n'ont aucun effet. |
| **Risque sécurité** | **CRITICAL** — fausse impression de sécurité. Un admin croit révoquer un accès via DENY mais l'utilisateur conserve l'accès. |
| **Correction** | Ajouter modèle `UserPermission` en DB, implémenter les 3 méthodes |
| **Priorité** | **CRITICAL** |

---

### BUG-005 — Prisma Schema : Pas de modèle UserPermission

| Champ | Valeur |
|-------|--------|
| Fichier | `backend/prisma/schema.prisma` |
| Modèle attendu | `UserPermission` avec `userId`, `permissionCode`, `effect` (ALLOW/DENY) |
| Modèle existant | **ABSENT** |
| **Problème** | Aucune table pour stocker les overrides utilisateur-spécifiques |
| **Risque sécurité** | CRITICAL (dépendance de BUG-004) |
| **Correction** | Ajouter le modèle + migration + relation User |
| **Priorité** | **CRITICAL** |

---

### BUG-006 — AuthService.me/login : N'applique pas les overrides utilisateur

| Champ | Valeur |
|-------|--------|
| Fichier | `backend/src/auth/auth.service.ts` (lignes 43, 84, 166) |
| Logique attendue | `permissions = role.permissions + user.overrides(ALLOW) - user.overrides(DENY)` |
| Logique actuelle | `permissions = role.permissions` uniquement |
| **Problème** | Même si les overrides étaient persistés (BUG-004 corrigé), ils ne seraient jamais appliqués au token/session |
| **Risque sécurité** | CRITICAL — DENY overrides contournables |
| **Correction** | Utiliser `getEffectivePermissions(userId)` dans `me()`, `login()`, `refreshToken()` |
| **Priorité** | **CRITICAL** |

---

### BUG-007 — ALL_PERMISSIONS : Permissions manquantes dans le catalogue

| Champ | Valeur |
|-------|--------|
| Fichier | `backend/src/rbac/rbac.service.ts` |
| Permissions utilisées dans les controllers | `caisse.view`, `caisse.operate`, `caisse.admin`, `stock.reset` |
| Permissions absentes du catalogue | `caisse.view`, `caisse.operate`, `caisse.admin`, `stock.reset`, `documents.view`, `documents.create`, `documents.update`, `documents.delete`, `documents.download`, `documents.email` |
| **Problème** | Ces permissions ne peuvent pas être assignées via l'UI Permissions car elles n'apparaissent pas dans la liste |
| **Risque sécurité** | MEDIUM — impossible de gérer finement la caisse et les documents |
| **Correction** | Ajouter toutes les permissions manquantes à `ALL_PERMISSIONS` |
| **Priorité** | **HIGH** |

---

### BUG-008 — PermissionsGuard : Permissions lues depuis JWT statique

| Champ | Valeur |
|-------|--------|
| Fichier | `backend/src/auth/guards/permissions.guard.ts` |
| Comportement | Lit `user.permissions` du JWT (figé au login) |
| **Problème** | Si un admin modifie les permissions d'un rôle, l'utilisateur doit se re-connecter pour que les nouveaux droits soient appliqués par le guard |
| **Risque sécurité** | MEDIUM — délai de propagation des révoques de permissions |
| **Correction** | Appeler `getEffectivePermissions(userId)` depuis la DB à chaque requête (avec cache court), ou invalider les sessions actives |
| **Priorité** | **MEDIUM** |

---

## 2. FRONTEND — Bugs Critiques

### BUG-F001 — hasPermission() lit des données stale depuis localStorage

| Champ | Valeur |
|-------|--------|
| Fichier | `frontend/src/lib/auth.ts` |
| **Problème** | `hasPermission()` lit `auth_user.permissions` du localStorage, qui est fixé au login. Aucun mécanisme de refresh après modification des permissions. |
| **Risque** | MEDIUM — un admin retire un droit à un utilisateur, mais l'utilisateur voit toujours le menu et peut accéder à la page jusqu'au prochain login |
| **Correction** | Créer `usePermissions()` hook qui lit depuis React Query (`/auth/me`), avec invalidation forcée après modification |
| **Priorité** | **HIGH** |

---

### BUG-F002 — Page Permissions : Ne recharge pas /auth/me après sauvegarde

| Champ | Valeur |
|-------|--------|
| Fichier | `frontend/src/app/(dashboard)/admin/permissions/page.tsx` |
| **Problème** | Après `PUT /rbac/roles/:role/permissions`, le frontend ne refetch pas `/auth/me` ni n'invalide le cache. Si l'admin modifie ses propres permissions, elles ne s'appliquent pas avant re-login. |
| **Risque** | MEDIUM |
| **Correction** | Après sauvegarde, appeler `queryClient.invalidateQueries(['auth/me'])` + mettre à jour `auth_user` localStorage |
| **Priorité** | **HIGH** |

---

### BUG-F003 — Sidebar : Documents item utilise permission sales.view

| Champ | Valeur |
|-------|--------|
| Fichier | `frontend/src/components/shared/AppSidebar.tsx` (ligne 71) |
| Permission configurée | `sales.view` |
| Permission attendue | `documents.view` |
| **Problème** | Donner `documents.view` sans `sales.view` ne fait pas apparaître le menu Documents |
| **Risque** | LOW |
| **Correction** | Remplacer par `permission: 'documents.view'` |
| **Priorité** | **MEDIUM** |

---

### BUG-F004 — Pas de composant <Can> ni hook usePermissions()

| Champ | Valeur |
|-------|--------|
| **Problème** | Aucun composant déclaratif pour masquer les boutons/actions selon permissions. Les pages utilisent des `if (hasPermission(...))` manuels non-réactifs. |
| **Correction** | Créer `usePermissions()` hook + `<Can>` / `<CanAny>` components |
| **Priorité** | **MEDIUM** |

---

### BUG-F005 — Page Utilisateurs : Pas de guard de permission

| Champ | Valeur |
|-------|--------|
| Fichier | `frontend/src/app/(dashboard)/admin/users/page.tsx` |
| **Problème** | La page ne vérifie pas `users.view` avant de charger. Sans le guard backend (BUG-001 corrigé), tout utilisateur authentifié peut accéder à `/admin/users` |
| **Correction** | Ajouter `<ProtectedPage permission="users.view">` ou vérification en tête de page |
| **Priorité** | **MEDIUM** |

---

### BUG-F006 — UserOverridesTab : GET /users échoue pour non-ADMIN

| Champ | Valeur |
|-------|--------|
| Fichier | `frontend/src/app/(dashboard)/admin/permissions/page.tsx` (ligne 266) |
| **Problème** | `api.get('/users')` requiert le rôle ADMIN (BUG-001). Un utilisateur avec `permissions.view` mais rôle non-ADMIN voit un onglet vide. |
| **Correction** | Résolu automatiquement quand BUG-001 est corrigé (`users.view` suffira) |
| **Priorité** | **HIGH** (dépend BUG-001) |

---

## 3. Matrice de Risque

| ID | Description | Impact | Facilité d'exploit | Priorité |
|----|-------------|--------|-------------------|----------|
| BUG-004/005 | User overrides non fonctionnels | CRITICAL | Trivial (UI visible) | **CRITICAL** |
| BUG-006 | Me/login n'applique pas les overrides | CRITICAL | Trivial | **CRITICAL** |
| BUG-002 | TrashController sans guards | HIGH | Trivial (tout user auth) | **HIGH** |
| BUG-001 | UsersController hardcodé ADMIN | HIGH | MEDIUM | **HIGH** |
| BUG-003 | Documents utilise sales.* | HIGH | MEDIUM | **HIGH** |
| BUG-007 | Permissions manquantes catalogue | MEDIUM | N/A (admin only) | **HIGH** |
| BUG-008 | Permissions JWT stale côté guard | MEDIUM | Requiert délai | **MEDIUM** |
| BUG-F001 | hasPermission stale localStorage | MEDIUM | Requiert délai | **HIGH** |
| BUG-F002 | Permissions page no refetch | MEDIUM | Trivial | **HIGH** |
| BUG-F003 | Sidebar Documents mauvaise perm | LOW | N/A | **MEDIUM** |

---

## 4. Plan de Correction

### Phase 1 — DB (migration)
- Ajouter modèle `UserPermission` (userId, permissionCode, effect: ALLOW/DENY)

### Phase 2 — Backend
- Ajouter permissions manquantes au catalogue
- Implémenter `getEffectivePermissions(userId)` dans RbacService
- Implémenter persistence dans `userOverrides/setUserOverride/removeUserOverride`
- Mettre à jour `AuthService.me()` et `login()` 
- Corriger `UsersController` → `PermissionsGuard`
- Corriger `TrashController` → ajouter `PermissionsGuard`
- Corriger `DocumentsController` → permissions `documents.*`
- Créer `permission-map.ts` source unique
- Mettre à jour seed

### Phase 3 — Frontend
- Créer `usePermissions()` hook (React Query + invalidation)
- Créer `<Can>` / `<CanAny>` composants
- Corriger sidebar (Documents + Documentation)
- Corriger page Permissions (refetch après save)
- Créer page Documentation
- Ajouter guards sur pages sensibles
