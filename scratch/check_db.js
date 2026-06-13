const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

for (const [botId, bot] of Object.entries(data.bots)) {
  console.log(`Bot ID: ${botId}`);
  console.log(`  Website: ${bot.settings ? bot.settings.website : 'none'}`);
  console.log(`  companyAddress: ${bot.settings ? bot.settings.companyAddress : 'none'}`);
  console.log(`  adminEmail: ${bot.settings ? bot.settings.adminEmail : 'none'}`);
  console.log(`  companyPhone: ${bot.settings ? bot.settings.companyPhone : 'none'}`);
  console.log(`  companyServices: ${bot.settings ? bot.settings.companyServices : 'none'}`);
}
