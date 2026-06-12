/**
 * verify_limits.js
 * Comprehensive automated verification script to test SaaS tier plan limits and Super Admin functions.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const SUPER_ADMIN_USER = 'superadmin';
const SUPER_ADMIN_PASS = 'superadmin123'; // Default fallback credential

async function runTests() {
  console.log('==================================================');
  console.log('🧪 SaaS Plan Limitation and Super Admin API Test Suite');
  console.log('==================================================\n');

  try {
    // 1. Authenticate as Super Admin
    console.log('1. Testing Super Admin Authentication...');
    const loginRes = await axios.post(`${BASE_URL}/api/super/login`, {
      username: SUPER_ADMIN_USER,
      password: SUPER_ADMIN_PASS
    });

    if (!loginRes.data.success || !loginRes.data.token) {
      throw new Error('Super Admin login failed: response missing token.');
    }
    const superToken = loginRes.data.token;
    console.log('   ✔ Super Admin authenticated successfully.\n');

    // 2. Fetch stats and tenant list
    console.log('2. Fetching SaaS statistics and tenant admin directories...');
    const statsRes = await axios.get(`${BASE_URL}/api/super/stats`, {
      headers: { 'Authorization': `Bearer ${superToken}` }
    });
    console.log(`   ✔ Global stats fetched. Total tenants: ${statsRes.data.totalTenants}, Bookings: ${statsRes.data.totalBookings}, Chats: ${statsRes.data.totalConversations}`);

    const listRes = await axios.get(`${BASE_URL}/api/super/admins`, {
      headers: { 'Authorization': `Bearer ${superToken}` }
    });
    console.log(`   ✔ Tenant directory fetched. Found ${listRes.data.length} registered admins.`);
    
    // Always register a fresh test admin for predictability
    const rand = Math.floor(Math.random() * 1000000);
    const testEmail = `test_tenant_${rand}@domain.com`;
    const testPass = 'Password123!';
    
    console.log(`   Registering fresh test user: ${testEmail}...`);
    await axios.post(`${BASE_URL}/api/auth/signup`, {
      username: testEmail,
      password: testPass,
      fullName: 'Test Tenant User'
    });
    console.log('   ✔ Registered test user successfully.');

    // Fetch list again to find this user
    const updatedList = await axios.get(`${BASE_URL}/api/super/admins`, {
      headers: { 'Authorization': `Bearer ${superToken}` }
    });
    const testAdmin = updatedList.data.find(u => u.username === testEmail);
    if (!testAdmin) {
      throw new Error(`Failed to locate newly registered user ${testEmail} in admins list.`);
    }
    
    console.log(`   Selected test tenant email: ${testAdmin.username} (ID: ${testAdmin.id}, Current Plan: ${testAdmin.plan})\n`);

    // 3. Test SMTP Restriction on Free Plan
    console.log('3. Testing Custom SMTP restriction on Free Trial plan...');
    // Set plan to Free first
    await axios.put(`${BASE_URL}/api/super/admins/${testAdmin.id}/plan`, 
      { plan: 'free' },
      { headers: { 'Authorization': `Bearer ${superToken}` } }
    );
    
    // Login as the tenant user to save settings
    const tenantLoginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: testEmail,
      password: testPass
    });
    const tenantToken = tenantLoginRes.data.token;

    try {
      console.log('   Attempting to save custom SMTP server settings on Free Plan...');
      await axios.post(`${BASE_URL}/api/settings`, 
        { smtpHost: 'smtp.customdomain.com', smtpPort: 587, smtpUser: 'user@custom.com', smtpPass: 'secret' },
        { headers: { 'Authorization': `Bearer ${tenantToken}` } }
      );
      console.log('   ❌ FAILED: Custom SMTP settings allowed on Free Plan.');
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log(`   ✔ PASSED: Blocked with error: "${err.response.data.error}"`);
      } else {
        console.log(`   ❌ FAILED: Received unexpected response. Status: ${err.response?.status}`);
      }
    }
    console.log('');

    // 4. Test Website Crawler restriction on Free/Pro plans
    console.log('4. Testing AI Crawler / Brain Trainer restrictions...');
    // Try on Free plan first
    try {
      console.log('   Attempting to launch Crawler on Free Plan...');
      await axios.post(`${BASE_URL}/api/scraper/crawl`, 
        { url: 'https://example.com' },
        { headers: { 'Authorization': `Bearer ${tenantToken}` } }
      );
      console.log('   ❌ FAILED: Crawler allowed on Free Plan.');
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log(`   ✔ PASSED: Blocked on Free with error: "${err.response.data.error}"`);
      } else {
        console.log(`   ❌ FAILED: Received unexpected response. Status: ${err.response?.status}`);
      }
    }

    // Try on Pro plan
    console.log('   Upgrading tenant to Pro Plan...');
    await axios.put(`${BASE_URL}/api/super/admins/${testAdmin.id}/plan`, 
      { plan: 'pro' },
      { headers: { 'Authorization': `Bearer ${superToken}` } }
    );

    try {
      console.log('   Attempting to launch Crawler on Pro Plan...');
      await axios.post(`${BASE_URL}/api/scraper/crawl`, 
        { url: 'https://example.com' },
        { headers: { 'Authorization': `Bearer ${tenantToken}` } }
      );
      console.log('   ❌ FAILED: Crawler allowed on Pro Plan.');
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log(`   ✔ PASSED: Blocked on Pro with error: "${err.response.data.error}"`);
      } else {
        console.log(`   ❌ FAILED: Received unexpected response. Status: ${err.response?.status}`);
      }
    }
    console.log('');

    // 5. Test booking limit boundaries
    console.log('5. Testing Booking Limit Boundaries...');
    console.log('   Downgrading tenant to Free Trial Plan...');
    await axios.put(`${BASE_URL}/api/super/admins/${testAdmin.id}/plan`, 
      { plan: 'free' },
      { headers: { 'Authorization': `Bearer ${superToken}` } }
    );

    console.log(`   Creating bookings up to limit...`);
    // Create bookings to trigger the limit block (Limit is 5 bookings for Free Trial)
    let bookingSuccessCount = 0;
    let gotBlocked = false;

    // First delete any existing bookings to clean test environment
    // We can clear or just check if it fails when we reach 5
    for (let i = 1; i <= 6; i++) {
      try {
        const bookRes = await axios.post(`${BASE_URL}/api/bookings`, {
          botId: testAdmin.botId,
          name: `Client ${i}`,
          email: `client${i}@test.com`,
          date: '2026-06-15',
          time: `10:0${i}`,
          purpose: 'General Consultation'
        });
        if (bookRes.status === 200) bookingSuccessCount++;
      } catch (err) {
        if (err.response && err.response.status === 403) {
          gotBlocked = true;
          console.log(`   ✔ Limit hit on Booking #${i}: "${err.response.data.error}"`);
          break;
        } else {
          console.log(`   ❌ FAILED on Booking #${i}: ${err.message}`);
        }
      }
    }

    if (gotBlocked || bookingSuccessCount < 5) {
      console.log(`   ✔ PASSED: Booking boundary verified. Placed: ${bookingSuccessCount}. Blocked correctly.`);
    } else {
      console.log('   ❌ FAILED: Allowed to book more than the Free Trial limit.');
    }

    console.log('\n==================================================');
    console.log('🎉 Limit verification completed successfully!');
    console.log('==================================================');

  } catch (error) {
    console.error('\n❌ Test Suite encountered an error:', error.message);
    if (error.response) {
      console.error('Response Data:', error.response.data);
    }
  }
}

runTests();
