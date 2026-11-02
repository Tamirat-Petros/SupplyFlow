CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL
);

CREATE TABLE "refresh_tokens" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "token_hash" TEXT NOT NULL UNIQUE, "expires_at" TIMESTAMPTZ NOT NULL, "revoked_at" TIMESTAMPTZ, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens" ("user_id", "expires_at");

CREATE TABLE "roles" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT NOT NULL UNIQUE, "description" TEXT, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "permissions" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "code" TEXT NOT NULL UNIQUE, "description" TEXT);
CREATE TABLE "user_roles" ("user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "role_id" UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE, PRIMARY KEY ("user_id", "role_id"));
CREATE TABLE "role_permissions" ("role_id" UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE, "permission_id" UUID NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE, PRIMARY KEY ("role_id", "permission_id"));

CREATE TABLE "warehouses" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "address" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL);
CREATE TABLE "user_warehouses" ("user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE CASCADE, "is_default" BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY ("user_id", "warehouse_id"));

CREATE TABLE "categories" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT NOT NULL, "parent_id" UUID REFERENCES "categories"("id") ON DELETE RESTRICT, "active" BOOLEAN NOT NULL DEFAULT true, UNIQUE ("name", "parent_id"));
CREATE TABLE "products" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "sku" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "description" TEXT, "category_id" UUID REFERENCES "categories"("id") ON DELETE RESTRICT, "base_unit" TEXT NOT NULL DEFAULT 'each', "barcode" TEXT UNIQUE, "reorder_point" INTEGER, "reorder_qty" INTEGER, "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL, CHECK ("reorder_point" IS NULL OR "reorder_point" >= 0), CHECK ("reorder_qty" IS NULL OR "reorder_qty" > 0));
CREATE TABLE "suppliers" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT NOT NULL UNIQUE, "contact_name" TEXT, "email" TEXT, "phone" TEXT, "address" TEXT, "payment_terms" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL);
CREATE TABLE "customers" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT NOT NULL UNIQUE, "contact_name" TEXT, "email" TEXT, "phone" TEXT, "address" TEXT, "payment_terms" TEXT, "credit_limit" DECIMAL(18,2), "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL, CHECK ("credit_limit" IS NULL OR "credit_limit" >= 0));

CREATE TABLE "audit_events" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "actor_id" UUID REFERENCES "users"("id") ON DELETE SET NULL, "action" TEXT NOT NULL, "entity_type" TEXT NOT NULL, "entity_id" TEXT NOT NULL, "request_id" TEXT, "reason" TEXT, "before" JSONB, "after" JSONB, "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events" ("entity_type", "entity_id");
CREATE INDEX "audit_events_actor_id_occurred_at_idx" ON "audit_events" ("actor_id", "occurred_at");
