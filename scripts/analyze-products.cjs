const fs = require('fs');
const { parse } = require('csv-parse/sync');
const products = parse(fs.readFileSync('/Users/ak/Downloads/The_Phir_Story_items_ Circle_ Hand - The_Phir_Story_items (3).csv', 'utf-8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

console.log('=== COLUMNS ===');
console.log(Object.keys(products[0]).join(', '));

console.log('\n=== SAMPLE PRODUCT ===');
console.log(JSON.stringify(products[0], null, 2));

console.log('\n=== BY STATUS (with retail prices) ===');
const byStatus = {};
for (const p of products) {
  const status = p.inventoryStatus || 'unknown';
  if (!byStatus[status]) byStatus[status] = { count: 0, totalRetail: 0, items: [] };
  byStatus[status].count++;
  byStatus[status].totalRetail += parseFloat(p.retailPrice || 0);
  if (status.includes('SOLD')) byStatus[status].items.push(p);
}
for (const [status, data] of Object.entries(byStatus)) {
  console.log(status + ': ' + data.count + ' items, total retail $' + data.totalRetail.toFixed(0));
}

console.log('\n=== SOLD ITEMS DETAIL ===');
for (const [status, data] of Object.entries(byStatus)) {
  if (status.includes('SOLD') && data.items.length > 0) {
    console.log('\n' + status + ':');
    for (const item of data.items) {
      const retail = parseFloat(item.retailPrice || 0);
      const split = parseFloat(item.splitForCustomer || 0);
      const sellerEarns = retail * (split / 100);
      console.log('  - ' + item.title.slice(0, 40) + ' | Retail: $' + retail + ' | Split: ' + split + '% | Seller earns: $' + sellerEarns.toFixed(0));
    }
  }
}

// Count unique clients with any products
const clients = new Set();
for (const p of products) {
  if (p.client) clients.add(p.client);
}
console.log('\n=== SUMMARY ===');
console.log('Total products:', products.length);
console.log('Unique clients with products:', clients.size);
