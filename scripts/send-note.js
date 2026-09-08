// one-off: send a first-touch note via the app mailer. usage: node scripts/send-note.js <to> <subject> <textfile> [--dry]
require('dotenv').config();
const fs=require('fs');const {sendEmail}=require('../services/email');
const [to,subject,file]=process.argv.slice(2);const dry=process.argv.includes('--dry');
const text=fs.readFileSync(file,'utf8').trim();
const html='<div style="font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;white-space:pre-wrap">'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/(https?:\/\/[^\s]+)/g,'<a href="$1">$1</a>')+'</div>';
(async()=>{if(dry){console.log('DRY',to,subject);return;}const r=await sendEmail({to,subject,text,html,from:'Andrew at DayHop <hello@dayhop.quest>'});console.log(to,r.sent?'sent '+r.id:'NOT sent '+r.reason);process.exit(r.sent?0:1);})().catch(e=>{console.error(e);process.exit(1);});
