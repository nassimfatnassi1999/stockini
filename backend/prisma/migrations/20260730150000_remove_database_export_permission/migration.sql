DELETE FROM "UserPermission"
WHERE "permissionCode" = 'database.export';

UPDATE "Role"
SET "permissions" = "permissions" - 'database.export'
WHERE "permissions" @> '["database.export"]'::jsonb;
