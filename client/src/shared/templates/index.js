/**
 * WoxMail Curated Email Starter Templates
 * Pre-configured modular block documents adapted from CodedMailsFree (MIT licensed).
 */

export const STARTER_TEMPLATES = [
  {
    id: 'welcome',
    name: 'Welcome & Onboarding',
    category: 'Onboarding',
    description: 'Warm welcome email with branding header, greeting, and getting started CTA.',
    badge: '[ONBOARDING]',
    blocks: [
      { id: 'b1', type: 'header', title: 'WoxMail', align: 'center' },
      { id: 'b2', type: 'heading', level: 1, text: 'Welcome to WoxMail, {{first_name}}!', align: 'center' },
      { id: 'b3', type: 'text', html: '<p>Thank you for creating your sovereign, encrypted inbox. You now have complete ownership of your communications with zero ad tracking and hardware-grade security.</p>' },
      { id: 'b4', type: 'button', label: 'Access Your Webmail', url: 'https://mail.wox.world/dashboard', bgColor: '#7c3aed', textColor: '#ffffff', radius: 'pill', align: 'center' },
      { id: 'b5', type: 'divider', style: 'solid', color: '#2a2a4a' },
      { id: 'b6', type: 'text', html: '<p style="font-size: 13px; color: #6868a0; text-align: center;">Need assistance? Reply directly to this email or visit our community support desk.</p>' },
      { id: 'b7', type: 'footer', text: 'WoxMail Sovereign Privacy Suite', unsubscribeText: 'Manage communication preferences' }
    ]
  },
  {
    id: 'newsletter',
    name: 'Weekly Tech Digest',
    category: 'Editorial',
    description: 'Two-column curated digest with hero section, article cards, and social links.',
    badge: '[NEWSLETTER]',
    blocks: [
      { id: 'b1', type: 'header', title: 'WoxMail Dispatch', align: 'left' },
      { id: 'b2', type: 'heading', level: 1, text: 'This Week in Sovereign Tech', align: 'left' },
      { id: 'b3', type: 'text', html: '<p>Here is your weekly briefing on end-to-end encryption, decentralized protocols, and private communication tooling.</p>' },
      { id: 'b4', type: 'divider', style: 'solid', color: '#2a2a4a' },
      { id: 'b5', type: 'columns', columns: [
        {
          blocks: [
            { id: 'c1', type: 'heading', level: 2, text: 'Zero-Knowledge IMAP' },
            { id: 'c2', type: 'text', html: '<p style="font-size: 13px;">How blind token indexing allows server-side search without disclosing search terms.</p>' },
            { id: 'c3', type: 'button', label: 'Read Story', url: 'https://mail.wox.world/blog/zk-search', bgColor: '#252545', textColor: '#f0f0f5', radius: 'rounded', align: 'left' }
          ]
        },
        {
          blocks: [
            { id: 'c4', type: 'heading', level: 2, text: 'WoxCrypt Browser Extension' },
            { id: 'c5', type: 'text', html: '<p style="font-size: 13px;">Isolated PGP key storage and disposable temp-mail autofill right from your browser context menu.</p>' },
            { id: 'c6', type: 'button', label: 'Explore Extension', url: 'https://mail.wox.world/extensions', bgColor: '#252545', textColor: '#f0f0f5', radius: 'rounded', align: 'left' }
          ]
        }
      ]},
      { id: 'b6', type: 'social', links: [
        { platform: 'github', url: 'https://github.com/WizardOfXerox' },
        { platform: 'discord', url: 'https://discord.gg/wox' }
      ]},
      { id: 'b7', type: 'footer', text: 'WoxMail Publishing', unsubscribeText: 'Unsubscribe from weekly digests' }
    ]
  },
  {
    id: 'product_announcement',
    name: 'Major Feature Launch',
    category: 'Product',
    description: 'High-impact announcement with feature highlights and primary CTA.',
    badge: '[LAUNCH]',
    blocks: [
      { id: 'b1', type: 'header', title: 'Product Update', align: 'center' },
      { id: 'b2', type: 'heading', level: 1, text: 'Introducing WoxMail 2.0', align: 'center' },
      { id: 'b3', type: 'text', html: '<p style="text-align: center;">We have completely rebuilt the campaign composer, added automated multi-step drip funnels, and integrated native OpenPGP message decryption.</p>' },
      { id: 'b4', type: 'button', label: 'Explore the New Features', url: 'https://mail.wox.world/changelog', bgColor: '#7c3aed', textColor: '#ffffff', radius: 'pill', align: 'center' },
      { id: 'b5', type: 'divider', style: 'solid', color: '#2a2a4a' },
      { id: 'b6', type: 'heading', level: 2, text: 'Key Highlights:' },
      { id: 'b7', type: 'text', html: '<ul><li><strong>Hybrid Notion Block Editor:</strong> Slash commands and drag-and-drop combined.</li><li><strong>Automated Drips:</strong> Multi-step timed sequences for your subscriber lists.</li><li><strong>Attachment Deduplication:</strong> Save storage space with SHA-256 fingerprinting.</li></ul>' },
      { id: 'b8', type: 'footer', text: 'WoxMail Engineering', unsubscribeText: 'Unsubscribe from announcements' }
    ]
  },
  {
    id: 'event_invitation',
    name: 'Event & Webinar Invitation',
    category: 'Events',
    description: 'Event card with date, time, speakers, and RSVP button.',
    badge: '[EVENT]',
    blocks: [
      { id: 'b1', type: 'header', title: 'Live Webinar', align: 'center' },
      { id: 'b2', type: 'heading', level: 1, text: 'Securing Your Personal Domain: From SPF to MTA-STS', align: 'center' },
      { id: 'b3', type: 'text', html: '<p style="text-align: center; color: #8b5cf6; font-weight: 600;">Thursday, September 18, 2026 &bull; 6:00 PM UTC</p>' },
      { id: 'b4', type: 'text', html: '<p>Join our security architects for a 45-minute deep dive on establishing 10/10 deliverability and anti-spoofing postures for custom domains.</p>' },
      { id: 'b5', type: 'button', label: 'Reserve Your Seat (Free)', url: 'https://mail.wox.world/webinars/dns-security', bgColor: '#22c55e', textColor: '#0f0f1a', radius: 'pill', align: 'center' },
      { id: 'b6', type: 'footer', text: 'WoxMail Academy', unsubscribeText: 'Unsubscribe from webinar invites' }
    ]
  },
  {
    id: 'transactional_receipt',
    name: 'Order / Payment Receipt',
    category: 'Transactional',
    description: 'Clean transaction confirmation with summary and invoice link.',
    badge: '[RECEIPT]',
    blocks: [
      { id: 'b1', type: 'header', title: 'WoxMail Billing', align: 'left' },
      { id: 'b2', type: 'heading', level: 1, text: 'Payment Confirmation', align: 'left' },
      { id: 'b3', type: 'text', html: '<p>Hello {{first_name}}, this email confirms that your subscription has been successfully renewed. Your receipt details are below:</p>' },
      { id: 'b4', type: 'text', html: '<table width="100%" style="background-color: #16162b; border: 1px solid #2a2a4a; border-radius: 8px; padding: 12px; font-size: 14px; color: #f0f0f5;"><tr><td><strong>Plan:</strong> Sovereign Pro</td><td align="right">$49.00 / yr</td></tr><tr><td><strong>Payment Method:</strong> Credit Card (ending in 4242)</td><td align="right">Paid</td></tr></table>' },
      { id: 'b5', type: 'spacer', height: 16 },
      { id: 'b6', type: 'button', label: 'Download PDF Invoice', url: 'https://mail.wox.world/settings/billing', bgColor: '#252545', textColor: '#f0f0f5', radius: 'rounded', align: 'left' },
      { id: 'b7', type: 'footer', text: 'WoxMail Payments', unsubscribeText: 'Transactional notice — manage billing in settings' }
    ]
  },
  {
    id: 'minimal',
    name: 'Minimal Clean Letter',
    category: 'Minimal',
    description: 'Distraction-free, typography-focused personal letter layout.',
    badge: '[MINIMAL]',
    blocks: [
      { id: 'b1', type: 'heading', level: 1, text: 'A Quick Note from the Founder', align: 'left' },
      { id: 'b2', type: 'text', html: '<p>Hey {{first_name}},</p><p>I wanted to personally reach out and say thank you for using WoxMail. Our mission is to preserve the open web and personal digital sovereignty without compromise.</p><p>If you have any feedback or ideas on how we can improve your daily email workflow, simply hit reply to this email.</p><p>Warm regards,<br/>The WoxMail Team</p>' },
      { id: 'b3', type: 'divider', style: 'solid', color: '#2a2a4a' },
      { id: 'b4', type: 'footer', text: 'WoxMail', unsubscribeText: 'Unsubscribe' }
    ]
  }
];

export function getTemplateById(templateId) {
  return STARTER_TEMPLATES.find(t => t.id === templateId) || STARTER_TEMPLATES[0];
}
