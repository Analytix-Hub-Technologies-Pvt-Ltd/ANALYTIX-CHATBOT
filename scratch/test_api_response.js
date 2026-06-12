const axios = require('axios');
const BASE_URL = 'http://localhost:3000';

async function test() {
  const loginRes = await axios.post(`${BASE_URL}/api/super/login`, {
    username: 'superadmin',
    password: 'superadmin123'
  });
  const token = loginRes.data.token;
  const adminsRes = await axios.get(`${BASE_URL}/api/super/admins`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const admins = adminsRes.data;
  for (const admin of admins) {
    if (admin.conversations) {
      const conv = admin.conversations.find(c => c.id === 'conv-test-verify');
      if (conv) {
        console.log("Found conv in API response:", conv);
      }
    }
  }
}

test().catch(console.error);
