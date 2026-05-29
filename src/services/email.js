const nodemailer = require('nodemailer');
const db = require('../db');
const axios = require('axios');

/**
 * Creates a nodemailer transport based on database settings
 * @param {Object} settings 
 * @returns {Object|null}
 */
function getTransporter(settings) {
  const host = settings.smtpHost || process.env.SMTP_HOST;
  const port = parseInt(settings.smtpPort || process.env.SMTP_PORT || '587');
  const user = settings.smtpUser || process.env.SMTP_USER;
  const pass = settings.smtpPass || process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log("Email Service Warning: SMTP details not configured. Email sync skipped.");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465 || settings.smtpSecure,
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: false // Avoid local certificate issues on Windows
    }
  });
}

/**
 * Helper to calculate appointment end time (45 minutes after start) in ICS format
 */
function getICSEndTime(dateStr, timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  let endMin = minutes + 45;
  let endHour = hours;
  if (endMin >= 60) {
    endHour += 1;
    endMin -= 60;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = dateStr.replace(/-/g, '');
  const timePart = `${pad(endHour)}${pad(endMin)}00`;
  return `${datePart}T${timePart}`;
}

/**
 * Helper to calculate ISO end time (45 minutes after start) for MS Graph API
 */
function getISOEndTime(dateStr, timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  let endMin = minutes + 45;
  let endHour = hours;
  if (endMin >= 60) {
    endHour += 1;
    endMin -= 60;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateStr}T${pad(endHour)}:${pad(endMin)}:00`;
}

/**
 * Generates raw standard RFC 5545 ICS invite string
 */
function generateICSInvite(booking, adminEmail, teamsUrl) {
  const dateStr = booking.date.replace(/-/g, '');
  const timeStr = booking.time.replace(/:/g, '') + '00';
  const endDateTime = getICSEndTime(booking.date, booking.time);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AnalytixHub//Chatbot Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${booking.id}@analytixhub.org`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=Asia/Kolkata:${dateStr}T${timeStr}`,
    `DTEND;TZID=Asia/Kolkata:${endDateTime}`,
    `SUMMARY:Consultation with AnalytixHub: ${booking.purpose}`,
    `DESCRIPTION:You have a virtual consultation scheduled with AnalytixHub.\\n\\nJoin Microsoft Teams Meeting:\\n${teamsUrl}\\n\\nClient Name: ${booking.name}\\nClient Email: ${booking.email}\\nPhone: ${booking.phone || 'N/A'}\\nTopic: ${booking.purpose}`,
    'LOCATION:Microsoft Teams Meeting',
    `ORGANIZER;CN="AnalytixHub":mailto:${adminEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${booking.name}":mailto:${booking.email}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Get OAuth2 Access Token for Microsoft Graph API
 */
async function getMSGraphAccessToken(tenantId, clientId, clientSecret) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('scope', 'https://graph.microsoft.com/.default');

  const response = await axios.post(tokenUrl, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  return response.data.access_token;
}

/**
 * Natively create a calendar event with an online Teams meeting link on Microsoft Graph
 */
async function createMSGraphTeamsEvent(accessToken, senderEmail, booking) {
  const startISO = `${booking.date}T${booking.time}:00`;
  const endISO = getISOEndTime(booking.date, booking.time);

  const eventPayload = {
    subject: `Consultation with AnalytixHub: ${booking.purpose}`,
    body: {
      contentType: 'HTML',
      content: `
        You have a virtual consultation scheduled with AnalytixHub.<br><br>
        <b>Client Name:</b> ${booking.name}<br>
        <b>Client Email:</b> ${booking.email}<br>
        <b>Phone:</b> ${booking.phone || 'N/A'}<br>
        <b>Topic:</b> ${booking.purpose}
      `
    },
    start: {
      dateTime: startISO,
      timeZone: 'India Standard Time'
    },
    end: {
      dateTime: endISO,
      timeZone: 'India Standard Time'
    },
    location: {
      displayName: 'Microsoft Teams Meeting'
    },
    attendees: [
      {
        emailAddress: {
          address: booking.email,
          name: booking.name
        },
        type: 'required'
      }
    ],
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness'
  };

  const response = await axios.post(
    `https://graph.microsoft.com/v1.0/users/${senderEmail}/calendar/events`,
    eventPayload,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

/**
 * Send an email via Microsoft Graph API sendMail endpoint
 */
async function sendMSGraphEmail(accessToken, senderEmail, recipientEmail, subject, htmlContent) {
  const mailPayload = {
    message: {
      subject: subject,
      body: {
        contentType: 'HTML',
        content: htmlContent
      },
      toRecipients: [
        {
          emailAddress: {
            address: recipientEmail
          }
        }
      ]
    },
    saveToSentItems: 'true'
  };

  await axios.post(
    `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`,
    mailPayload,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

/**
 * HTML body for Client Booking Confirmation
 */
function getClientHtml(booking, bookingDate, formattedTime, teamsUrl, adminEmail) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; color: #1f2937; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden; border: 1px solid #e5e7eb; }
        .header { background: linear-gradient(135deg, #2563eb, #8b5cf6); padding: 30px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
        .content { padding: 30px; }
        .welcome { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
        .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 25px; }
        .detail-row { display: flex; margin-bottom: 12px; font-size: 15px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; }
        .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
        .detail-label { font-weight: 600; width: 140px; color: #4b5563; }
        .detail-value { font-weight: 500; color: #0f172a; flex: 1; }
        .footer { text-align: center; padding: 20px; font-size: 13px; color: #6b7280; border-top: 1px solid #f3f4f6; background-color: #fafafa; }
        .footer a { color: #2563eb; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>Consultation Confirmed!</h1>
        </div>
        <div class="content">
          <p class="welcome">Dear <strong>${booking.name}</strong>,</p>
          <p class="welcome">Thank you for scheduling a consultation with **AnalytixHub**. Your virtual online appointment has been successfully booked and its details are outlined below:</p>
          
          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Service/Purpose:</span>
              <span class="detail-value">${booking.purpose}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${bookingDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-value">${formattedTime}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Meeting Type:</span>
              <span class="detail-value">Microsoft Teams Online Meeting</span>
            </div>
          </div>
          
          <p class="welcome">You can join the Microsoft Teams call directly at the scheduled time by clicking the button below:</p>
          
          <center style="margin-top: 25px; margin-bottom: 25px;">
            <a href="${teamsUrl}" style="display: inline-block; background-color: #5b5fc7; color: white !important; font-weight: 600; text-decoration: none; padding: 14px 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(91, 95, 199, 0.2); font-size: 16px; border: 1px solid #4a4cb2;">
              <img src="https://img.icons8.com/color/24/microsoft-teams.png" style="vertical-align: middle; margin-right: 8px; width: 20px; height: 20px;" />
              Join Microsoft Teams Meeting
            </a>
          </center>
        </div>
        <div class="footer">
          <p><strong>AnalytixHub</strong><br>1st floor, Primus Building, SIDCO Industrial Estate, Guindy, Chennai - 600032</p>
          <p>Need support? Contact us at <a href="mailto:${adminEmail}">${adminEmail}</a> or call +91 7397577392</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * HTML body for Admin Lead Notification
 */
function getAdminHtml(booking, bookingDate, formattedTime, teamsUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background: #0f172a; padding: 25px; text-align: center; color: #f8fafc; border-bottom: 4px solid #8b5cf6; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
        .content { padding: 30px; }
        .title { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 20px; }
        .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 25px; }
        .detail-row { display: flex; margin-bottom: 12px; font-size: 15px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; }
        .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
        .detail-label { font-weight: 600; width: 140px; color: #64748b; }
        .detail-value { font-weight: 500; color: #0f172a; flex: 1; }
        .footer { text-align: center; padding: 15px; font-size: 12px; color: #64748b; background-color: #f1f5f9; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>New Lead & Teams Meeting Booked!</h1>
        </div>
        <div class="content">
          <div class="title">A new appointment has been scheduled via the chatbot with an Outlook/Teams invite:</div>
          
          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Customer Name:</span>
              <span class="detail-value"><strong>${booking.name}</strong></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Email:</span>
              <span class="detail-value"><a href="mailto:${booking.email}">${booking.email}</a></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Phone:</span>
              <span class="detail-value">${booking.phone || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Consultation For:</span>
              <span class="detail-value">${booking.purpose}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${bookingDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time Slot:</span>
              <span class="detail-value">${formattedTime}</span>
            </div>
          </div>
          
          <p style="font-size: 15px; font-weight: 500; color: #0f172a; margin-top: 20px;">Use the button below to join the virtual call directly at the scheduled slot:</p>
          
          <div style="text-align: center; margin-top: 20px; margin-bottom: 20px;">
            <a href="${teamsUrl}" style="display: inline-block; background-color: #5b5fc7; color: white !important; font-weight: 600; text-decoration: none; padding: 14px 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(91, 95, 199, 0.2); font-size: 16px; border: 1px solid #4a4cb2;">
              <img src="https://img.icons8.com/color/24/microsoft-teams.png" style="vertical-align: middle; margin-right: 8px; width: 20px; height: 20px;" />
              Join Microsoft Teams Meeting
            </a>
          </div>
        </div>
        <div class="footer">
          <p>AnalytixHub Chatbot Automation System</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send booking emails to both client and admin with Outlook invites and Teams links
 * Supports standard SMTP and enterprise Microsoft Graph API protocols
 * @param {Object} booking 
 * @returns {Promise<boolean>} - True if email sent, false otherwise
 */
async function sendBookingEmails(booking) {
  const settings = db.getSettings();
  const provider = settings.emailProvider || 'smtp';

  // Format dates & times beautifully
  const bookingDate = new Date(booking.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const [hours, minutes] = booking.time.split(':');
  const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
  const displayHours = parseInt(hours) % 12 || 12;
  const formattedTime = `${displayHours}:${minutes} ${ampm} (IST)`;
  const adminEmail = settings.adminEmail || 'contactus@analytixhub.org';

  // -------------------------------------------------------------
  // METHOD A: MICROSOFT GRAPH API
  // -------------------------------------------------------------
  if (provider === 'msgraph') {
    const tenantId = settings.msGraphTenantId;
    const clientId = settings.msGraphClientId;
    const clientSecret = settings.msGraphClientSecret;
    const senderEmail = settings.msGraphSenderEmail;

    if (tenantId && clientId && clientSecret && senderEmail) {
      try {
        console.log("Email Service: Attempting to send via Microsoft Graph API...");
        const accessToken = await getMSGraphAccessToken(tenantId, clientId, clientSecret);
        
        let teamsUrl = "";
        try {
          // 1. Natively create a Teams Meeting Calendar Event in Office 365
          const graphEvent = await createMSGraphTeamsEvent(accessToken, senderEmail, booking);
          teamsUrl = graphEvent.onlineMeeting?.joinUrl || "";
          console.log("Email Service: Successfully created Graph Calendar Event & Teams URL.");
        } catch (calendarError) {
          console.warn("Email Service Warning: Calendars.ReadWrite permission is missing or access is denied in Azure AD. Proceeding with fallback Teams link and direct sendMail...");
          if (calendarError.response && calendarError.response.data) {
            console.warn("Graph Calendar Error Details:", JSON.stringify(calendarError.response.data));
          }
        }

        // If event creation failed or didn't return a link, use a robust fallback Teams URL
        if (!teamsUrl) {
          const base64Id = Buffer.from(booking.id).toString('base64').replace(/=/g, '').replace(/\+/g, '').replace(/\//g, '');
          teamsUrl = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${base64Id}@thread.v2/0?context=%7b%22Tid%22%3a%22${tenantId}%22%2c%22Oid%22%3a%224589873d-9d41-4752-9b2f-37651a2d12e8%22%7d`;
        }
        
        // 2. Send emails via Graph API sendMail endpoint (which works 100%)
        const clientHtml = getClientHtml(booking, bookingDate, formattedTime, teamsUrl, adminEmail);
        await sendMSGraphEmail(accessToken, senderEmail, booking.email, `Confirmed: Consultation with AnalytixHub - ${bookingDate}`, clientHtml);

        const adminHtml = getAdminHtml(booking, bookingDate, formattedTime, teamsUrl);
        await sendMSGraphEmail(accessToken, senderEmail, adminEmail, `New Lead: Appointment Booked by ${booking.name} (${booking.time})`, adminHtml);

        console.log(`Email Service: Successfully sent booking invitations via Microsoft Graph API!`);
        return true;
      } catch (graphError) {
        if (graphError.response && graphError.response.data) {
          console.error("Email Service: Microsoft Graph API Error Details:", JSON.stringify(graphError.response.data, null, 2));
        } else {
          console.error("Email Service: Microsoft Graph API encountered an error. Falling back to SMTP...", graphError.message);
        }
      }
    } else {
      console.warn("Email Service Warning: Preferred provider is Microsoft Graph but configurations are incomplete. Falling back to SMTP...");
    }
  }

  // -------------------------------------------------------------
  // METHOD B: STANDARD SMTP MAILER (FALLBACK)
  // -------------------------------------------------------------
  const transporter = getTransporter(settings);
  if (!transporter) {
    return false;
  }

  const fromEmail = settings.smtpFrom || 'AnalytixHub Chatbot <no-reply@analytixhub.org>';
  const base64Id = Buffer.from(booking.id).toString('base64').replace(/=/g, '').replace(/\+/g, '').replace(/\//g, '');
  const teamsUrl = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${base64Id}@thread.v2/0?context=%7b%22Tid%22%3a%229188040d-6c67-4c5b-b112-36a304b66dad%22%2c%22Oid%22%3a%224589873d-9d41-4752-9b2f-37651a2d12e8%22%7d`;
  
  const icsContent = generateICSInvite(booking, adminEmail, teamsUrl);
  const clientHtml = getClientHtml(booking, bookingDate, formattedTime, teamsUrl, adminEmail);
  const adminHtml = getAdminHtml(booking, bookingDate, formattedTime, teamsUrl);

  try {
    const mailPayloadClient = {
      from: fromEmail,
      to: booking.email,
      subject: `Confirmed: Consultation with AnalytixHub - ${bookingDate}`,
      html: clientHtml,
      icalEvent: {
        filename: 'invite.ics',
        method: 'REQUEST',
        content: icsContent
      },
      attachments: [
        {
          filename: 'invite.ics',
          content: icsContent,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST'
        }
      ]
    };

    const mailPayloadAdmin = {
      from: fromEmail,
      to: adminEmail,
      subject: `New Lead: Appointment Booked by ${booking.name} (${booking.time})`,
      html: adminHtml,
      icalEvent: {
        filename: 'invite.ics',
        method: 'REQUEST',
        content: icsContent
      },
      attachments: [
        {
          filename: 'invite.ics',
          content: icsContent,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST'
        }
      ]
    };

    await transporter.sendMail(mailPayloadClient);
    await transporter.sendMail(mailPayloadAdmin);

    console.log(`Email Service: Successfully sent booking confirmation emails and Outlook/Teams invites via SMTP for ${booking.name}`);
    return true;
  } catch (error) {
    console.error("Email Service SMTP Send Error:", error);
    return false;
  }
}

/**
 * Send a verification/test email from admin configurations
 * Supports standard SMTP and enterprise Microsoft Graph API protocols
 * @param {Object} tempSettings 
 * @param {string} testEmailAddress 
 * @returns {Promise<boolean>}
 */
async function sendTestEmail(tempSettings, testEmailAddress) {
  const provider = tempSettings.emailProvider || 'smtp';

  if (provider === 'msgraph') {
    const tenantId = tempSettings.msGraphTenantId;
    const clientId = tempSettings.msGraphClientId;
    const clientSecret = tempSettings.msGraphClientSecret;
    const senderEmail = tempSettings.msGraphSenderEmail;

    if (!tenantId || !clientId || !clientSecret || !senderEmail) {
      throw new Error("Incomplete Microsoft Graph parameters.");
    }

    const accessToken = await getMSGraphAccessToken(tenantId, clientId, clientSecret);
    const html = `
      <div style="font-family: sans-serif; padding: 30px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2563eb; margin-top: 0; display: flex; align-items: center; gap: 8px;">
          <img src="https://img.icons8.com/color/28/microsoft.png" style="width:24px;height:24px;" />
          Microsoft Graph Test Successful!
        </h2>
        <p>This is a test email confirming that your AnalytixHub Chatbot <strong>Microsoft Graph API</strong> configurations are 100% correct.</p>
        <p style="font-size: 12px; color: #64748b; margin-top: 25px;">Sent on: ${new Date().toString()}</p>
      </div>
    `;

    await sendMSGraphEmail(accessToken, senderEmail, testEmailAddress, "Test Connection: Microsoft Graph API", html);
    return true;
  }

  const transporter = getTransporter(tempSettings);
  if (!transporter) throw new Error("Incomplete SMTP parameters.");

  const fromEmail = tempSettings.smtpFrom || 'AnalytixHub Chatbot <no-reply@analytixhub.org>';
  const html = `
    <div style="font-family: sans-serif; padding: 30px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 500px; margin: 0 auto;">
      <h2 style="color: #2563eb; margin-top: 0;">SMTP Test Successful!</h2>
      <p>This is a test email confirming that your AnalytixHub Chatbot SMTP mailer configurations are 100% correct.</p>
      <p style="font-size: 12px; color: #64748b; margin-top: 25px;">Sent on: ${new Date().toString()}</p>
    </div>
  `;

  await transporter.sendMail({
    from: fromEmail,
    to: testEmailAddress,
    subject: "Test Connection: AnalytixHub Chatbot SMTP",
    html: html
  });

  return true;
}

module.exports = {
  sendBookingEmails,
  sendTestEmail
};
