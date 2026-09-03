// scripts/send-reply.js — send a threaded reply through the app's mailer.
// Replies sent through Resend used to start a new conversation on the
// recipient's side because no In-Reply-To/References headers were set.
// This sends from the outreach identity with the threading headers so the
// reply lands under the prospect's own message, and reply-to stays on
// admin@dayhop.quest.
//
// Usage:
//   node scripts/send-reply.js --to info@venue.com \
//     --subject "RE: Joyride 150 and DayHop — how it works" \
//     --in-reply-to "<abc123@mail.example.com>" \
//     --text social/joyride-reply-2026-09-03.txt [--dry]
//
// The Message-ID comes from Gmail: open the message → ⋮ → "Show original".
require('dotenv').config();
const fs = require('fs');
const { sendEmail } = require('../services/email');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] || true) : dflt;
}

async function main() {
  const to = String(arg('to', ''));
  const subject = String(arg('subject', ''));
  const inReplyTo = String(arg('in-reply-to', ''));
  // Full chain from the prospect's own References header plus their
  // Message-ID; Outlook threads on this, Gmail on either.
  const references = String(arg('references', '')) || undefined;
  const textPath = String(arg('text', ''));
  const dry = Boolean(arg('dry', false));
  if (!to || !subject || !inReplyTo || !textPath) {
    console.error('need --to, --subject, --in-reply-to, --text');
    process.exit(2);
  }
  const text = fs.readFileSync(textPath, 'utf8').trim();
  const html = '<div style="font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;white-space:pre-wrap">'
    + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>')
    + '</div>';
  console.log(`to: ${to}\nsubject: ${subject}\nin-reply-to: ${inReplyTo}\nreferences: ${references || inReplyTo}\nfrom: Andrew at DayHop <hello@dayhop.quest>\n---\n${text}\n---`);
  if (dry) { console.log('(dry run — nothing sent)'); return; }
  const r = await sendEmail({
    to, subject, text, html, inReplyTo, references,
    from: 'Andrew at DayHop <hello@dayhop.quest>'
  });
  console.log(r.sent ? `sent, Resend id ${r.id}` : `NOT sent: ${r.reason}`);
  process.exit(r.sent ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
