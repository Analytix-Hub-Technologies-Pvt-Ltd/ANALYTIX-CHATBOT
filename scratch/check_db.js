const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

for (const [botId, bot] of Object.entries(data.bots)) {
  if (bot.conversations) {
    const conv = bot.conversations.find(c => c.id === 'conv-test-verify');
    if (conv) {
      console.log(`Found conv-test-verify under botId: ${botId}`);
      console.log(`keys:`, Object.keys(conv));
      console.log(`messages:`, conv.messages);
    }
  }
}
