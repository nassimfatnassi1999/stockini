-- CASHIER is stored as Role data (the schema has no UserRole enum).
-- Keep existing installations and any manually configured role untouched.
INSERT INTO "Role" ("id", "name", "permissions")
VALUES (
  'role_cashier',
  'CASHIER',
  '["dashboard.view","clients.view","sales.view","sales.view_details","sales.print","documents.view","documents.download","payments.view","payments.create","payments.receive_client_payment","caisse.view","caisse.operate","caisse.close"]'::jsonb
)
ON CONFLICT ("name") DO NOTHING;
