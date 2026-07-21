import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4177';
const ADMIN_UID = 'ebf4f969-5c8e-4cb4-87c3-2aac923eb6a5';
function b64url(obj){return Buffer.from(JSON.stringify(obj)).toString('base64url');}
function fakeJwt(payload){return `${b64url({alg:'HS256',typ:'JWT'})}.${b64url(payload)}.sig`;}
const access = fakeJwt({sub:ADMIN_UID,email:'mziyabo@gmail.com',role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs=[];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

await page.route('**/rest/v1/rpc/is_platform_admin', r => r.fulfill({status:200,contentType:'application/json',body:'true'}));
await page.route('**/rest/v1/rpc/admin_product_events_summary**', r => r.fulfill({
  status:200, contentType:'application/json',
  body: JSON.stringify({since:'2026-06-21T00:00:00Z',days:30,totals:{events:4,unique_users:1},by_event_name:[{event_name:'screen_view',count:4,unique_users:1,last_at:null}],errors_by_screen:[],exports:{count:0,unique_users:0,last_at:null},tee_sheet:{opened:1,saved:0,published:0,last_saved_at:null,last_published_at:null},rsvp_payment:{rsvp_submitted:0,payment_marked:0}})
}));
await page.route('**/rest/v1/profiles**', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:ADMIN_UID,full_name:'Admin',profile_complete:true}])}));

await page.addInitScript(({uid,access})=>{
  localStorage.setItem('gsh:supabase-auth', JSON.stringify({
    access_token:access, token_type:'bearer', expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600, refresh_token:'refresh',
    user:{id:uid,email:'mziyabo@gmail.com',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
  }));
},{uid:ADMIN_UID,access});

const res = await page.goto(BASE + '/(admin)/usage-report', { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('nav status', res?.status());
await page.waitForTimeout(6000);
const text = await page.locator('body').innerText().catch(()=>'<no body>');
const htmlLen = (await page.content()).length;
const redirected = logs.some(l => l.includes('signed_in_default'));
const hasTitle = /Product usage report/i.test(text);
console.log(JSON.stringify({
  finalUrl: page.url(),
  htmlLen,
  redirectedToTabs: redirected,
  hasUsageReportTitle: hasTitle,
  bodySnippet: text.slice(0,800),
  errors: logs.filter(l => l.includes('pageerror') || l.includes('Error') || l.includes('error')).slice(0,20),
  redirectLogs: logs.filter(l => l.includes('[_layout:redirect]')).slice(-20),
}, null, 2));
await page.screenshot({ path: '/tmp/usage-report-local.png', fullPage: true });
await browser.close();
const ok = !redirected && hasTitle;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
