/**
 * @fileoverview Email Autodiscovery & Autoconfiguration Engine.
 * Implements Mozilla Autoconfig, Microsoft Outlook POX/JSON Autodiscover,
 * and Apple iOS/macOS .mobileconfig profile generation.
 */

import { Router } from 'express';
import pino from 'pino';

const router = Router();
const logger = pino({ name: 'woxmail:autodiscover' });

/**
 * Helper to get host, port, and security settings from environment
 */
function getMailServerConfig() {
  const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
  const imapHost = process.env.PURELYMAIL_IMAP_HOST || 'imap.purelymail.com';
  const imapPort = parseInt(process.env.PURELYMAIL_IMAP_PORT, 10) || 993;
  const smtpHost = process.env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com';
  const smtpPort = parseInt(process.env.PURELYMAIL_SMTP_PORT, 10) || 465;
  const displayName = process.env.SYSTEM_SENDER_NAME || 'WoxMail Sovereign Privacy';

  return { domain, imapHost, imapPort, smtpHost, smtpPort, displayName };
}

// ─── 1. Mozilla Thunderbird & Mobile Autoconfig (config-v1.1.xml) ────────────

function generateMozillaAutoconfigXml(emailAddress = '') {
  const { domain, imapHost, imapPort, smtpHost, smtpPort, displayName } = getMailServerConfig();
  const emailUsername = emailAddress ? emailAddress : '%EMAILADDRESS%';

  return `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="${domain}">
    <domain>${domain}</domain>
    <domain>mail.${domain}</domain>
    <displayName>${displayName}</displayName>
    <displayShortName>WoxMail</displayShortName>

    <!-- Incoming IMAP Server -->
    <incomingServer type="imap">
      <hostname>${imapHost}</hostname>
      <port>${imapPort}</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>${emailUsername}</username>
    </incomingServer>

    <!-- Outgoing SMTP Server (SSL on 465) -->
    <outgoingServer type="smtp">
      <hostname>${smtpHost}</hostname>
      <port>${smtpPort}</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>${emailUsername}</username>
    </outgoingServer>

    <!-- Outgoing SMTP Server (STARTTLS fallback on 587) -->
    <outgoingServer type="smtp">
      <hostname>${smtpHost}</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
      <authentication>password-cleartext</authentication>
      <username>${emailUsername}</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;
}

// Handle both /mail/config-v1.1.xml and /.well-known/autoconfig/mail/config-v1.1.xml
router.get(['/mail/config-v1.1.xml', '/.well-known/autoconfig/mail/config-v1.1.xml'], (req, res) => {
  const email = (req.query.emailaddress || req.query.email || '').toString().trim();
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(generateMozillaAutoconfigXml(email));
});

// ─── 2. Microsoft Outlook POX / XML Autodiscover ─────────────────────────────

function generateOutlookAutodiscoverXml(email = '') {
  const { domain, imapHost, imapPort, smtpHost, smtpPort, displayName } = getMailServerConfig();
  const cleanEmail = email || `user@${domain}`;

  return `<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">
  <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">
    <Account>
      <AccountType>email</AccountType>
      <Action>settings</Action>
      <Protocol>
        <Type>IMAP</Type>
        <Server>${imapHost}</Server>
        <Port>${imapPort}</Port>
        <DomainRequired>off</DomainRequired>
        <LoginName>${cleanEmail}</LoginName>
        <SPA>off</SPA>
        <SSL>on</SSL>
        <AuthRequired>on</AuthRequired>
      </Protocol>
      <Protocol>
        <Type>SMTP</Type>
        <Server>${smtpHost}</Server>
        <Port>${smtpPort}</Port>
        <DomainRequired>off</DomainRequired>
        <LoginName>${cleanEmail}</LoginName>
        <SPA>off</SPA>
        <SSL>on</SSL>
        <AuthRequired>on</AuthRequired>
        <UsePOPAuth>off</UsePOPAuth>
        <SMTPLast>off</SMTPLast>
      </Protocol>
    </Account>
  </Response>
</Autodiscover>`;
}

const outlookHandler = (req, res) => {
  let email = '';
  // Try extracting email from POST body or query parameter
  if (typeof req.body === 'string') {
    const match = req.body.match(/<EMailAddress>(.*?)<\/EMailAddress>/i);
    if (match) email = match[1].trim();
  } else if (req.query.email) {
    email = req.query.email.toString().trim();
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(generateOutlookAutodiscoverXml(email));
};

router.post(['/autodiscover/autodiscover.xml', '/Autodiscover/Autodiscover.xml'], outlookHandler);
router.get(['/autodiscover/autodiscover.xml', '/Autodiscover/Autodiscover.xml'], outlookHandler);

// ─── 3. Microsoft Office 365 JSON Autodiscover (v1.0) ────────────────────────

router.get('/autodiscover/autodiscover.json', (req, res) => {
  const { domain, imapHost, imapPort, smtpHost, smtpPort } = getMailServerConfig();
  const email = (req.query.Email || req.query.email || `user@${domain}`).toString().trim();

  res.json({
    Protocol: 'AutodiscoverV1',
    Url: `https://${domain}/autodiscover/autodiscover.xml`,
    EmailAddress: email,
    Settings: {
      IncomingServer: {
        Server: imapHost,
        Port: imapPort,
        Protocol: 'IMAP',
        SSL: true,
      },
      OutgoingServer: {
        Server: smtpHost,
        Port: smtpPort,
        Protocol: 'SMTP',
        SSL: true,
      },
    },
  });
});

// ─── 4. Apple iOS & macOS 1-Click Profile (.mobileconfig) ────────────────────

router.get(['/mobileconfig', '/apple.mobileconfig', '/api/autodiscover/mobileconfig', '/email.mobileconfig'], (req, res) => {
  const { domain, imapHost, imapPort, smtpHost, smtpPort, displayName } = getMailServerConfig();
  const email = (req.query.email || '').toString().trim() || `user@${domain}`;
  const username = email;
  const profileUuid = '8A4F1D73-632B-4A8E-9807-' + Buffer.from(email).toString('hex').slice(0, 12).toUpperCase().padEnd(12, '0');
  const payloadUuid = '4D9E2A8F-1B3C-4E5F-8A90-' + Buffer.from(email).toString('hex').slice(0, 12).toUpperCase().padEnd(12, '0');

  const mobileconfigXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadDisplayName</key>
  <string>${displayName} (${email})</string>
  <key>PayloadDescription</key>
  <string>Configures ${email} IMAP &amp; SMTP mail settings for WoxMail Sovereign Enclave.</string>
  <key>PayloadIdentifier</key>
  <string>world.wox.mail.${email.replace(/[^a-zA-Z0-9]/g, '_')}</string>
  <key>PayloadOrganization</key>
  <string>WoxMail</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${profileUuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadDisplayName</key>
      <string>WoxMail Account</string>
      <key>PayloadDescription</key>
      <string>IMAP and SMTP account configuration</string>
      <key>PayloadIdentifier</key>
      <string>world.wox.mail.account.${email.replace(/[^a-zA-Z0-9]/g, '_')}</string>
      <key>PayloadOrganization</key>
      <string>WoxMail</string>
      <key>PayloadType</key>
      <string>com.apple.mail.managed</string>
      <key>PayloadUUID</key>
      <string>${payloadUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      
      <!-- Email details -->
      <key>EmailAccountDescription</key>
      <string>${email}</string>
      <key>EmailAccountName</key>
      <string>${email.split('@')[0]}</string>
      <key>EmailAccountType</key>
      <string>EmailTypeIMAP</string>
      <key>EmailAddress</key>
      <string>${email}</string>
      
      <!-- Incoming IMAP -->
      <key>IncomingMailServerHostName</key>
      <string>${imapHost}</string>
      <key>IncomingMailServerPortNumber</key>
      <integer>${imapPort}</integer>
      <key>IncomingMailServerUseSSL</key>
      <true/>
      <key>IncomingMailServerUsername</key>
      <string>${username}</string>
      <key>IncomingMailServerAuthentication</key>
      <string>EmailAuthPassword</string>
      
      <!-- Outgoing SMTP -->
      <key>OutgoingMailServerHostName</key>
      <string>${smtpHost}</string>
      <key>OutgoingMailServerPortNumber</key>
      <integer>${smtpPort}</integer>
      <key>OutgoingMailServerUseSSL</key>
      <true/>
      <key>OutgoingMailServerUsername</key>
      <string>${username}</string>
      <key>OutgoingMailServerAuthentication</key>
      <string>EmailAuthPassword</string>
      <key>OutgoingPasswordSameAsIncomingPassword</key>
      <true/>
    </dict>
  </array>
</dict>
</plist>`;

  res.setHeader('Content-Type', 'application/x-apple-aspen-config; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${email.split('@')[0]}-woxmail.mobileconfig"`);
  res.send(mobileconfigXml);
});

export default router;
