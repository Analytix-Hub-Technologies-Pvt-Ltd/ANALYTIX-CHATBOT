const axios = require('c:\\Users\\Hp\\Pictures\\ah_chatbot_1\\node_modules\\axios');
const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

async function runTest() {
  console.log("=== Testing Super Admin REST API ===");

  try {
    // 1. Log in as Super Admin
    console.log("Logging in as Super Admin...");
    const loginRes = await axios.post(`${BASE_URL}/api/super/login`, {
      username: 'superadmin',
      password: 'superadmin123'
    });

    const token = loginRes.data.token;
    assert.ok(token, "Token should be returned on successful login");
    console.log("✓ Success: Super Admin login succeeded!");

    // 2. Fetch tenant list
    console.log("Fetching tenant admins list...");
    const adminsRes = await axios.get(`${BASE_URL}/api/super/admins`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const admins = adminsRes.data;
    assert.ok(Array.isArray(admins), "Response should be an array of tenants");
    console.log(`✓ Success: Retrieved ${admins.length} tenant admins!`);

    // 3. Find our conversation in the returned tenant conversations list
    let foundConv = null;
    for (const admin of admins) {
      if (admin.conversations && Array.isArray(admin.conversations)) {
        const match = admin.conversations.find(c => c.id === 'conv-test-verify');
        if (match) {
          foundConv = match;
          break;
        }
      }
    }

    assert.ok(foundConv, "Test conversation 'conv-test-verify' should be present in the returned list");
    console.log("Found Conversation Metadata in Super Admin API response:", JSON.stringify(foundConv, null, 2));

    // Verify fields
    assert.strictEqual(foundConv.visitorName, 'Alex');
    assert.strictEqual(foundConv.visitorEmail, 'alex@google.com');
    assert.strictEqual(foundConv.visitorPhone, '+1 650 253 0000');
    assert.strictEqual(foundConv.visitorCompany, 'Google');
    assert.strictEqual(foundConv.visitorNeeds, 'Generative AI solutions');
    assert.strictEqual(foundConv.messages, undefined, "Messages array must be excluded to keep payload lightweight");
    
    console.log("✓ Success: Super Admin API returns correct visitor details and excludes messages successfully!");

  } catch (err) {
    console.error("✗ Test Failed:", err.message);
    if (err.response) {
      console.error("Response data:", err.response.data);
    }
    process.exit(1);
  }
}

runTest();
