CREATE INDEX "Alert_createdAt_id_idx" ON "Alert"("createdAt", "id");
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt", "id");

-- Enforce the cap for every writer, including legacy services and maintenance
-- scripts which insert directly through Prisma. Advisory locks serialize the
-- AFTER INSERT cleanup across multiple application instances.
CREATE OR REPLACE FUNCTION retain_latest_alert_rows()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7310001);
  DELETE FROM "Alert"
  WHERE "id" IN (
    SELECT "id" FROM "Alert"
    ORDER BY "createdAt" DESC, "id" DESC
    OFFSET 1000
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Alert_retain_latest_rows"
AFTER INSERT ON "Alert"
FOR EACH STATEMENT EXECUTE FUNCTION retain_latest_alert_rows();

CREATE OR REPLACE FUNCTION retain_latest_audit_log_rows()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7310002);
  DELETE FROM "AuditLog"
  WHERE "id" IN (
    SELECT "id" FROM "AuditLog"
    ORDER BY "createdAt" DESC, "id" DESC
    OFFSET 1000
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_retain_latest_rows"
AFTER INSERT ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION retain_latest_audit_log_rows();
