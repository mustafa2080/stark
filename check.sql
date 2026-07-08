SELECT so.id, so.so_number, so.status, m.manifest_id
FROM sale_orders so
LEFT JOIN sale_order_manifest_items m ON m.sale_order_id = so.id
WHERE so.client_name = (SELECT name FROM clients WHERE id = 21)
ORDER BY so.id DESC LIMIT 30;
