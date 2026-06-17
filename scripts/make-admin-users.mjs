// scripts/make-admin-users.mjs
//
// Builds the complete ADMIN_USERS value (both admins, with hashed passwords) in one shot,
// so you don't have to assemble any JSON by hand. Passwords are hashed locally and never
// stored — only the one-way hashes appear in the output.
//
// Usage:
//   node scripts/make-admin-users.mjs "<abeer-password>" "<faqiha-password>"
//
// Then copy the printed line and paste it into Vercel as the ADMIN_USERS env var.

import bcrypt from 'bcryptjs';

const [abeerPw, faqihaPw] = process.argv.slice(2);

if (!abeerPw || !faqihaPw) {
  console.error('Usage: node scripts/make-admin-users.mjs "<abeer-password>" "<faqiha-password>"');
  process.exit(1);
}

const admins = [
  { email: 'abeerkhakwani@gmail.com', name: 'Abeer',  hash: bcrypt.hashSync(abeerPw, 10) },
  { email: 'faqiha.g@gmail.com',      name: 'Faqiha', hash: bcrypt.hashSync(faqihaPw, 10) },
];

console.log('\n✅ Copy the line below and paste it into Vercel as ADMIN_USERS:\n');
console.log(JSON.stringify(admins));
console.log('');
