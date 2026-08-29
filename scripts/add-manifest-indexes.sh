#!/bin/bash
# Migration: Add missing indexes defined in the schema (shipping_manifests,
# shipment_manifests, client_account_manifests, shipments, shipment_items).
# Bypasses `drizzle-kit push` because it crashes on MariaDB 10.11.x
# (TypeError: Cannot read properties of undefined (reading 'checkConstraint')).
#
# Run on the server: bash scripts/add-manifest-indexes.sh
# (loads DATABASE_URL from artifacts/api-server/.env automatically)

set -e

ENV_FILE="/root/starkvector/artifacts/api-server/.env"
DB_URL=$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d'=' -f2-)

# mysql://user:pass@host:port/dbname
DB_USER=$(echo "$DB_URL" | sed -E 's#mysql://([^:]+):.*#\1#')
DB_PASS=$(echo "$DB_URL" | sed -E 's#mysql://[^:]+:([^@]+)@.*#\1#')
DB_HOST=$(echo "$DB_URL" | sed -E 's#.*@([^:/]+).*#\1#')
DB_PORT=$(echo "$DB_URL" | sed -E 's#.*:([0-9]+)/.*#\1#')
DB_NAME=$(echo "$DB_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')

MYSQL="mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME"

echo "🔎 DB: $DB_NAME @ $DB_HOST:$DB_PORT (user: $DB_USER)"
echo ""
add_index() {
  local table="$1" idx="$2" cols="$3"
  local exists
  exists=$($MYSQL -sN -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='$table' AND INDEX_NAME='$idx';" 2>/dev/null)
  if [ "$exists" != "0" ]; then
    echo "✅ $table.$idx already exists — skip"
  else
    echo "➕ $table.$idx ($cols)"
    $MYSQL -e "CREATE INDEX \`$idx\` ON \`$table\` ($cols);" 2>&1
  fi
}

# ── shipping_manifests ───────────────────────────────────────────────
add_index shipping_manifests idx_shipping_manifests_tenant_id "tenant_id"
add_index shipping_manifests idx_shipping_manifests_status "status"
add_index shipping_manifests idx_shipping_manifests_shipping_company_id "shipping_company_id"

# ── shipping_manifest_orders ─────────────────────────────────────────
add_index shipping_manifest_orders idx_smo_manifest_id "manifest_id"
add_index shipping_manifest_orders idx_smo_order_id "order_id"

# ── shipment_manifests ───────────────────────────────────────────────
add_index shipment_manifests idx_shipment_manifests_tenant_id "tenant_id"
add_index shipment_manifests idx_shipment_manifests_status "status"
add_index shipment_manifests idx_shipment_manifests_shipping_company_id "shipping_company_id"
add_index shipment_manifests idx_shipment_manifests_client_id "client_id"

# ── shipment_manifest_items ──────────────────────────────────────────
add_index shipment_manifest_items idx_smi_manifest_id "manifest_id"
add_index shipment_manifest_items idx_smi_shipment_id "shipment_id"

# ── client_account_manifests ─────────────────────────────────────────
add_index client_account_manifests idx_client_account_manifests_tenant_id "tenant_id"
add_index client_account_manifests idx_client_account_manifests_status "status"
add_index client_account_manifests idx_client_account_manifests_client_id "client_id"

# ── client_account_manifest_items ────────────────────────────────────
add_index client_account_manifest_items idx_cami_manifest_id "manifest_id"
add_index client_account_manifest_items idx_cami_shipment_id "shipment_id"

# ── shipment_items ────────────────────────────────────────────────────
add_index shipment_items idx_shipment_items_shipment_id "shipment_id"
add_index shipment_items idx_shipment_items_tenant_id "tenant_id"

echo ""
echo "🎉 Done. Current indexes on the affected tables:"
for t in shipping_manifests shipping_manifest_orders shipment_manifests shipment_manifest_items client_account_manifests client_account_manifest_items shipment_items; do
  echo "--- $t ---"
  $MYSQL -e "SHOW INDEX FROM \`$t\`;" 2>/dev/null | awk '{print $3}' | sort -u | grep -v '^$'
done
