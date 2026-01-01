const fs = require('fs');
const { parse } = require('csv-parse/sync');

const clientsCsv = fs.readFileSync('/Users/ak/Downloads/clients_csv - clients (1).csv', 'utf-8');
const productsCsv = fs.readFileSync('/Users/ak/Downloads/The_Phir_Story_items_ Circle_ Hand - The_Phir_Story_items (3).csv', 'utf-8');

const clients = parse(clientsCsv, { columns: true, skip_empty_lines: true, relax_quotes: true });
const products = parse(productsCsv, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

console.log('=== CLIENTS CSV ===');
console.log('Total clients:', clients.length);

// Create client map
const clientMap = new Map();
for (const c of clients) {
  clientMap.set(c.clientId, c);
}

console.log('\n=== PRODUCTS CSV ===');
console.log('Total products:', products.length);

// Count products by inventory status
const statusCounts = {};
for (const p of products) {
  const status = p.inventoryStatus || 'unknown';
  statusCounts[status] = (statusCounts[status] || 0) + 1;
}
console.log('\nBy inventory status:');
Object.entries(statusCounts).forEach(([status, count]) => {
  console.log(`  ${status}: ${count}`);
});

// Count valid products by client
const productsByClient = {};
let invalidClients = 0;
for (const p of products) {
  const client = p.client;
  if (!client || client.includes('<') || isNaN(parseInt(client))) {
    invalidClients++;
    continue;
  }
  if (!productsByClient[client]) {
    productsByClient[client] = [];
  }
  productsByClient[client].push(p);
}

console.log('\n=== MATCHING ===');
console.log('Products with invalid client IDs:', invalidClients);
console.log('Unique clients with products:', Object.keys(productsByClient).length);

// Check which clients have products
let clientsWithProducts = 0;
let clientsWithoutProducts = 0;
const missingClients = [];

for (const [clientId, client] of clientMap) {
  if (productsByClient[clientId]) {
    clientsWithProducts++;
  } else {
    clientsWithoutProducts++;
    if (missingClients.length < 10) {
      missingClients.push(`${clientId}: ${client.email}`);
    }
  }
}

console.log('Clients in clients.csv with products:', clientsWithProducts);
console.log('Clients in clients.csv WITHOUT products:', clientsWithoutProducts);

if (missingClients.length > 0) {
  console.log('\nSample clients without products:');
  missingClients.forEach(c => console.log(`  ${c}`));
}

// Check for products referencing clients not in clients.csv
const orphanProducts = [];
for (const [clientId, prods] of Object.entries(productsByClient)) {
  if (!clientMap.has(clientId)) {
    orphanProducts.push(`Client ${clientId}: ${prods.length} products`);
  }
}

if (orphanProducts.length > 0) {
  console.log('\nProducts referencing clients NOT in clients.csv:');
  orphanProducts.forEach(o => console.log(`  ${o}`));
}
