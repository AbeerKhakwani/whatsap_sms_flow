// scripts/hash-password.mjs
//
// Generate a bcrypt hash for an admin password, to paste into the ADMIN_USERS env var.
// Raw passwords never touch the codebase — only the hash is stored.
//
// Usage:  node scripts/hash-password.mjs "the-password"
//
// Then build ADMIN_USERS (one entry per admin) and set it in Vercel:
//   [{"email":"abeerkhakwani@gmail.com","name":"Abeer","hash":"<hash>"},
//    {"email":"faqiha@example.com","name":"Faqiha","hash":"<hash>"}]

import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "<password>"');
  process.exit(1);
}

console.log(bcrypt.hashSync(password, 10));
