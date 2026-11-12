/* Vayron · "Connect broker · Live data" (preview build).
   Each visitor may connect THEIR OWN broker account. Keys, tokens and live prices stay in this
   browser only (localStorage/sessionStorage). Nothing here is sent to Vayron, except the single
   Kite token exchange, which goes through a stateless pass-through (/api/broker/kite/session)
   because api.kite.trade has no CORS; it never receives the api_secret (only a SHA-256 checksum)
   and stores/logs nothing. A second stateless pass-through (/api/broker/kite/check) may run if
   the Kite socket is refused, to explain whether the token is invalid or the app lacks market data.
   For Dhan, yesterday's closing prices (once per IST day) and today's 5-minute order-flow candles go through stateless read-only pass-throughs
   (/api/broker/dhan/quote, Dhan's REST API has no CORS) so day changes and breadth work.
   No relay stores or logs keys or tokens. Read-only: no order endpoints are ever called. */
(function(){
'use strict';
if(window.__vayronBroker)return;window.__vayronBroker=1;
var SK='vayron_broker_session_v1',KK='vayron_broker_keys_v1_',PK='vayron_broker_pending_v1',FQ='vayron_broker_fyers_quota_v1',EK='vayron_broker_lasterr_v1';
var CB=location.origin+'/broker/callback/';
/* One redirect URL for every Vayron host: the broker always returns to vayron.com (or whatever URL the visitor's app
   is registered with); the callback page then forwards to the host where the login started (encoded in the state). */
var CANON=location.origin+'/broker/callback/',TH=/^(vayron\.com|www\.vayron\.com|([a-z0-9-]+\.)?vayron\.pages\.dev)$/;
function okCb(u){try{var x=new URL(u);if(!/^\/broker\/callback\/?$/.test(x.pathname)||x.search||x.hash)return false;if(x.origin===location.origin)return true;if(x.protocol==='https:'&&TH.test(x.hostname))return true;if((x.protocol==='http:'||x.protocol==='https:')&&(x.hostname==='127.0.0.1'||x.hostname==='localhost'))return true;return false}catch(e){return false}}
var BROKERS=[
 {id:'fyers',name:'FYERS',group:'free',status:'live',price:'Free · Standard plan',priceNote:'5,000 data requests/day, 50 symbols per quote call',src:'https://fyers.in/api-docs/v3/getting-started/plans-and-limits/',
  portal:'https://myapi.fyers.in/dashboard/',auth:'oauth',fields:[['key','App ID','e.g. ABCD1234-100'],['secret','App Secret','']],
  steps:['Open the FYERS API dashboard and create an app (type: Web/User app).','Permissions: tick only “Quotes & Market Data”. Leave order placement off.','Set the Redirect URL to the address below.','Paste the App ID and App Secret here, then log in on FYERS.'],
  howData:'Quotes API, polled from your browser (every ~12 s, rotating 50 symbols per call to stay inside the free daily limit).'},
 {id:'upstox',name:'Upstox',group:'free',status:'live',price:'Free',priceNote:'All trading + data APIs ₹0',src:'https://upstox.com/trading-api/',
  portal:'https://account.upstox.com/developer/apps',auth:'oauth',alt:'token',fields:[['key','API Key',''],['secret','API Secret','']],
  steps:['Open Upstox Developer Apps and create an app.','Set the Redirect URL to the address below.','Paste the API Key and API Secret here, then log in on Upstox.','Or: click “Generate” on your app page and paste today’s access token instead.'],
  howData:'LTP Quotes V3 API, polled from your browser every 5 s (one call covers all F&O stocks).'},
 {id:'angelone',short:'Angel One',name:'Angel One SmartAPI',group:'free',status:'live',price:'Free',priceNote:'SmartAPI · session ends at midnight IST',src:'https://smartapi.angelone.in',
  portal:'https://smartapi.angelone.in',auth:'angel',fields:[['key','SmartAPI API key',''],['client','Client code','e.g. A123456'],['pin','PIN (4–6 digit)','never stored'],['totp','TOTP (6-digit from authenticator)','']],
  steps:['Open https://smartapi.angelone.in, sign up or log in, and click “Create an App”.','App type: choose `Market Feeds APIs` (Vayron only reads prices).','App name: anything you like, for example `Vayron`.','Redirect URL: `https://vayron.com/broker/callback/` (Angel One requires this field; Vayron doesn\'t use it).','Postback URL: leave empty.','Angel client ID: your Angel One client code, for example `A123456`. Optional.','Click “Create App”, then copy the API key it shows.','If you haven\'t enabled TOTP yet, turn it on at https://smartapi.angelone.in/enable-totp and scan the QR code with Google Authenticator.','On Vayron, paste the API key and client code, then enter your PIN and the current 6-digit code from the authenticator app. PIN and TOTP go only to Angel One and are never saved.','Session lasts until midnight IST; reconnect once a day.'],
  howData:'SmartAPI WebSocket 2.0 streamed straight to your browser (LTP). Falls back to quote polling if the socket can’t connect.'},
 {id:'icici',name:'ICICI Direct Breeze',group:'free',status:'soon',price:'Free',src:'https://www.icicidirect.com/faqs/fno/what-is-the-cost-or-fees-for-using-breeze-api',why:'Breeze API blocks browser (CORS) calls and signs every request with your secret.'},
 {id:'shoonya',name:'Shoonya (Finvasia)',group:'free',status:'soon',price:'Free',src:'https://shoonya.com/faq/api/is-there-any-fee-for-api-access/',why:'Login needs your password + TOTP inside the app; Vayron never handles broker passwords.'},
 {id:'aliceblue',name:'Alice Blue ANT',group:'free',status:'soon',price:'Free',src:'https://aliceblueonline.com/support/api-basics',why:'Not wired yet.'},
 {id:'5paisa',name:'5paisa Xstream',group:'free',status:'soon',price:'Free',src:'https://xstream.5paisa.com/',why:'Not wired yet.'},
 {id:'kite',short:'Kite',name:'Zerodha Kite Connect',group:'paid',status:'live',price:'₹500/month per app',priceNote:'Connect plan (the free Personal plan has no market data)',src:'https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/what-are-the-charges-for-kite-apis',
  portal:'https://developers.kite.trade/apps',auth:'oauth',fields:[['key','API key',''],['secret','API secret','']],
  alt:'kitetoken',steps:['On the Kite Connect developer console, create a Connect app (₹500/month, billed by Zerodha to you).','Login route: set the app’s Redirect URL to the address below, paste the API key and API secret here, then log in on Kite. Your secret stays in this browser: only a SHA-256 checksum is sent for the one-time token exchange.','Already have today’s access token from your own app? Use “I already have today’s access token” below instead: no redirect URL, secret or Kite login needed.'],
  howData:'Kite WebSocket streamed straight to your browser (quote mode); candles and option quotes for Radar, options, calm and screeners go through Vayron’s stateless read-only pass-through (Kite blocks direct browser calls), which stores and logs nothing.',relay:true},
 {id:'dhan',short:'Dhan',name:'Dhan Data API',group:'paid',status:'live',price:'₹499 + taxes / 30 days',priceNote:'Data API subscription (trading APIs are free)',src:'https://dhan.co/support/platforms/dhanhq-api/how-does-the-dhanhq-data-api-subscription-work/',
  portal:'https://web.dhan.co/',auth:'token',fields:[['key','Dhan Client ID',''],['token','Access token','']],
  steps:['Subscribe to Data APIs in Dhan (My Profile → DhanHQ Trading APIs).','Generate an access token on web.dhan.co (valid 24 h).','Paste your Client ID and the access token here.'],
  howData:'Dhan Live Market Feed WebSocket streamed straight to your browser (quote mode); yesterday’s closing prices (once a day) and today’s 5-minute candles for order flow are fetched through Vayron’s stateless read-only pass-through (Dhan blocks direct browser calls), which stores and logs nothing.'}
];
function B(id){for(var i=0;i<BROKERS.length;i++)if(BROKERS[i].id===id)return BROKERS[i];return null}
function jget(k,s){try{return JSON.parse((s||localStorage).getItem(k)||'null')}catch(e){return null}}
function jset(k,v,s){try{(s||localStorage).setItem(k,JSON.stringify(v))}catch(e){}}
function jdel(k,s){try{(s||localStorage).removeItem(k)}catch(e){}}
function lastErr(){return jget(EK)}
function setLastErr(msg,broker){var m=String(msg||'');if(!m){jdel(EK);return}jset(EK,{message:m,t:Date.now(),broker:broker||(SESS&&SESS.id)||''})}
function clearLastErr(){jdel(EK)}
function r2(x){return Math.round(x*100)/100}
function istDay(){return new Date(Date.now()+19800000).toISOString().slice(0,10)}
function nextIST(h,m){var n=Date.now(),d=new Date(n+19800000);d.setUTCHours(h,m,0,0);var t=d.getTime()-19800000;if(t<=n)t+=86400000;return t}
function expFor(id){return id==='kite'?nextIST(6,0):id==='fyers'?nextIST(6,30):id==='upstox'?nextIST(3,30):id==='angelone'?nextIST(0,0):Date.now()+86400000}
function rnd(){var a=new Uint8Array(12);crypto.getRandomValues(a);return Array.from(a,function(n){return('0'+n.toString(16)).slice(-2)}).join('')}
function sha256hex(s){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)).then(function(b){return Array.from(new Uint8Array(b),function(n){return('0'+n.toString(16)).slice(-2)}).join('')})}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fmtStep(s){return String(s==null?'':s).split(/(`[^`]+`)/g).map(function(p){if(p.length>=2&&p.charAt(0)==='`'&&p.charAt(p.length-1)==='`')return '<code>'+esc(p.slice(1,-1))+'</code>';var out='',last=0,re=/https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?/g,m;while((m=re.exec(p))){out+=esc(p.slice(last,m.index));var u=m[0].replace(/[.,;:!?)]+$/,''),trail=m[0].slice(u.length);out+='<a class="l" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(u)+'</a>'+esc(trail);last=m.index+m[0].length}return out+esc(p.slice(last))}).join('')}

var SESS=jget(SK);if(SESS&&(!SESS.exp||SESS.exp<Date.now()||!B(SESS.id))){jdel(SK);SESS=null}
var FEED_BLOCKED=false;
var COMM={discord:'https://discord.gg/UQvfzWBkAV',telegram:'https://t.me/ABCD_AI_community'};
var DCI='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>';
var TGI='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.8c.9-.3 1.7.2 1.4 1.5z"/></svg>';
function commHTML(){return'<div class="comm"><b>Join the ABCD_AI community</b><a class="cbtn dc" href="'+COMM.discord+'" target="_blank" rel="noopener noreferrer">'+DCI+'Discord</a><a class="cbtn tg" href="'+COMM.telegram+'" target="_blank" rel="noopener noreferrer">'+TGI+'Telegram</a></div>'}
/* ---------- sample mode ("See a sample") ----------
   Without a broker session a visitor may open the dashboards with a static sample set served by Pages from
   /sample/<dir>/ (no Worker, R2 or D1). data.vayron.com NSE files are never requested in sample mode.
   /sample/config.json picks the set: "demo" (illustrative, generated) or "real" (frozen 9 Nov 2026 set, only
   allowed on/after real.not_before, i.e. >= 30 days old per SEBI's 8 May 2026 circular). */
var SMK='vayron_sample_v1',SCFG=null,SCFG_P=null,SDEF={dir:'/sample/data/',label:'example data',banner:'Example data · not real/live market prices'};
(function(){try{var q=new URLSearchParams(location.search).get('sample');if(q==='1')sessionStorage.setItem(SMK,'1');else if(q==='0')sessionStorage.removeItem(SMK)}catch(e){}})();
function sampleFlag(){return true}
function sampleOn(){return sampleFlag()&&!hasBrokerSession()}
function sampleCfg(){
  if(SCFG)return Promise.resolve(SCFG);
  if(!SCFG_P)SCFG_P=(F0||fetch)('/sample/config.json',{cache:'no-cache'}).then(function(r){return r.json()}).then(function(c){
    var m=c&&c.mode==='real'&&c.real&&(!c.real.not_before||new Date().toISOString().slice(0,10)>=c.real.not_before)?'real':'demo';
    try{var pm=sessionStorage.getItem('vayron_sample_set_v1');if(pm&&c&&c[pm])m=pm;else sessionStorage.setItem('vayron_sample_set_v1',m)}catch(e){}
    SCFG=(c&&c[m])||SDEF;if(!SCFG.dir)SCFG.dir=SDEF.dir;SCFG.mode=m;return SCFG}).catch(function(){SCFG=SDEF;SCFG.mode='demo';return SCFG});
  return SCFG_P;
}
function sampleName(u){var m=String(u).match(/\/data\/(?:sim\/)?([^?#]+)/);if(!m)return '';try{return decodeURIComponent(m[1])}catch(e){return m[1]}}
function sampleFetch(u){return sampleCfg().then(function(c){var n=sampleName(u);if(!n)return blockedResponse();return F0(location.origin+c.dir+n,{credentials:'omit'})})}
function enterSample(){try{sessionStorage.setItem(SMK,'1')}catch(e){}location.href=(gatedPath()?location.pathname:'/pulse/')+'?sample=1'}
function exitSample(){try{sessionStorage.removeItem(SMK)}catch(e){}location.href=location.pathname+'?sample=0'}
var BLUR_CSS='/broker/nse-blur.css?v=10';
/* ---------- broker gate ----------
   Without a valid broker session, NSE-sourced data is never requested on any page (see the fetch/XHR guard
   below) and the market dashboards show the "connect your broker" panel instead of numbers.
   Open sections (no NSE data): home marketing, News, Academy, Crypto, Support, Journal, legal pages. */
var GATED_RE=/^\/(pulse|options|oi-flow|liquidity|strength|radar|calm|screeners)(\/|$)/;
function gatedPath(){return GATED_RE.test(location.pathname||'/')}
function homePath(){return /^\/markets(\/|\/index\.html)?$/.test(location.pathname||'/')}
/* data.vayron.com files that are NOT NSE data and stay public: site config, news, crypto/gold */
var OPEN_DATA_RE=/^https:\/\/data\.vayron\.com\/data\/(config|news[^\/?]*|crypto[^\/?]*|live|liq@symbol-(BTC|ETH)__[^\/?]*|liq_book@symbol-(BTC|ETH))\.json(\?|$)/;
var NSE_DATA_RE=/^https?:\/\/data\.vayron\.com\//;
function dataBlocked(u){u=String(u||'');try{u=new URL(u,location.href).href}catch(e){}return NSE_DATA_RE.test(u)&&!OPEN_DATA_RE.test(u)}
/* Pages/sections that are not NSE cash/F&O data — never blur, never show the banner */
function blurExemptPath(){
  var p=(location.pathname||'/').replace(/\/+$/,'');
  return p==='/crypto'||p==='/academy'||p==='/support';
}
function hasBrokerSession(){return !!(SESS&&SESS.token&&SESS.id&&B(SESS.id)&&(!SESS.exp||SESS.exp>Date.now()))}
function syncBlur(){
  /* Blur is now only a fallback for a connected session whose live feed was refused (FEED_BLOCKED).
     Without a session there is nothing to blur: the gate stops NSE data from loading at all. */
  var on=hasBrokerSession()&&FEED_BLOCKED&&!blurExemptPath();
  try{
    var g=!hasBrokerSession();
    document.documentElement.classList.toggle('vayron-nosess',g);
    var sm=g&&(gatedPath()||homePath());
    document.documentElement.classList.toggle('vayron-gated',false);
    document.documentElement.classList.toggle('vayron-sample',sm);
  }catch(e){}
  if(typeof renderGate==='function')try{renderGate()}catch(e){}
  try{
    document.documentElement.classList.toggle('vayron-blur',on);
    document.documentElement.classList.toggle('vayron-noblur',blurExemptPath());
  }catch(e){}
  var h=document.getElementById('vayron-blur-hint');
  if(h)h.style.display=on?'':'none';
}
function ensureBlurAssets(){
  if(!document.querySelector('link[data-vayron-blur]')){
    var l=document.createElement('link');l.rel='stylesheet';l.href=BLUR_CSS;l.setAttribute('data-vayron-blur','1');
    (document.head||document.documentElement).appendChild(l);
  }
  if(blurExemptPath()){syncBlur();return}
  if(!document.getElementById('vayron-blur-hint')){
    var h=document.createElement('div');h.id='vayron-blur-hint';h.setAttribute('role','button');h.tabIndex=0;
    h.innerHTML='Your broker’s live feed was refused · <b>Open Connect broker for details</b>';
    h.title='Optional: stream live prices from your own broker account';
    h.addEventListener('click',function(){try{open()}catch(e){}});
    h.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();try{open()}catch(x){}}});
    var put=function(){if(!h.parentNode)(document.body||document.documentElement).appendChild(h);syncBlur()};
    if(document.body)put();else document.addEventListener('DOMContentLoaded',put);
  }else syncBlur();
}
/* Apply blur class immediately (before body paints market numbers) */
syncBlur();
ensureBlurAssets();
var LIVE={},INS=null,ENG=null,STATE='',ERR='';

/* ---------- overlay: patch Vayron's own delayed JSON with live LTP, in this browser only ---------- */
var DATA_RE=/^https:\/\/data\.vayron\.com\/data\/(pulse|flow|orderflow(_p\d+)?|options@[^\/?]*|radar@[^\/?]*)\.json/;
function hasLive(){for(var k in LIVE)return true;return false}
function patch(o,d){
  if(!o||typeof o!=='object'||d>7)return;
  if(Array.isArray(o)){for(var i=0;i<o.length;i++)patch(o[i],d+1);return}
  var sym=typeof o.symbol==='string'?o.symbol:typeof o.s==='string'?o.s:null,q=sym&&LIVE[sym];
  if(q&&q.p>0){
    if(typeof o.spot==='number'){o.spot=q.p;if(q.c!=null&&'chg' in o)o.chg=q.c;if(q.cp!=null&&'chg_pct' in o)o.chg_pct=q.cp}
    else if(typeof o.ltp==='number'){o.ltp=q.p;if(q.cp!=null&&'chg_pct' in o)o.chg_pct=q.cp;if(q.c!=null&&'chg' in o)o.chg=q.c}
    else if(o.s===sym&&typeof o.p==='number'&&q.cp!=null&&!('symbol' in o))o.p=q.cp;
  }
  for(var k in o){var v=o[k];if(v&&typeof v==='object')patch(v,d+1)}
}
var F0=window.fetch;
function blockedResponse(){return new Response(JSON.stringify({error:'Connect your broker to load market data.'}),{status:403,statusText:'Broker connection required',headers:{'Content-Type':'application/json','X-Vayron-Gate':'1'}})}
if(F0)window.fetch=function(input){
  var u=typeof input==='string'?input:(input&&input.url)||String(input||'');
  if(dataBlocked(u))return hasBrokerSession()?brokerFetch(u):sampleOn()?sampleFetch(u):Promise.resolve(blockedResponse());
  return F0.apply(window,arguments);
};

try{var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){
  if(dataBlocked(u)){var a=Array.prototype.slice.call(arguments);a[1]=(sampleOn()&&!hasBrokerSession())?location.origin+((SCFG&&SCFG.dir)||SDEF.dir)+sampleName(u):'data:application/json,%7B%22error%22%3A%22broker_required%22%7D';return XO.apply(this,a)}
  return XO.apply(this,arguments)}}catch(e){}

/* ---------- connected: every dashboard file is built in this browser from the visitor's broker (broker/bdata.js) ---------- */
var BDP=null,BMETA=null,BUSED={};
function loadScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;(document.head||document.documentElement).appendChild(s)})}
function bdReady(){if(BDP)return BDP;
  BDP=Promise.all([window.__vayronBD?Promise.resolve():loadScript('/broker/bdata.js?v=31'),loadIns(),SESS&&SESS.id==='angelone'?loadAngelTok():Promise.resolve(null),
    (F0||fetch)('/broker/meta.json?v=1').then(function(r){return r.json()}).catch(function(){return null})]).then(function(a){BMETA=a[3];
    window.__vayronBD.init({sess:SESS,F0:F0,ins:INS,angel:a[2],meta:BMETA,live:LIVE,kl:function(){return window.__vayronKL.get()},expired:function(id,msg){expired(msg)},note:function(m){setLastErr(m,SESS&&SESS.id)}});return window.__vayronBD});
  return BDP}
function brokerFetch(u){var n=sampleName(u);
  if(/^symbols\.json$/.test(n))return bdReady().then(function(){var out=Object.keys(INS.idx).map(function(k){return{symbol:k,name:k,lot:null,kind:'index'}}).concat(Object.keys(INS.eq).map(function(k){var m=BMETA&&BMETA.eq&&BMETA.eq[k];return{symbol:k,name:m?m[0]:k,lot:null,kind:'stock'}}));return jres(out)});
  return bdReady().then(function(bd){return bd.build(n)}).then(function(j){if(/^screen_(basis|iv)/.test(n)&&/^\/pulse/.test(location.pathname))return jres(j);BUSED[n]=(j&&typeof j.error==='string')?j.error:'ok';if(wantNudge(j))scheduleNudge();if(typeof updBrokerBar==='function')setTimeout(updBrokerBar,0);return jres(j)},
    function(e){var m='Not available with '+((B(SESS&&SESS.id)||{}).name||'your broker')+': could not load this view ('+String(e&&e.message||e).slice(0,80)+').';BUSED[n]=m;if(typeof updBrokerBar==='function')setTimeout(updBrokerBar,0);return jres({error:m})})}
/* Waiting states ("Collecting live data…", pre-open "Market closed ·") come back as {error}. The dashboards' data hooks treat that as an
   error: they retry ~4 times in the first minute and then stop polling, so the page would stay on the waiting message. While the market is
   open (or in the 2 hours before 9:15 IST) and this tab is visible, nudge the hooks to re-fetch every 20 s until real data arrives. */
var NUDGE=null;
function wantNudge(j){return !!(j&&typeof j.error==='string'&&(j.waiting||/^(Collecting live data|Market closed ·)/.test(j.error)))}
function istMin(){var d=new Date(Date.now()+19800000);return{w:d.getUTCDay(),s:d.getUTCHours()*3600+d.getUTCMinutes()*60+d.getUTCSeconds()}}
/* market open: every 20 s; weekday before 9:15: once at ~9:15:20 IST (no polling the broker while closed); otherwise not at all */
function nudgeDelay(){var t=istMin();if(t.w===0||t.w===6)return null;if(t.s>=33300&&t.s<=55800)return 20000;if(t.s<33300)return (33320-t.s)*1000;return null}
function scheduleNudge(){if(NUDGE)return;var dl=nudgeDelay();if(dl==null)return;NUDGE=setTimeout(function(){NUDGE=null;
  if(document.visibilityState==='visible'){try{document.dispatchEvent(new Event('visibilitychange'))}catch(e){}}else{NUDGE=setTimeout(function(){NUDGE=null;scheduleNudge()},20000)}},Math.min(dl,2147483000))}
function jres(j){return new Response(JSON.stringify(j),{status:200,headers:{'Content-Type':'application/json','X-Vayron-Source':'broker'}})}

/* ---------- live engines (browser -> broker directly) ---------- */
function setX(sym,x){if(!sym)return;var q=LIVE[sym]||(LIVE[sym]={});for(var k in x)if(x[k]!=null&&isFinite(x[k]))q[k]=x[k]}
function mktOpenIST(){var d=new Date(Date.now()+19800000),w=d.getUTCDay(),m=d.getUTCHours()*60+d.getUTCMinutes();return w!==0&&w!==6&&m>=555&&m<=930}
function setQ(sym,p,prev){
  if(!sym||!(p>0))return;var q=LIVE[sym]||(LIVE[sym]={});q.p=r2(p);
  /* WebSocket feeds (Kite/Dhan) after the close can send only a last tick whose "close" equals the LTP: that is not a 0.00% day */
  var wsb=SESS&&(SESS.id==='kite'||SESS.id==='dhan'),lastTick=wsb&&prev>0&&Math.abs(prev-p)<0.005&&!mktOpenIST();
  if(prev>0&&!lastTick)q.prev=prev;
  if(q.prev>0&&!(wsb&&!mktOpenIST()&&Math.abs(q.prev-q.p)<0.005)){q.c=r2(q.p-q.prev);q.cp=r2((q.p-q.prev)/q.prev*100)}else if(wsb){delete q.c;delete q.cp;if(lastTick)delete q.prev}
  q.t=Date.now();tick();if(wsb)klTick(sym,q);
}
/* ---------- Kite/Dhan live aggregation (this browser only) ----------
   From the broker's WebSocket quote ticks: cumulative day-volume deltas × tick direction (money flow), and 5-minute
   candles for today's session (order blocks). Kept in this browser's localStorage for the current IST session date;
   nothing is sent anywhere. */
var KL=null,KLdirty=0,KLGAP=120000;
function istDate(){return new Date(Date.now()+19800000).toISOString().slice(0,10)}
function klKey(){return 'vayron_kl_v1:'+(SESS&&SESS.id)+':'+istDate()}
function klLoad(){var k=klKey();if(KL&&KL._k===k)return KL;KL=null;try{KL=JSON.parse(localStorage.getItem(k)||'null')}catch(e){}
  if(!KL||typeof KL!=='object')KL={since:0,last:0,c:{},f:{}};KL._k=k;
  try{for(var i=localStorage.length-1;i>=0;i--){var n=localStorage.key(i);if(n&&n.indexOf('vayron_kl_v1:')===0&&n!==k)localStorage.removeItem(n)}}catch(e){}
  return KL}
function klSave(){if(!KLdirty||!KL)return;KLdirty=0;var o={since:KL.since,last:KL.last,c:KL.c,f:KL.f};
  try{localStorage.setItem(KL._k,JSON.stringify(o))}catch(e){try{for(var s in o.c)o.c[s]=o.c[s].slice(-60);localStorage.setItem(KL._k,JSON.stringify(o))}catch(x){}}}
setInterval(klSave,5000);addEventListener('pagehide',klSave);
function klTick(sym,q){if(!mktOpenIST()||!(q.p>0)||!(q.v>0))return;var K=klLoad(),t=Date.now(),p=q.p,v=q.v;
  var st=K.f[sym]||(K.f[sym]={lv:null,lp:null,lt:0,d:0,tv:0,sf:0,pv:null,n:0});
  var fresh=st.lv!=null&&t-st.lt<=KLGAP,dv=fresh?Math.max(0,v-st.lv):0,dir=st.lp==null?0:p>st.lp?1:p<st.lp?-1:st.d;if(dir)st.d=dir;
  if(dv>0){st.tv+=dv*p;st.sf+=dv*p*(dir||0);st.n++}
  st.lv=v;st.lp=p;st.lt=t;if(q.prev>0)st.pv=q.prev;
  var b=Math.floor(t/300000)*300,arr=K.c[sym]||(K.c[sym]=[]),L=arr[arr.length-1];
  if(!L||L[0]!==b){if(!L&&!fresh&&!dv){arr.push([b,p,p,p,p,0])}else arr.push([b,p,p,p,p,dv])}else{if(p>L[2])L[2]=p;if(p<L[3])L[3]=p;L[4]=p;L[5]+=dv}
  if(!K.since)K.since=t;K.last=t;KLdirty=1}
window.__vayronKL={get:function(){return SESS&&(SESS.id==='kite'||SESS.id==='dhan')?klLoad():null}};
var tickT=0;function tick(){if(!tickT)tickT=setTimeout(function(){tickT=0;renderChip()},500)}
function loadIns(){return INS?Promise.resolve(INS):(F0||fetch)('/broker/instruments.json?v=20261109').then(function(r){return r.json()}).then(function(j){INS=j;return j})}
function status(s,e){STATE=s;ERR=e||'';renderChip();renderModalStatus()}
function expired(msg){var m=msg||'Your broker session expired or was rejected. Please connect again.';setLastErr(m,SESS&&SESS.id);status('error',m);stopEngine();FEED_BLOCKED=false;jdel(SK);SESS=null;syncBlur();renderChip();renderModal();
  /* restart the page cleanly on the example set so live and example numbers never mix */
  if((gatedPath()||homePath())&&!modalOpen)setTimeout(function(){location.reload()},1200)}
function stopEngine(){if(ENG){try{ENG.stop()}catch(e){}ENG=null}}

function wsEngine(url,onOpen,onMsg,label,onRefuse){
  var ws=null,stop=false,opened=false,fails=0,timer=0;
  function go(){
    try{ws=new WebSocket(url)}catch(e){status('error','Could not open '+label+' feed.');return}
    ws.binaryType='arraybuffer';
    ws.onopen=function(){opened=true;fails=0;FEED_BLOCKED=false;syncBlur();status('live');clearLastErr();onOpen(ws)};
    ws.onmessage=function(ev){onMsg(ev.data)};
    ws.onclose=function(){if(stop)return;fails++;if(!opened&&fails>=3){var m=label+' refused the connection. The token may be expired or the data subscription inactive.';if(onRefuse)onRefuse(m);else expired(m);return}
      status('reconnecting');timer=setTimeout(go,Math.min(30000,1500*fails))};
    ws.onerror=function(){};
  }
  go();
  return{stop:function(){stop=true;clearTimeout(timer);if(ws)try{ws.close()}catch(e){}}};
}
function kiteEngine(s){
  var map={},list=[];
  Object.keys(INS.idx).forEach(function(k){var t=INS.idx[k].k;if(t){map[t]=k;list.push(t)}});
  Object.keys(INS.eq).forEach(function(k){var t=INS.eq[k][0];map[t]=k;list.push(t)});
  return wsEngine('wss://ws.kite.trade?api_key='+encodeURIComponent(s.key)+'&access_token='+encodeURIComponent(s.token),function(ws){
    ws.send(JSON.stringify({a:'subscribe',v:list}));ws.send(JSON.stringify({a:'mode',v:['quote',list]}));
  },function(d){
    if(typeof d==='string'){try{var m=JSON.parse(d);if(m.type==='error')status('error','Kite: '+m.data)}catch(e){}return}
    if(!d||d.byteLength<4)return;var v=new DataView(d),n=v.getInt16(0),o=2;
    for(var i=0;i<n&&o+2<=d.byteLength;i++){
      var len=v.getInt16(o);o+=2;if(len<8||o+len>d.byteLength)break;
      var tk=v.getUint32(o),sym=map[tk],ltp=v.getInt32(o+4)/100,close=0;
      if(len===28||len===32){close=v.getInt32(o+20)/100;setX(sym,{h:v.getInt32(o+8)/100,l:v.getInt32(o+12)/100,o:v.getInt32(o+16)/100})}
      else if(len>=44){close=v.getInt32(o+40)/100;setX(sym,{atp:v.getInt32(o+12)/100,v:v.getUint32(o+16),tbq:v.getUint32(o+20),tsq:v.getUint32(o+24),o:v.getInt32(o+28)/100,h:v.getInt32(o+32)/100,l:v.getInt32(o+36)/100})}
      setQ(sym,ltp,close);o+=len;
    }
  },'Kite',function(m){kiteDiagnose(s,m)});
}
/* DHANFIX: Dhan sends several packets per WebSocket message (8-byte header: code u8, message length int16 LE at offset 1,
   segment u8, security id u32 LE), so every packet in a message is parsed, not only the first. Prev close only arrives in
   code-6 packets (often only for indices), so yesterday's closes are also fetched once per IST day from Dhan's quote API
   through /api/broker/dhan/quote and injected exactly like a code-6 packet. A real code-6 packet always wins. */
var DHAN_LEN={2:16,4:50,5:12,6:16,7:16,8:162,50:10},DPK='vayron_dhan_prev_v1';
function dhanPackets(d,fn){if(!d||typeof d==='string'||!d.byteLength)return 0;var v=new DataView(d),o=0,n=0,N=d.byteLength;
  while(o+8<=N&&n<5000){var code=v.getUint8(o),len=v.getInt16(o+1,true),k=DHAN_LEN[code];
    if(k&&len===k-8)len=k; /* tolerate a payload-only length field */
    if(!(len>=8&&o+len<=N)){if(k&&o+k<=N)len=k;else break}
    fn(v,o,len,code);o+=len;n++}
  return n}
function dhanSetPrev(sym,pc){if(!sym||!(pc>0))return;var q=LIVE[sym];if(q&&q.p)setQ(sym,q.p,pc);else (LIVE[sym]=q||{}).prev=pc}
function dhanPrevFetch(s,list,map,got6){
  var day=istDate(),c=jget(DPK),tries=0,stop=false,timer=0;
  function apply(p){var n=0;for(var k in p){var sym=map[k];if(sym&&!got6[sym]){dhanSetPrev(sym,+p[k]);n++}}if(n)tick();return n}
  if(c&&c.d===day&&c.c===String(s.key)&&c.p&&apply(c.p)>0)return{stop:function(){}};
  function go(){if(stop)return;tries++;var body={client_id:String(s.key),access_token:String(s.token),IDX_I:[],NSE_EQ:[]};
    list.forEach(function(x){body[x.ExchangeSegment].push(+x.SecurityId)});
    (F0||fetch).call(window,'/api/broker/dhan/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',cache:'no-store'})
      .then(function(r){return r.json().catch(function(){return null}).then(function(j){return{st:r.status,j:j}})})
      .then(function(x){if(stop)return;var data=x.j&&x.j.data,p={},open=mktOpenIST();
        if(x.st===200&&data&&typeof data==='object'){
          [['IDX_I','0'],['NSE_EQ','1']].forEach(function(sg){var m=data[sg[0]]||{};for(var id in m){var e=m[id]||{},lp=+e.last_price,nc=e.net_change,pc=0;
            if(nc!=null&&isFinite(+nc)&&lp>0)pc=lp-(+nc);else if(!open&&e.ohlc&&+e.ohlc.close>0)pc=+e.ohlc.close;
            if(pc>0&&lp>0&&(pc>lp*1.3||pc<lp/1.3))pc=0; /* sanity: NSE bands are at most 20% a day */
            if(pc>0)p[sg[1]+':'+id]=Math.round(pc*100)/100}});
          if(Object.keys(p).length){apply(p);
            /* before 9:15 IST on a weekday the quote still describes the last session, so its prev close is a day old for today:
               use it now, but don't cache it, and fetch again just after the open */
            var d=new Date(Date.now()+19800000),w=d.getUTCDay(),mm=d.getUTCHours()*60+d.getUTCMinutes();
            if(w!==0&&w!==6&&mm<556){tries=0;timer=setTimeout(go,Math.max(5000,nextIST(9,16)-Date.now()))}else jset(DPK,{d:day,c:String(s.key),p:p});return}}
        if(x.st===401||x.st===403||x.st===400)return; /* bad token / no Data API: retrying will not help; the feed shows its own error */
        retry()},function(){if(!stop)retry()})}
  function retry(){if(tries<5)timer=setTimeout(go,Math.min(600000,30000*Math.pow(2,tries-1)))}
  go();
  return{stop:function(){stop=true;clearTimeout(timer)}};
}
function dhanEngine(s){
  var map={},list=[],got6={},pf=null;
  Object.keys(INS.idx).forEach(function(k){map['0:'+INS.idx[k].d]=k;list.push({ExchangeSegment:'IDX_I',SecurityId:String(INS.idx[k].d)})});
  Object.keys(INS.eq).forEach(function(k){map['1:'+INS.eq[k][2]]=k;list.push({ExchangeSegment:'NSE_EQ',SecurityId:String(INS.eq[k][2])})});
  var e=wsEngine('wss://api-feed.dhan.co?version=2&token='+encodeURIComponent(s.token)+'&clientId='+encodeURIComponent(s.key)+'&authType=2',function(ws){
    for(var i=0;i<list.length;i+=100){var c=list.slice(i,i+100);ws.send(JSON.stringify({RequestCode:17,InstrumentCount:c.length,InstrumentList:c}))}
    if(!pf)pf=dhanPrevFetch(s,list,map,got6);
  },function(d){
    dhanPackets(d,function(v,o,len,code){
      if(code===50){if(len>=10)status('error','Dhan disconnected the feed (code '+v.getInt16(o+8,true)+'). Check your Data API subscription / token.');else status('error','Dhan disconnected the feed. Check your Data API subscription / token.');return}
      var sym=map[v.getUint8(o+3)+':'+v.getUint32(o+4,true)];if(!sym||len<12)return;
      if(code===6){var pc=v.getFloat32(o+8,true);if(pc>0){got6[sym]=1;dhanSetPrev(sym,pc)}}
      else if(code===4&&len>=50){setX(sym,{atp:v.getFloat32(o+18,true),v:v.getInt32(o+22,true),tsq:v.getInt32(o+26,true),tbq:v.getInt32(o+30,true),o:v.getFloat32(o+34,true),h:v.getFloat32(o+42,true),l:v.getFloat32(o+46,true)});setQ(sym,v.getFloat32(o+8,true),0)}
      else if((code===2||code===4||code===8)&&len>=16)setQ(sym,v.getFloat32(o+8,true),0);
    });
  },'Dhan');
  return{stop:function(){if(pf)pf.stop();e.stop()}};
}
function pollEngine(fn,every){
  var stop=false,t=0;
  function loop(){if(stop)return;if(document.hidden){t=setTimeout(loop,every);return}
    fn().then(function(ok){if(!stop&&ok!==false)t=setTimeout(loop,every)},function(){if(!stop){status('reconnecting');t=setTimeout(loop,every*2)}})}
  loop();return{stop:function(){stop=true;clearTimeout(t)}};
}
function upstoxEngine(s){
  var map={},keys=[];
  Object.keys(INS.idx).forEach(function(k){map[INS.idx[k].u]=k;keys.push(INS.idx[k].u)});
  Object.keys(INS.eq).forEach(function(k){var ik='NSE_EQ|'+INS.eq[k][1];map[ik]=k;keys.push(ik)});
  var url='https://api.upstox.com/v3/market-quote/ltp?instrument_key='+encodeURIComponent(keys.join(','));
  return pollEngine(function(){
    return F0(url,{headers:{Accept:'application/json',Authorization:'Bearer '+s.token},cache:'no-store',credentials:'omit'}).then(function(r){
      if(r.status===401||r.status===403){expired('Upstox rejected the token (expired after 3:30 AM or revoked). Please connect again.');return false}
      if(r.status===429){status('reconnecting','Upstox rate limit, slowing down.');return true}
      return r.json().then(function(j){var d=(j&&j.data)||{};Object.keys(d).forEach(function(k){var x=d[k];setQ(map[x.instrument_token],+x.last_price,+x.cp)});status('live');return true});
    });
  },5000);
}
function fyersEngine(s){
  var idx=Object.keys(INS.idx).map(function(k){return[INS.idx[k].f,k]}),eq=Object.keys(INS.eq).map(function(k){return['NSE:'+k+'-EQ',k]}),map={},pos=0,per=50-idx.length;
  idx.concat(eq).forEach(function(a){map[a[0]]=a[1]});
  return pollEngine(function(){
    var qd=jget(FQ)||{};if(qd.day!==istDay())qd={day:istDay(),n:0};
    if(qd.n>=4500){status('error','FYERS free daily data limit (5,000 calls) is nearly used. Live prices resume tomorrow.');return Promise.resolve(true)}
    var chunk=eq.slice(pos,pos+per);pos+=per;if(pos>=eq.length)pos=0;
    var syms=idx.concat(chunk).map(function(a){return a[0]}).join(',');qd.n++;jset(FQ,qd);
    return F0('https://api-t1.fyers.in/data/quotes?symbols='+encodeURIComponent(syms),{headers:{Authorization:s.key+':'+s.token},cache:'no-store',credentials:'omit'}).then(function(r){
      return r.json().then(function(j){
        if(j&&j.s==='error'&&[-8,-15,-16,-17].indexOf(+j.code)>=0){expired('FYERS token expired (daily at 6:30 AM) or invalid. Please connect again.');return false}
        if(r.status===429){status('reconnecting','FYERS rate limit, slowing down.');return true}
        (j&&j.d||[]).forEach(function(x){var v=x.v||{};if(x.s==='ok'||v.lp)setQ(map[x.n]||map[v.symbol],+v.lp,+v.prev_close_price||0)});status('live');return true;
      });
    });
  },12000);
}

var ANGEL_TOK=null,ANGEL_EXP='Angel One session expired (it ends at midnight IST) or was revoked. Please connect again.';
function loadAngelTok(){return ANGEL_TOK?Promise.resolve(ANGEL_TOK):(F0||fetch)('/broker/angel_tokens.json?v=1').then(function(r){return r.json()}).then(function(j){ANGEL_TOK=j;return j})}
function angelHeaders(s,withAuth){
  var h={'Content-Type':'application/json','Accept':'application/json','X-UserType':'USER','X-SourceID':'WEB','X-ClientLocalIP':'127.0.0.1','X-ClientPublicIP':'127.0.0.1','X-MACAddress':'00:00:00:00:00:00','X-PrivateKey':s.key};
  if(withAuth)h.Authorization='Bearer '+(s.token||'').replace(/^Bearer\s+/i,'');
  return h;
}
function angelLogin(apiKey,client,pin,totp){
  return F0('https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:angelHeaders({key:apiKey},false),
    body:JSON.stringify({clientcode:client,password:pin,totp:totp})
  }).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){
    var j=x.j||{};
    if(j.status&&j.data&&j.data.jwtToken){
      return{jwt:j.data.jwtToken,feed:j.data.feedToken,client:client,key:apiKey};
    }
    var msg=(j.message||j.errorcode||'Login failed').toString();
    if(/invalid|incorrect|totp|pin|credential|password/i.test(msg))msg='Angel One: '+msg+'. Check API key, client code, PIN and TOTP.';
    else msg='Angel One: '+msg;
    throw new Error(msg);
  });
}
function angelParseTick(buf,map){
  if(!buf||buf.byteLength<51)return;var v=new DataView(buf);
  var tokBytes=new Uint8Array(buf,2,25),tok='';
  for(var i=0;i<25;i++){if(tokBytes[i]===0)break;tok+=String.fromCharCode(tokBytes[i])}
  var sym=map[tok];if(!sym)return;
  var ltp=Number(v.getBigInt64(43,true))/100,close=0;
  if(buf.byteLength>=123)close=Number(v.getBigInt64(115,true))/100;
  setQ(sym,ltp,close);
}
function angelRestPoll(s,map,tokens){
  /* Batch quote fallback — no Worker; browser → Angel only */
  var chunks=[];for(var i=0;i<tokens.length;i+=50)chunks.push(tokens.slice(i,i+50));
  var pos=0,bk=0;
  return pollEngine(function(){
    var batch=chunks[pos]||[];pos=(pos+1)%Math.max(1,chunks.length);
    return F0('https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote',{
      method:'POST',credentials:'omit',cache:'no-store',headers:angelHeaders(s,true),
      body:JSON.stringify({mode:'LTP',exchangeTokens:{NSE:batch}})
    }).then(function(r){
      /* ANGELFIX: only a confirmed token error (401, or AG8001/AG8002/AG8003 / "Invalid Token" in the body) logs out.
         Angel answers rate limits with HTTP 403 "Access denied because of exceeding access rate" — that only slows the poll. */
      return r.text().then(function(t){var j=null;try{j=JSON.parse(t)}catch(e){}
        var code=String((j&&(j.errorcode||j.errorCode))||''),m=String((j&&j.message)||t||'');
        if(r.status===401||/^AG800[123]$/.test(code)||/invalid token|token (is )?expired|token missing/i.test(m)){expired(ANGEL_EXP);return false}
        if(r.status===429||r.status===403||r.status>=500||/exceed|rate.?limit|access rate|too many/i.test(m)||/^AB(1004|2000|2001|1010|1011)$/.test(code)){
          bk=Math.min(60000,bk?bk*2:10000);setLastErr('Angel One quotes: '+(code||('HTTP '+r.status))+' '+m.slice(0,80)+' (slowing down, session kept)','angelone');
          status('reconnecting','Angel One is rate-limiting requests; slowing down and retrying.');return new Promise(function(res){setTimeout(function(){res(true)},bk)})}
        bk=0;
        if(j&&(j.status===false||j.status==='false')){status('reconnecting',j.message||'Angel quote error');return true}
        var fetched=((j&&j.data)||{}).fetched||(j&&j.data)||[];
        if(Array.isArray(fetched))fetched.forEach(function(x){
          var tok=String(x.symbolToken||x.symboltoken||x.token||'');
          var sym=map[tok];if(!sym)return;
          setQ(sym,+(x.ltp||x.tradePrice||x.last_traded_price||0),+(x.close||x.closePrice||0));
        });
        status('live');return true;
      });
    });
  },5000);
}
function angelEngine(s){
  return loadAngelTok().then(function(AT){
    var map={},tokens=[],list=[];
    Object.keys(AT.idx||{}).forEach(function(k){var t=String(AT.idx[k].t);map[t]=k;tokens.push(t);list.push(t)});
    Object.keys(AT.eq||{}).forEach(function(k){var t=String(AT.eq[k]);map[t]=k;tokens.push(t);list.push(t)});
    var url='wss://smartapisocket.angelone.in/smart-stream?clientCode='+encodeURIComponent(s.client||'')+
      '&feedToken='+encodeURIComponent(s.feed||'')+'&apiKey='+encodeURIComponent(s.key||'');
    var ws=null,stop=false,opened=false,fails=0,timer=0,pingT=0,rest=null;
    function stopAll(){stop=true;clearTimeout(timer);clearInterval(pingT);if(ws)try{ws.close()}catch(e){}if(rest)try{rest.stop()}catch(e){}}
    function startRest(why){if(rest||stop)return;status('reconnecting',why||'Angel socket unavailable, using quote polling.');rest=angelRestPoll(s,map,tokens)}
    function go(){
      if(stop)return;
      try{ws=new WebSocket(url)}catch(e){startRest('Could not open Angel One feed.');return}
      ws.binaryType='arraybuffer';
      ws.onopen=function(){
        opened=true;fails=0;status('live');
        /* Subscribe in chunks of 100 tokens (LTP mode=1, NSE_CM=1) */
        for(var i=0;i<list.length;i+=100){
          var c=list.slice(i,i+100);
          try{ws.send(JSON.stringify({action:1,params:{mode:1,tokenList:[{exchangeType:1,tokens:c}]}}))}catch(e){}
        }
        clearInterval(pingT);pingT=setInterval(function(){if(ws&&ws.readyState===1)try{ws.send('ping')}catch(e){}},30000);
      };
      ws.onmessage=function(ev){
        if(typeof ev.data==='string'){if(ev.data==='pong')return;try{var m=JSON.parse(ev.data);if(m&&m.message)status('error','Angel One: '+m.message)}catch(e){}return}
        angelParseTick(ev.data,map);
      };
      ws.onclose=function(){
        clearInterval(pingT);if(stop)return;fails++;
        if(!opened&&fails>=2){startRest('Angel One WebSocket refused browser auth; using REST quotes.');return}
        status('reconnecting');timer=setTimeout(go,Math.min(30000,1500*fails));
      };
      ws.onerror=function(){};
    }
    go();
    return{stop:stopAll};
  });
}
var kiteChecking=false;
function kiteDiagnose(s,wsMsg){
  if(kiteChecking)return;kiteChecking=true;
  FEED_BLOCKED=true;syncBlur();
  var pending='Kite refused the live feed. Checking why…';
  setLastErr(pending,'kite');status('error',pending);stopEngine();
  function finish(msg,clearSession){
    setLastErr(msg,'kite');status('error',msg);
    if(clearSession){FEED_BLOCKED=false;jdel(SK);SESS=null;syncBlur()}
    renderChip();renderModal();kiteChecking=false;
  }
  fetch('/api/broker/kite/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:s.key,access_token:s.token}),credentials:'omit',cache:'no-store'})
    .then(function(r){return r.json()})
    .then(function(j){
      if(!SESS||SESS.id!=='kite'||SESS.token!==s.token){kiteChecking=false;return}
      if(!j){finish(wsMsg||'Kite refused the live feed. Diagnostic returned no result.',false);return}
      var typ=String(j.error_type||j.quote_error_type||'');
      var qmsg=String(j.quote_message||j.message||'');
      if(j.profile_ok){
        if(j.quote_ok){finish('Kite is connected and quotes work, but the live WebSocket was refused. Live prices will not stream until the socket is allowed (Vayron does not poll quotes through the relay).',false);return}
        if(/PermissionException/i.test(typ)||/insufficient|permission|not subscribed|missing required|market.?data/i.test(qmsg)){
          finish('Kite login works, but Kite refused market data ('+typ+(qmsg?': '+qmsg:'')+'). Check that this API key is from a Kite Connect app (₹500/mo), not a free Personal app.',false);return;
        }
        finish('Kite connected, but the live feed was refused'+(qmsg?': '+qmsg:'. '+(wsMsg||'')),false);return;
      }
      if(/NetworkException/i.test(typ)||/did not respond/i.test(String(j.message||''))){
        finish(wsMsg||'Kite refused the live feed. Could not confirm the login just now.',false);return;
      }
      finish('Kite login expired/invalid, connect again',true);
    })
    .catch(function(){if(!SESS||SESS.id!=='kite'){kiteChecking=false;return}finish(wsMsg||'Kite refused the live feed. Could not reach the diagnostic check.',false)});
}
function startEngine(){
  stopEngine();if(!SESS)return;status('connecting');
  var id=SESS.id;
  if(id==='angelone'){
    angelEngine(SESS).then(function(e){if(SESS&&SESS.id==='angelone')ENG=e}).catch(function(err){status('error',(err&&err.message)||'Could not start Angel One feed.')});
    return;
  }
  loadIns().then(function(){
    if(!SESS)return;id=SESS.id;
    ENG=id==='kite'?kiteEngine(SESS):id==='dhan'?dhanEngine(SESS):id==='upstox'?upstoxEngine(SESS):id==='fyers'?fyersEngine(SESS):null;
  }).catch(function(){status('error','Could not load the instrument list.')});
}
function disconnect(forgetKeys){
  stopEngine();var id=SESS&&SESS.id;jdel(SK);SESS=null;LIVE={};FEED_BLOCKED=false;kiteChecking=false;
  if(forgetKeys&&id)jdel(KK+id);jdel(PK,sessionStorage);STATE='';ERR='';syncBlur();renderChip();renderModal();
}

/* ---------- connect flows ---------- */
function beginOAuth(b,key,secret,remember,redir){
  var st=rnd()+'~'+location.host;redir=okCb(redir)?redir:CANON;
  jset(PK,{id:b.id,key:key,secret:secret,state:st,redir:redir,back:location.pathname+location.search,remember:!!remember,t:Date.now()},sessionStorage);
  if(remember)jset(KK+b.id,{key:key,secret:secret,redir:redir});else jdel(KK+b.id);try{localStorage.setItem('vayron_broker_redir_'+b.id,redir)}catch(e){}
  var u;
  if(b.id==='kite')u='https://kite.zerodha.com/connect/login?v=3&api_key='+encodeURIComponent(key)+'&redirect_params='+encodeURIComponent('b=kite&st='+st);
  else if(b.id==='fyers')u='https://api-t1.fyers.in/api/v3/generate-authcode?client_id='+encodeURIComponent(key)+'&redirect_uri='+encodeURIComponent(redir)+'&response_type=code&state='+encodeURIComponent(st);
  else if(b.id==='upstox')u='https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id='+encodeURIComponent(key)+'&redirect_uri='+encodeURIComponent(redir)+'&state='+encodeURIComponent(st);
  location.assign(u);
}
/* internal connect counter: {broker,method,ok,kind} only (no key, token, client code or name); one 'active' ping per browser per day */
var BSK='vayron_bstat_v1';
function bstat(id,m,ok,kind){try{if(!/^(fyers|kite|upstox|angelone|dhan)$/.test(id||''))return;m=(m==='token'||id==='dhan')?'token':'login';kind=kind||'c';
  var d=istDay(),seen=jget(BSK)||{};if(seen.d!==d)seen={d:d};var k=kind+':'+id+':'+m+':'+(ok?1:0);if(kind==='a'&&(seen[k]||seen['c:'+id+':'+m+':1']))return;if(!ok&&seen[k]>=3)return;
  seen[k]=(seen[k]||0)+1;jset(BSK,seen);
  (F0||fetch).call(window,'/api/bstat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({b:id,m:m,ok:ok?1:0,k:kind}),credentials:'same-origin',keepalive:true,cache:'no-store'}).catch(function(){})}catch(e){}}
function saveSession(id,key,token,extra){var was=hasBrokerSession();try{sessionStorage.removeItem(SMK)}catch(e){}FEED_BLOCKED=false;clearLastErr();SESS={id:id,key:key,token:token,exp:expFor(id),at:Date.now()};if(extra){for(var k in extra)SESS[k]=extra[k]}jset(SK,SESS);syncBlur();bstat(id,SESS.via,1);
  /* page was gated (no data requested yet): reload so the dashboards fetch their data now */
  if(!was&&!/^\/broker\/callback/.test(location.pathname)&&(gatedPath()||homePath()))setTimeout(function(){location.reload()},400)}
function cbComm(){return'<p style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center"><b>Join the ABCD_AI community:</b> <a href="'+COMM.discord+'" target="_blank" rel="noopener noreferrer" style="background:#5865F2;color:#fff;padding:6px 12px;border-radius:999px;font-weight:600;text-decoration:none">Discord</a> <a href="'+COMM.telegram+'" target="_blank" rel="noopener noreferrer" style="background:#229ED9;color:#fff;padding:6px 12px;border-radius:999px;font-weight:600;text-decoration:none">Telegram</a></p>'}
function handleCallback(){
  var q=new URLSearchParams(CBQ),out=document.getElementById('bk-cb');
  var pend=jget(PK,sessionStorage);jdel(PK,sessionStorage);
  function say(t,ok){if(out)out.innerHTML=t+(ok?'':'<p><a href="/pulse/">Back to Vayron</a></p>')}
  function done(id){say('<b>Connected.</b> Live data via '+esc(B(id).name)+' is now on in this browser. Taking you back…',true);setTimeout(function(){location.replace(pend&&pend.back&&pend.back.charAt(0)==='/'&&pend.back.charAt(1)!=='/'?pend.back:'/pulse/')},3500)}
  function fail(m){setLastErr(m,pend&&pend.id);if(pend&&pend.id&&!/cancelled/.test(m))bstat(pend.id,'login',0);say('<b>Couldn’t connect.</b> '+esc(m))}
  if(!pend||Date.now()-pend.t>15*60000)return fail('This login link has expired. Please start again from “Connect broker”.');
  var st=q.get('state')||q.get('st');if(st!==pend.state)return fail('Security check failed (state mismatch). Please start again.');
  if(pend.id==='kite'){
    if(q.get('status')!=='success'||!q.get('request_token'))return fail('Kite login was cancelled.');
    sha256hex(pend.key+q.get('request_token')+pend.secret).then(function(cs){
      return fetch('/api/broker/kite/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:pend.key,request_token:q.get('request_token'),checksum:cs}),credentials:'omit',cache:'no-store'});
    }).then(function(r){return r.json()}).then(function(j){if(j&&j.access_token){saveSession('kite',pend.key,j.access_token,{via:'login'});done('kite')}else fail('Kite: '+((j&&j.message)||'token exchange failed')+'. Check the API secret and that the app is on the paid Connect plan.')}).catch(function(){fail('Network error during the Kite token exchange.')});
  }else if(pend.id==='fyers'){
    var code=q.get('auth_code');if(!code)return fail('FYERS login was cancelled.');
    sha256hex(pend.key+':'+pend.secret).then(function(h){
      return fetch('https://api-t1.fyers.in/api/v3/validate-authcode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'authorization_code',appIdHash:h,code:code}),credentials:'omit'});
    }).then(function(r){return r.json()}).then(function(j){if(j&&j.access_token){saveSession('fyers',pend.key,j.access_token,{via:'login'});done('fyers')}else fail('FYERS: '+((j&&j.message)||'token exchange failed'))}).catch(function(){fail('Network error talking to FYERS.')});
  }else if(pend.id==='upstox'){
    var c2=q.get('code');if(!c2)return fail('Upstox login was cancelled.');
    fetch('https://api.upstox.com/v2/login/authorization/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},credentials:'omit',
      body:new URLSearchParams({code:c2,client_id:pend.key,client_secret:pend.secret,redirect_uri:(pend.redir||CB),grant_type:'authorization_code'})})
    .then(function(r){return r.json()}).then(function(j){if(j&&j.access_token){saveSession('upstox',pend.key,j.access_token,{via:'login'});done('upstox')}else fail('Upstox: '+((j&&j.errors&&j.errors[0]&&j.errors[0].message)||'token exchange failed'))}).catch(function(){fail('Network error talking to Upstox.')});
  }else fail('Unknown broker.');
}


/* ---------- broker gate UI (shadow DOM; same BROKERS data as the Connect modal) ---------- */
var RULES=[
 ['SEBI circular SEBI/HO/MRD/MRD-PoD-3/P/CIR/2024/56 (24 May 2024)','Norms for sharing of real-time price data to third parties','https://www.sebi.gov.in/legal/circulars/may-2024/norms-for-sharing-of-real-time-price-data-to-third-parties_83572.html','SEBI, 24 May 2024'],
 ['SEBI circular (8 May 2026)','Norms for sharing and usage of price data for educational purposes: price data used for education must lag by at least 30 days, from 1 July 2026','https://www.sebi.gov.in/legal/circulars/may-2026/norms-for-sharing-and-usage-of-price-data-for-educational-purposes_101293.html','SEBI, 8 May 2026'],
 ['SEBI circular SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/0000013 (4 Feb 2025)','Safer participation of retail investors in algorithmic trading: the framework for retail API access through your broker','https://www.sebi.gov.in/legal/circulars/feb-2025/safer-participation-of-retail-investors-in-algorithmic-trading_91614.html','SEBI, 4 Feb 2025'],
 ['NSE market data policy','Use and redistribution of NSE market data needs NSE’s permission or licence','https://www.nseindia.com/static/market-data/nse-data-policy','NSE data policy']
];
var GCSS='.comm{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px;font-size:12.5px;color:var(--gm,var(--mu))}.comm b{color:var(--gf,var(--fg));font-weight:600;margin-right:2px}.cbtn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12.5px;font-weight:600;color:#fff!important;text-decoration:none!important}.cbtn:hover{opacity:.9}.cbtn.dc{background:#5865F2}.cbtn.tg{background:#229ED9}.cbtn svg{width:14px;height:14px;fill:#fff}'+':host{all:initial;--gc:var(--surface-raised,var(--card,#fff));--gs:var(--surface-muted,var(--bg,#f5f7fa));--gp:var(--background,var(--bg,#f6f6f8));--gf:var(--foreground,var(--fg,#0f172a));--gm:var(--muted-foreground,var(--mut,#5b6474));--gl:var(--border,var(--line,#e5e7eb));--ga:var(--brand,var(--acc,#2563eb))}'+
'*{box-sizing:border-box;font-family:var(--font-inter,system-ui),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'+
'.gp{color:var(--gf);font-size:14px;line-height:1.55}'+
'.fixed{position:fixed;left:0;right:0;bottom:0;z-index:30;overflow:auto;background:var(--gp);-webkit-overflow-scrolling:touch}'+
'.in{max-width:760px;margin:0 auto;padding:28px 16px 96px}.inline .in{max-width:none;padding:4px 0 8px}'+
'.ov{position:fixed;inset:0;z-index:2147482000;background:rgba(2,6,23,.55);backdrop-filter:blur(2px);display:flex;align-items:flex-start;justify-content:center;padding:6vh 12px;overflow:auto}'+
'.card{background:var(--gc);border:1px solid var(--gl);border-radius:14px;padding:22px 22px 18px}.ov .card{box-shadow:0 20px 60px rgba(0,0,0,.3);max-width:640px;width:100%}'+
'h1{font-family:var(--font-outfit,var(--font-inter,system-ui)),system-ui,sans-serif;font-size:20px;line-height:1.3;margin:0;letter-spacing:-.01em;font-weight:650}'+
'p{margin:8px 0 0}.mu{color:var(--gm)}.sm{font-size:12px}a{color:var(--ga);text-decoration:none}a:hover{text-decoration:underline}'+
'.cite{margin-top:10px;font-size:11.5px;color:var(--gm);line-height:1.6}.cite a{color:var(--gm);text-decoration:underline;text-decoration-color:var(--gl);text-underline-offset:2px}.cite a:hover{color:var(--ga)}'+
'.row{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:16px}'+
'.btn{border:0;border-radius:10px;padding:10px 18px;font-weight:600;font-size:14px;cursor:pointer;background:var(--ga);color:#fff}.btn:hover{opacity:.92}'+
'.btn2{border:1px solid var(--gl);border-radius:10px;padding:9px 16px;font-weight:600;font-size:14px;cursor:pointer;background:var(--gc);color:var(--gf)}.btn2:hover{border-color:var(--ga)}.btn2 .sl{font-weight:500;color:var(--gm);font-size:12.5px}'+
'.lnk{border:0;background:none;color:var(--gm);font-size:13px;cursor:pointer;padding:6px 2px;text-decoration:none}.lnk:hover{color:var(--gf)}'+
'.lbl{margin:18px 0 6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--gm)}'+
'.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}'+
'.bk{border:1px solid var(--gl);border-radius:10px;padding:9px 11px;background:var(--gc);font-size:12.5px}.bk.soon{opacity:.6}'+
'.bk summary{list-style:none;cursor:pointer;display:flex;flex-direction:column;gap:1px}.bk summary::-webkit-details-marker{display:none}'+
'.bk .n{font-weight:600;font-size:13.5px;display:flex;align-items:center;gap:6px}.bk .n:after{content:"›";margin-left:auto;color:var(--gm);transition:transform .15s}.bk[open] .n:after{transform:rotate(90deg)}.bk.soon .n:after{content:""}'+
'.bk .pr{color:var(--gm)}.bk .dt{margin-top:7px;padding-top:7px;border-top:1px solid var(--gl);color:var(--gm);font-size:12px}.bk .dt ol{margin:4px 0 4px 16px;padding:0}.bk .dt li{margin:2px 0}.bk .dt code{font-size:11px;word-break:break-all}'+
'.bk .btn{padding:6px 12px;font-size:12px;margin-top:6px}.bk[open]{grid-column:1/-1}'+
'.tag{font-size:10px;font-weight:600;padding:1px 6px;border-radius:999px;background:var(--gs);color:var(--gm)}'+
'.free{margin-top:16px;padding:10px 12px;border-radius:10px;background:var(--gs);font-size:12.5px;color:var(--gm)}.free b{color:var(--gf)}'+
'.x{margin-left:auto;border:0;background:none;color:var(--gm);font-size:22px;cursor:pointer;line-height:1;padding:0 0 0 8px}.hd{display:flex;align-items:flex-start}'+
'.nc{position:fixed;right:14px;bottom:14px;z-index:40;max-width:330px;background:var(--gc);color:var(--gf);border:1px solid var(--gl);border-radius:14px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.16);font-size:13px;line-height:1.45}.nc .hd b{font-size:14px}.nc .x{font-size:20px}.nc p{margin:4px 0 0;font-size:12.5px}.nc .row{margin-top:10px}.nc .btn{padding:7px 14px;font-size:13px}'+
'@media (max-width:640px){.nc{left:10px;right:10px;bottom:62px;max-width:none}}'+
'@media (max-width:520px){.card{padding:18px 16px 14px}h1{font-size:18px}.grid{grid-template-columns:1fr 1fr}.ov{padding:3vh 8px}}';
function gbCard(b){
  var soon=b.status==='soon';
  var top='<summary><span class="n">'+esc(b.short||b.name)+(soon?'<span class="tag">Soon</span>':'')+'</span><span class="pr">'+esc(b.price)+'</span></summary>';
  var dt='<div class="dt">';
  if(b.short&&b.short!==b.name)dt+='<div><b>'+esc(b.name)+'</b></div>';
  if(b.priceNote)dt+='<div>'+esc(b.priceNote)+'</div>';
  if(soon)dt+='<div>'+esc(b.why||'')+'</div>';
  else{
    dt+='<div>You need: an account with '+esc(b.short||b.name)+', your own API app, and '+b.fields.map(function(f){return esc(f[1])}).join(', ')+'.</div>'+
      '<ol>'+b.steps.map(function(x){return'<li>'+fmtStep(x)+'</li>'}).join('')+'</ol>'+
      (b.auth==='oauth'||b.auth==='angel'?'<div>Redirect URL: <code>'+esc(b.auth==='angel'?CANON:CB)+'</code></div>':'')+
      '<div>Data: '+esc(b.howData)+'</div>';
  }
  dt+='<div style="margin-top:4px">'+(soon?'':'<a href="'+esc(b.portal)+'" target="_blank" rel="noopener noreferrer">Developer page ↗</a> · ')+'<a href="'+esc(b.src)+'" target="_blank" rel="noopener noreferrer">Price source ↗</a></div>'+
    (soon?'':'<button class="btn" data-gb="'+b.id+'">Connect '+esc(b.short||b.name)+'</button>')+'</div>';
  return'<details class="bk'+(soon?' soon':'')+'">'+top+dt+'</details>';
}
function gateHTML(mode){
  var free=BROKERS.filter(function(b){return b.group==='free'}),paid=BROKERS.filter(function(b){return b.group==='paid'});
  var x=mode==='overlay'?'<button class="x" data-g="dismiss" aria-label="Close">×</button>':'';
  var browse=(mode==='overlay'?'<button class="lnk" data-g="dismiss">Browse News &amp; Academy</button>':'<a class="lnk" href="/news/">Browse News &amp; Academy</a>');
  return'<div class="card"><div class="hd"><h1>Connect your broker for live market data</h1>'+x+'</div>'+
    '<p class="mu">Under SEBI and NSE rules, live exchange prices can’t be shown publicly by third-party sites. Until you connect, the dashboards show labelled example data (not real or live prices). Connect your own broker and live data comes from its API straight to your browser, for you only.</p>'+
    '<div class="cite">Rules: '+RULES.map(function(r){return'<a href="'+r[2]+'" target="_blank" rel="noopener noreferrer" title="'+esc(r[1])+'">'+esc(r[3])+'</a>'}).join(' · ')+'</div>'+
    '<div class="row"><button class="btn" data-g="connect">Connect your broker</button>'+browse+'</div>'+commHTML()+
    '<div class="lbl">Free API brokers</div><div class="grid">'+free.map(gbCard).join('')+'</div>'+
    '<div class="lbl">Paid API brokers · the broker charges you</div><div class="grid">'+paid.map(gbCard).join('')+'</div>'+
    '<div class="free"><b>Vayron is free and never charges you.</b> Any fee is your broker’s own API charge. Ask that broker’s API section about it, then connect here.</div>'+
    '<p class="sm mu" style="margin-top:12px">Open to all: <a href="/news/">News</a> · <a href="/academy/">Academy</a> · <a href="/crypto/">Crypto</a> · <a href="/journal/">Journal</a> · <a href="/support/">Support</a> · <a href="/terms/">Terms</a></p></div>';
}
var gHost=null,gRoot=null,gMode='',ovHost=null,gateReady=0,gateWait=0;
/* keep our hosts attached if the page framework re-renders <body> */
setInterval(function(){if(!document.body)return;if(gHost&&!gHost.isConnected){var sl=gMode==='inline'&&document.getElementById('vayron-gate-inline');(sl||document.body).appendChild(gHost)}if(ovHost&&!ovHost.isConnected)document.body.appendChild(ovHost);if(bbHost&&!bbHost.isConnected)document.body.appendChild(bbHost);if(sbHost&&!sbHost.isConnected)document.body.appendChild(sbHost);if(host&&!host.isConnected)document.body.appendChild(host)},1000);
var OVK='vayron_gate_notice_dismissed_v1';
function gateClick(ev){
  var t=ev.target,a=t.closest&&t.closest('[data-g],[data-gb]');
  if(t.classList&&t.classList.contains('ov')){dismissOverlay();return}
  if(!a)return;
  if(a.getAttribute('data-gb')){dismissOverlay(true);open(a.getAttribute('data-gb'));return}
  var g=a.getAttribute('data-g');
  if(g==='connect'){dismissOverlay(true);open()}else if(g==='dismiss')dismissOverlay();else if(g==='sample'){dismissOverlay(true);enterSample()}
}
function dismissOverlay(silent){if(ovHost){ovHost.remove();ovHost=null}if(!silent)try{localStorage.setItem(OVK,'1')}catch(e){}}
function mkHost(id){var h=document.createElement('div');h.id=id;var r=h.attachShadow({mode:'open'});var st=document.createElement('style');st.textContent=GCSS;r.appendChild(st);r.addEventListener('click',gateClick);return[h,r]}
function headerBottom(){var h=document.querySelector('body>header,header.sticky,header');if(!h)return 0;var b=h.getBoundingClientRect().bottom;return b>0&&b<200?b:0}
function renderGate(){
  if(/^\/broker\/callback/.test(location.pathname))return;
  /* mount after the page has loaded/hydrated: nodes added to <body> before React hydrates cause a hydration error */
  if(!gateReady){if(!gateWait){gateWait=1;var go=function(){setTimeout(function(){gateReady=1;renderGate()},300)};if(document.readyState==='complete')go();else addEventListener('load',go)}return}
  var need=!hasBrokerSession(),ex=need&&(gatedPath()||homePath());
  if(sbHost&&!ex){sbHost.remove();sbHost=null}
  if(ovHost&&!ex)dismissOverlay(true);
  if(gHost&&(!need||!homePath())){gHost.remove();gHost=null;gMode=''}
  if(!need&&(gatedPath()||homePath()))renderBrokerBar();else if(bbHost){bbHost.remove();bbHost=null;document.documentElement.classList.remove('vayron-bkbar')}
  if(!ex)return;
  /* no broker: every dashboard shows the labelled example set (non-blocking bar + small dismissible card) */
  renderSampleBar();
  if(homePath()){
    var slot=document.getElementById('vayron-gate-inline');
    if(slot&&!gHost){var y=mkHost('vayron-gate');gHost=y[0];gRoot=y[1];gMode='inline';
      var w2=document.createElement('div');w2.className='gp inline';w2.innerHTML='<div class="in">'+gateHTML('page')+'</div>';gRoot.appendChild(w2);slot.appendChild(gHost)}
  }
  var seen='';try{seen=localStorage.getItem(OVK)||''}catch(e){}
  if(!seen&&!ovHost){var z=mkHost('vayron-gate-notice');ovHost=z[0];
    var o=document.createElement('div');o.className='nc';o.setAttribute('role','complementary');o.setAttribute('aria-label','Connect your broker');
    o.innerHTML='<div class="hd"><b>You’re viewing example data</b><button class="x" data-g="dismiss" aria-label="Dismiss">×</button></div><p class="mu">Charts and flows use a labelled example set, not real or live market prices. Connect your own broker to see live data, sent from its API to your browser only. Vayron is free.</p><div class="row"><button class="btn" data-g="connect">Connect your broker</button></div>';
    z[1].appendChild(o);document.body.appendChild(ovHost);}
}
var sbHost=null;
var SBCSS=':host{all:initial;--gc:var(--surface-raised,var(--card,#fff));--gf:var(--foreground,var(--fg,#0f172a));--gm:var(--muted-foreground,var(--mut,#5b6474));--gl:var(--border,var(--line,#e5e7eb));--ga:var(--brand,var(--acc,#2563eb))}'+
'*{box-sizing:border-box;font-family:var(--font-inter,system-ui),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'+
'.sb{position:fixed;top:0;left:0;right:0;height:40px;z-index:60;display:flex;align-items:center;gap:10px;padding:0 14px;background:#fef3c7;color:#713f12;border-bottom:1px solid #fcd34d;font-size:13px}'+
'.sb .d{width:8px;height:8px;border-radius:50%;background:#d97706;flex:none}.sb .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb .t b{font-weight:650}'+
'.sb button{border:0;border-radius:8px;padding:6px 12px;font-weight:600;font-size:12.5px;cursor:pointer;flex:none}.sb .c{background:var(--ga);color:#fff}.sb .x{background:transparent;color:#713f12;border:1px solid #f59e0b}'+
'.m{display:none}@media (max-width:640px){.sb{gap:8px;padding:0 10px;font-size:12px}.f{display:none}.m{display:inline}}'+
'@media (prefers-color-scheme:dark){.sb{background:#422006;color:#fde68a;border-color:#92400e}.sb .x{color:#fde68a;border-color:#b45309}}';
function renderSampleBar(){
  if(sbHost)return;sbHost=document.createElement('div');sbHost.id='vayron-sample-bar';var r=sbHost.attachShadow({mode:'open'});
  var st=document.createElement('style');st.textContent=SBCSS;r.appendChild(st);
  var b=document.createElement('div');b.className='sb';b.setAttribute('role','status');
  var put=function(c){b.innerHTML='<span class="d"></span><span class="t"><span class="f"><b>'+esc(c.banner)+'</b> · Connect your broker for live data</span><span class="m"><b>'+esc(c.mode==='real'?'Sample · '+c.label:'Example data · not live prices')+'</b></span></span><button class="c" data-s="connect">Connect broker</button>'};
  put(SCFG||SDEF);sampleCfg().then(put);
  b.addEventListener('click',function(e){var a=e.target.closest('[data-s]');if(!a)return;if(a.getAttribute('data-s')==='connect')open()});
  r.appendChild(b);document.body.appendChild(sbHost);
  hideLiveHints();setInterval(hideLiveHints,1500);
}
/* connected: slim bar stating the data source; lists views this broker cannot supply on this page */
var bbHost=null,updBrokerBar=null;
function fixFoot(){try{var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;while(n=w.nextNode())if(n.nodeValue.indexOf('Example data for education only')>=0)n.nodeValue=n.nodeValue.replace('Example data for education only','Data from your broker, for education only')}catch(e){}}
function renderBrokerBar(){
  if(bbHost)return;bbHost=document.createElement('div');bbHost.id='vayron-broker-bar';var r=bbHost.attachShadow({mode:'open'});
  var st=document.createElement('style');st.textContent=SBCSS+'.sb{background:#dcfce7;color:#14532d;border-bottom-color:#86efac}.sb .d{background:#16a34a}@media (prefers-color-scheme:dark){.sb{background:#052e16;color:#bbf7d0;border-color:#166534}}';r.appendChild(st);
  var b=document.createElement('div');b.className='sb';b.setAttribute('role','status');
  var put=function(){var nm=(B(SESS&&SESS.id)||{}).short||(B(SESS&&SESS.id)||{}).name||'your broker',na=[];
    for(var k in BUSED)if(BUSED[k]!=='ok'&&/^Not available/.test(String(BUSED[k]))){var m=String(BUSED[k]).replace(/^Not available (from your broker|with [^:]+):\s*/,'').split(' — ')[0];if(na.indexOf(m)<0)na.push(m)}
    var full=SESS&&(SESS.id==='kite'||SESS.id==='dhan');
    b.innerHTML='<span class="d"></span><span class="t"><span class="f"><b>Live from your broker · '+esc(nm)+'</b>'+(SESS&&SESS.id==='kite'?' · live prices stream straight from Kite to this browser; candles and option quotes pass through Vayron’s stateless read-only relay (nothing stored or logged); Vayron’s data files are not used':SESS&&SESS.id==='dhan'?' · live prices stream straight from Dhan to this browser; yesterday’s closes and today’s order-flow candles are fetched through Vayron’s stateless read-only relay (no tokens stored or logged); Vayron’s data files are not used':' · fetched by this browser straight from '+esc(nm)+'’s API; Vayron’s servers and data files are not used')+(na.length?' · <b>Not available with '+esc(nm)+' here: '+esc(na.join('; '))+'</b>':'')+'</span><span class="m"><b>Live · '+esc(nm)+(na.length?' · some views n/a':'')+'</b></span></span><button class="c" data-s="live">Broker</button>'};
  updBrokerBar=put;put();r.appendChild(b);fixFoot();if(!window.__tbFoot)window.__tbFoot=setInterval(function(){if(bbHost)fixFoot()},2000);
  r.addEventListener('click',function(ev){var t=ev.target.closest&&ev.target.closest('[data-s]');if(t)open()});
  document.documentElement.classList.add('vayron-bkbar');(document.body||document.documentElement).appendChild(bbHost)}
/* sample mode: hide anything implying current prices (market open/closed pill, countdowns, "live"/"last session" chips) */
var LIVE_TXT=/^market\s+(open|closed)\b|^(·\s*)?(opens|closes)\s+(in\s+)?\d|^(market\s+)?(open|closed)(\s*·.*)?$|last session|showing last|^live(\s|$)|refresh(es|ing)?\s+in|updated\s+\d|next update|delayed/i;
function hideLiveHints(){
  if(!document.documentElement.classList.contains('vayron-sample'))return;
  try{
    var hd=document.querySelector('header');
    if(hd)Array.prototype.forEach.call(hd.querySelectorAll('span'),function(sp){if(sp.textContent.trim()==='NSE'){var p=sp.closest('[class*="rounded"]')||sp.parentElement;if(p&&p!==hd)p.style.display='none'}});
    Array.prototype.forEach.call(document.querySelectorAll('main span,main div,main p,main button,header span'),function(e){
      if(e.children.length>4||e.style.display==='none')return;var t=(e.textContent||'').replace(/^[●•\s]+/,'').trim();if(!t||t.length>60)return;
      if(LIVE_TXT.test(t))e.style.display='none';
    });
  }catch(x){}
}
/* ---------- UI (shadow DOM so site styles and layout are untouched) ---------- */
var host,root,modalOpen=false,view='list',CBQ='';
var CSS='.comm{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px;font-size:12.5px;color:var(--gm,var(--mu))}.comm b{color:var(--gf,var(--fg));font-weight:600;margin-right:2px}.cbtn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12.5px;font-weight:600;color:#fff!important;text-decoration:none!important}.cbtn:hover{opacity:.9}.cbtn.dc{background:#5865F2}.cbtn.tg{background:#229ED9}.cbtn svg{width:14px;height:14px;fill:#fff}'+':host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'+
'.chipwrap{position:fixed;left:14px;bottom:14px;z-index:35;display:flex;flex-direction:column;align-items:flex-start;gap:5px;max-width:calc(100vw - 28px)}'+
'.chip{display:flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;border:1px solid var(--ln);background:var(--bg);color:var(--fg);font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.12);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.chip-err{font-size:11.5px;color:#dc2626;background:var(--bg);border:1px solid rgba(220,38,38,.45);border-radius:8px;padding:5px 8px;max-width:100%;line-height:1.35;font-weight:600;box-shadow:0 4px 18px rgba(0,0,0,.12)}'+
'.chip:hover{border-color:var(--ac)}.dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;flex:none}.dot.on{background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.2)}.dot.warn{background:#f59e0b}.dot.err{background:#dc2626}'+
'.mut{color:var(--mu);font-weight:500}.up{color:#16a34a}.dn{color:#dc2626}'+
'.ov{position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,23,.55);display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto}'+
'.md{width:100%;max-width:720px;background:var(--bg);color:var(--fg);border-radius:16px;border:1px solid var(--ln);box-shadow:0 20px 60px rgba(0,0,0,.35);padding:20px 22px;font-size:14px;line-height:1.5}'+
'h2{margin:0;font-size:18px}h3{margin:18px 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--mu)}'+
'.hd{display:flex;align-items:center;gap:10px}.x{margin-left:auto;border:0;background:none;color:var(--mu);font-size:22px;cursor:pointer;line-height:1}'+
'.note{margin:12px 0 4px;padding:10px 12px;border-radius:10px;background:var(--sf);border:1px solid var(--ln);font-size:12.5px;color:var(--mu)}.note b{color:var(--fg)}'+
'.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}'+
'.bk{border:1px solid var(--ln);border-radius:12px;padding:10px 12px;background:var(--bg);text-align:left;color:var(--fg);font-size:13px;display:flex;flex-direction:column;gap:3px}'+
'button.bk{cursor:pointer}button.bk:hover{border-color:var(--ac)}.bk.soon{opacity:.62}.bk .n{font-weight:700;font-size:14px}.bk .p{font-size:12.5px}.bk a{font-size:11.5px;color:var(--ac);text-decoration:none}'+
'.tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:999px;margin-left:6px;vertical-align:1px}.tag.free{background:rgba(22,163,74,.14);color:#15803d}.tag.paid{background:rgba(234,88,12,.14);color:#c2410c}.tag.soon{background:var(--sf);color:var(--mu);border:1px solid var(--ln)}.tag.relay{background:rgba(37,99,235,.12);color:var(--ac)}'+
'ol{margin:6px 0 10px 18px;padding:0}li{margin:3px 0}ol code{font-size:12px;background:var(--sf);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}label{display:block;font-size:12.5px;font-weight:600;margin:10px 0 4px}'+
'input[type=text],input[type=password]{width:100%;padding:9px 11px;border-radius:9px;border:1px solid var(--ln);background:var(--sf);color:var(--fg);font-size:14px}'+
'.cb{display:flex;gap:8px;align-items:center;font-weight:500;margin-top:10px}.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center}'+
'.btn{border:0;border-radius:10px;padding:9px 16px;font-weight:700;font-size:13.5px;cursor:pointer;background:var(--ac);color:#fff}.btn.s{background:var(--sf);color:var(--fg);border:1px solid var(--ln)}.btn.d{background:#dc2626}'+
'.copy{display:flex;gap:6px;align-items:center}.copy code{flex:1;padding:8px 10px;border-radius:9px;background:var(--sf);border:1px solid var(--ln);font-size:12.5px;overflow:auto;white-space:nowrap}'+
'.st{margin-top:10px;font-size:13px}.err{color:#dc2626}.errbox{border-color:rgba(220,38,38,.45)!important;color:#991b1b}.errbox b{color:#b91c1c}.tbl{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}.tbl td{padding:5px 4px;border-bottom:1px solid var(--ln)}.tbl td.r{text-align:right;font-variant-numeric:tabular-nums}'+
'a.l{color:var(--ac);text-decoration:none}';
function theme(){
  var dk=document.documentElement.classList.contains('dark')||(!document.documentElement.classList.contains('light')&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
  host.style.cssText=dk?'--bg:#121826;--sf:#0b0f17;--fg:#e8ecf3;--mu:#98a2b3;--ln:#263042;--ac:#60a5fa':'--bg:#ffffff;--sf:#f5f7fa;--fg:#0f172a;--mu:#5b6474;--ln:#e5e7eb;--ac:#2563eb';
}
function fmt(n){return n==null?'–':Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
function sg(n){return n>0?'+':''}
function chipHTML(){
  if(!SESS)return'<span class="dot"></span>Connect broker · Live data';
  var b=B(SESS.id),dc=STATE==='live'?'on':STATE==='error'?'err':'warn',n=LIVE.NIFTY,txt='';
  if(n&&n.p)txt=' <span class="mut">NIFTY</span> '+fmt(n.p)+(n.cp!=null?' <span class="'+(n.cp>=0?'up':'dn')+'">'+sg(n.cp)+fmt(n.cp)+'%</span>':'');
  return'<span class="dot '+dc+'"></span>Live via '+esc(b.short||b.name)+(STATE==='live'?'':' <span class="mut">· '+(STATE==='error'?'needs attention':STATE||'connecting')+'</span>')+txt;
}
function renderChip(){
  if(!root)return;var c=root.querySelector('.chip');if(c)c.innerHTML=chipHTML();
  var er=root.querySelector('.chip-err');
  if(er){var e=lastErr();if(e&&e.message){er.style.display='';er.textContent=e.message}else{er.style.display='none';er.textContent=''}}
}
function card(b){
  var tg=b.group==='free'?'<span class="tag free">Free API</span>':'<span class="tag paid">Paid API</span>';
  var inner='<span class="n">'+esc(b.name)+(b.status==='soon'?'<span class="tag soon">Coming soon</span>':'')+'</span><span class="p">'+tg+' '+esc(b.price)+'</span>'+
    (b.priceNote?'<span class="mut" style="font-size:11.5px">'+esc(b.priceNote)+'</span>':'')+(b.why&&b.status==='soon'?'<span class="mut" style="font-size:11.5px">'+esc(b.why)+'</span>':'')+
    '<a href="'+esc(b.src)+'" target="_blank" rel="noopener noreferrer">Price source ↗</a>';
  return b.status==='live'?'<button class="bk" data-b="'+b.id+'">'+inner+'</button>':'<div class="bk soon">'+inner+'</div>';
}
var NOTICE='<div class="note"><b>Your data, your screen.</b> Live prices come from <b>your own broker account</b> and are shown <b>only to you</b>, in this browser. Vayron doesn’t store your API key, secret or token (they stay in this browser’s storage until you disconnect) and never sends your live data back to Vayron. Read-only: Vayron only requests market quotes and never places, changes or cancels orders. Vayron is free; any API fee is charged by your broker, not Vayron. Without a connected broker the dashboards show labelled example data, not real or live market prices.</div>';
function errBanner(){
  var e=lastErr();if(!e||!e.message)return'';
  var when=new Date(e.t).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'});
  var who=e.broker&&B(e.broker)?B(e.broker).name+(e.broker==='kite'?' (Kite)':'') : (e.broker||'');
  return'<div class="note errbox" id="bk-lasterr"><b>Last error</b>'+(who?' · '+esc(who):'')+' — '+esc(e.message)+' <span class="mut">('+esc(when)+' IST)</span></div>';
}
function listView(){
  var free=BROKERS.filter(function(b){return b.group==='free'}),paid=BROKERS.filter(function(b){return b.group==='paid'});
  var conn='';
  if(SESS){var b=B(SESS.id);conn='<h3>Connected</h3><div class="bk"><span class="n">Live via '+esc(b.name)+'</span><span class="mut" id="bk-st"></span>'+liveTable()+
    '<div class="row"><button class="btn d" data-act="disc">Disconnect</button><button class="btn s" data-act="discf">Disconnect &amp; forget saved keys</button></div></div>'}
  return'<div class="hd"><h2>Connect broker · Live data</h2><button class="x" data-act="close" aria-label="Close">×</button></div>'+NOTICE+errBanner()+conn+commHTML()+
    '<h3>Free API brokers <span class="mut" style="text-transform:none;letter-spacing:0">· no data fee</span></h3><div class="grid">'+free.map(card).join('')+'</div>'+
    '<h3>Paid API brokers <span class="mut" style="text-transform:none;letter-spacing:0">· broker charges you for data</span></h3><div class="grid">'+paid.map(card).join('')+'</div>'+
    '<p class="mut" style="font-size:11.5px;margin:14px 0 0">Prices as published by each broker (checked 9 Nov 2026). You need an account with that broker and your own API app. Each broker’s terms apply to your use of its data.</p>';
}
function liveTable(){
  var rows=['NIFTY','BANKNIFTY','FINNIFTY','RELIANCE','HDFCBANK'].map(function(s){var q=LIVE[s];return'<tr><td>'+s+'</td><td class="r">'+(q&&q.p?fmt(q.p):'…')+'</td><td class="r '+(q&&q.cp>=0?'up':'dn')+'">'+(q&&q.cp!=null?sg(q.cp)+fmt(q.cp)+'%':'')+'</td></tr>'}).join('');
  return'<table class="tbl">'+rows+'</table>';
}
function formView(id){
  var b=B(id),saved=jget(KK+id)||{},lr='';try{lr=localStorage.getItem('vayron_broker_redir_'+id)||''}catch(e){}var redirect=okCb(saved.redir)?saved.redir:okCb(lr)?lr:CANON;
  var f=b.fields.map(function(x){
    var rememberable=x[0]==='key'||x[0]==='client'||x[0]==='secret';
    var v=(x[0]==='token'||x[0]==='pin'||x[0]==='totp')?'':(saved[x[0]]||'');
    var typ=(x[0]==='key'||x[0]==='client'||x[0]==='totp')?'text':(x[0]==='pin'||x[0]==='secret'||x[0]==='token')?'password':'text';
    var extra=x[0]==='totp'?' inputmode="numeric" maxlength="6" pattern="[0-9]*"':'';
    return'<label>'+esc(x[1])+'</label><input type="'+typ+'" name="'+x[0]+'" autocomplete="off" spellcheck="false" placeholder="'+esc(x[2])+'" value="'+esc(v)+'"'+extra+'>';
  }).join('');
  var red='';
  if(b.auth==='oauth')red='<label>Redirect URL set on your broker app'+(b.alt==='kitetoken'?' (login route only; not needed with an existing token)':'')+'</label><div class="copy"><input type="text" name="redir" autocomplete="off" spellcheck="false" value="'+esc(redirect)+'" style="flex:1;min-width:0"><button class="btn s" data-act="copy">Copy</button></div><div class="mut" style="font-size:12px;margin-top:4px">Use '+esc(CANON)+' on your broker app. After login you come back to the page you started on.</div>';
  else if(b.auth==='angel')red='<label>Redirect URL for your SmartAPI app</label><div class="copy"><input type="text" name="redir" autocomplete="off" spellcheck="false" readonly value="'+esc(CANON)+'" style="flex:1;min-width:0"><button class="btn s" data-act="copy">Copy</button></div><div class="mut" style="font-size:12px;margin-top:4px">Only needed when you create the app. Angel One requires this field; Vayron doesn\'t use it.</div>';
  var alt=b.alt==='token'?'<details style="margin-top:12px"><summary class="mut" style="cursor:pointer">Or paste today’s access token</summary><label>Access token</label><input type="password" name="token" autocomplete="off"><div class="row"><button class="btn s" data-act="tok">Use this token</button></div></details>':'';
  if(b.alt==='kitetoken')alt='<details style="margin-top:12px"'+(saved.kt?' open':'')+'><summary style="cursor:pointer;font-weight:600">I already have today’s access token</summary>'+
    '<p class="mut" style="font-size:12px;margin:6px 0">Paste the API key and the access token your own Kite app generated today. Vayron skips the Kite login and token exchange, checks the token once with a read-only Kite call, and keeps it only in this browser.</p>'+
    '<p class="mut" style="font-size:12px;margin:6px 0"><b>Use the same token as your other app; logging in again on Kite would cancel it. Tokens expire daily around 6 AM IST.</b></p>'+
    '<label>API key</label><input type="text" name="ktkey" autocomplete="off" spellcheck="false" value="'+esc(saved.key||'')+'">'+
    '<label>Access token</label><input type="password" name="kttok" autocomplete="off" spellcheck="false">'+
    '<div class="row"><button class="btn s" data-act="ktok">Use this token</button><span class="st err" id="bk-kt"></span></div></details>';
  var rem='';
  if(b.auth==='oauth')rem='<label class="cb"><input type="checkbox" name="rem" '+(saved.key?'checked':'')+'> Remember my app key &amp; secret in this browser</label>';
  else if(b.auth==='angel')rem='<label class="cb"><input type="checkbox" name="rem" '+(saved.key?'checked':'')+'> Remember API key &amp; client code in this browser (never PIN/TOTP)</label>'+
    '<p class="mut" style="font-size:11.5px;margin:8px 0 0">Create a free SmartAPI app at <a class="l" href="https://smartapi.angelone.in" target="_blank" rel="noopener noreferrer">smartapi.angelone.in</a>. PIN and TOTP are sent only to Angel One and are never stored here.</p>';
  var submit=b.auth==='oauth'?'Log in with '+esc(b.short||b.name):(b.auth==='angel'?'Connect Angel One':'Connect');
  return'<div class="hd"><button class="x" style="margin:0;font-size:18px" data-act="back" aria-label="Back">←</button><h2>'+esc(b.name)+'<span class="tag '+b.group+'">'+(b.group==='free'?'Free API':'Paid API')+'</span>'+(b.relay?'<span class="tag relay">1-step relay</span>':'')+'</h2><button class="x" data-act="close" aria-label="Close">×</button></div>'+
    '<p class="mut" style="margin:6px 0 0">'+esc(b.price)+(b.priceNote?' · '+esc(b.priceNote):'')+' · <a class="l" href="'+esc(b.src)+'" target="_blank" rel="noopener noreferrer">source</a></p>'+NOTICE+errBanner()+
    '<ol>'+b.steps.map(function(s){return'<li>'+fmtStep(s)+'</li>'}).join('')+'</ol><p class="mut" style="margin:0"><a class="l" href="'+esc(b.portal)+'" target="_blank" rel="noopener noreferrer">Open '+esc(b.name)+' developer page ↗</a> · Data: '+esc(b.howData)+'</p>'+
    red+'<form data-f="'+b.id+'">'+f+rem+
    '<div class="row"><button class="btn" type="submit">'+submit+'</button><span class="st err" id="bk-fe"></span></div></form>'+alt+commHTML();
}
function renderModal(){
  if(!root)return;var ov=root.querySelector('.ov');
  if(!modalOpen){if(ov)ov.remove();return}
  if(!ov){ov=document.createElement('div');ov.className='ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');root.appendChild(ov);
    ov.addEventListener('click',onClick);ov.addEventListener('submit',onSubmit)}
  ov.innerHTML='<div class="md">'+(view==='list'?listView():formView(view))+'</div>';renderModalStatus();
}
function renderModalStatus(){
  if(!root||!modalOpen)return;var e=root.querySelector('#bk-st');if(!e)return;
  e.innerHTML=(STATE==='live'?'Streaming live from your broker.':STATE==='error'?'<span class="err">'+esc(ERR)+'</span>':'Connecting…')+' Token expires '+new Date(SESS?SESS.exp:Date.now()).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})+' IST.';
  var t=root.querySelector('.tbl');if(t)t.outerHTML=liveTable();
}
setInterval(function(){if(modalOpen&&view==='list'&&SESS)renderModalStatus()},2000);
function onClick(ev){
  var t=ev.target;if(t.classList&&t.classList.contains('ov')){close();return}
  var a=t.closest('[data-act],[data-b]');if(!a)return;var act=a.getAttribute('data-act');
  if(a.getAttribute('data-b')){view=a.getAttribute('data-b');renderModal();return}
  if(act==='close')close();else if(act==='back'){view='list';renderModal()}
  else if(act==='disc'||act==='discf')disconnect(act==='discf');
  else if(act==='copy'){try{var ri=a.parentNode&&a.parentNode.querySelector('[name=redir]');navigator.clipboard.writeText(ri&&okCb(ri.value)?ri.value:CANON);a.textContent='Copied'}catch(e){}}
  else if(act==='ktok')kiteUseToken(a);
  else if(act==='tok'){var inp=root.querySelector('details input[name=token]'),k=root.querySelector('form input[name=key]');
    if(!inp.value.trim()){fe('Paste the access token first.');return}
    saveSession(view,(k&&k.value.trim())||'',inp.value.trim(),{via:'token'});view='list';renderModal();startEngine()}
}
/* Kite: reuse an access token the user's own app generated today (no OAuth, no secret). Checked once through the stateless
   /api/broker/kite/check pass-through (api.kite.trade has no browser CORS); it stores and logs nothing. Saved only in this browser. */
function kiteUseToken(btn){var ke=root.querySelector('input[name=ktkey]'),te=root.querySelector('input[name=kttok]'),msg=function(m,ok){var e=root.querySelector('#bk-kt');if(e){e.textContent=m;e.className='st'+(ok?'':' err')}};
  var key=ke?ke.value.trim():'',tok=te?te.value.trim().replace(/^token\s+[^:]*:/i,''):'';
  if(!/^[A-Za-z0-9]{4,64}$/.test(key)){msg('Enter your Kite API key (letters and digits only).');return}
  if(!/^[A-Za-z0-9_-]{8,256}$/.test(tok)){msg('Paste the access token (letters and digits, no spaces).');return}
  btn.disabled=true;msg('Checking the token with Kite…',true);
  fetch('/api/broker/kite/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:key,access_token:tok}),credentials:'omit',cache:'no-store'})
    .then(function(r){return r.json().catch(function(){return null})})
    .then(function(j){btn.disabled=false;
      if(!j){msg('Could not check the token right now. Please try again in a minute.');return}
      var typ=String(j.error_type||''),qm=String(j.quote_message||j.message||'');
      if(!j.profile_ok){if(/NetworkException/i.test(typ))msg('Kite did not respond. Please try again in a minute.');
        else{bstat('kite','token',0);msg('Kite says this token is invalid or expired (tokens expire daily around 6 AM IST, and a new Kite login cancels the old one). Copy a fresh token from your other app and try again. Also check the API key matches that app.');}return}
      if(!j.quote_ok&&(/PermissionException/i.test(String(j.quote_error_type||typ))||/insufficient|permission|not subscribed|market.?data/i.test(qm))){msg('The token works, but Kite refused market data for this app. Live data needs a Kite Connect app (₹500/month), not the free Personal plan.');return}
      var sv=jget(KK+'kite')||{};sv.key=key;sv.kt=1;jset(KK+'kite',sv);
      saveSession('kite',key,tok,{via:'token'});view='list';renderModal();startEngine()})
    .catch(function(){btn.disabled=false;msg('Network error while checking the token. Please try again.')})}
function fe(m){var e=root.querySelector('#bk-fe');if(e)e.textContent=m}
function onSubmit(ev){
  ev.preventDefault();var f=ev.target,id=f.getAttribute('data-f'),b=B(id);
  var val=function(n){var i=f.querySelector('[name='+n+']');return i?i.value.trim():''};
  var key=val('key');if(!key){fe('Enter your '+b.fields[0][1]+'.');return}
  if(b.auth==='oauth'){var sec=val('secret');if(!sec){fe('Enter your app secret.');return}var rem=f.querySelector('[name=rem]'),ri=f.querySelector('[name=redir]'),rv=ri?ri.value.trim():CANON;if(rv&&!okCb(rv)){fe('The redirect URL must be a Vayron address ending in /broker/callback/ (e.g. '+CANON+').');return}beginOAuth(b,key,sec,rem&&rem.checked,rv||CANON)}
  else if(b.auth==='angel'){
    var client=val('client'),pin=val('pin'),totp=val('totp');
    if(!client){fe('Enter your Angel One client code.');return}
    if(!pin){fe('Enter your PIN.');return}
    if(!/^[0-9]{6}$/.test(totp)){fe('Enter the 6-digit TOTP from your authenticator app.');return}
    fe('Connecting…');
    var remEl=f.querySelector('[name=rem]'),btn=f.querySelector('button[type=submit]');
    if(btn)btn.disabled=true;
    angelLogin(key,client,pin,totp).then(function(tok){
      /* Never persist PIN/TOTP. Optionally remember api key + client code only. */
      if(remEl&&remEl.checked)jset(KK+id,{key:key,client:client});else jdel(KK+id);
      saveSession('angelone',tok.key,tok.jwt,{feed:tok.feed,client:tok.client,via:'login'});
      view='list';renderModal();startEngine();
    }).catch(function(err){bstat('angelone','login',0);fe((err&&err.message)||'Angel One login failed.');if(btn)btn.disabled=false});
  }
  else{var tok=val('token');if(!tok){fe('Paste your access token.');return}saveSession(id,key,tok,{via:'token'});jset(KK+id,{key:key});view='list';renderModal();startEngine()}
}
function open(v){if(!host)mount();modalOpen=true;view=(typeof v==='string'&&B(v)&&B(v).status==='live')?v:'list';theme();renderModal()}
function close(){modalOpen=false;renderModal()}
function mount(){
  if(host)return;host=document.createElement('div');host.id='vayron-broker';root=host.attachShadow({mode:'open'});
  var st=document.createElement('style');st.textContent=CSS;root.appendChild(st);
  var wrap=document.createElement('div');wrap.className='chipwrap';
  var c=document.createElement('button');c.className='chip';c.type='button';c.setAttribute('aria-haspopup','dialog');c.title='Optional: stream live prices from your own broker account';
  c.addEventListener('click',function(){open()});
  var er=document.createElement('div');er.className='chip-err';er.style.display='none';er.setAttribute('role','status');
  wrap.appendChild(c);wrap.appendChild(er);root.appendChild(wrap);document.body.appendChild(host);theme();renderChip();ensureBlurAssets();syncBlur();
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modalOpen)close()});
}
window.VayronBroker={community:COMM,open:open,disconnect:disconnect,brokers:BROKERS,syncBlur:syncBlur,hasSession:hasBrokerSession,gateHTML:gateHTML};
if(/^\/broker\/callback\/?$/.test(location.pathname)){
  /* strip one-time codes from the address bar before any other script (e.g. analytics beacons) can read it */
  CBQ=location.search;
  /* forward to the host where the login started (state = random~host), or to vayron.com when this tab has no pending login here */
  (function(){var q=new URLSearchParams(CBQ),st=q.get('state')||q.get('st')||'',h=st.indexOf('~')>0?st.slice(st.indexOf('~')+1):'',here=location.host,pend=null;
    try{pend=JSON.parse(sessionStorage.getItem(PK)||'null')}catch(e){}
    var to=h&&TH.test(h)&&h!==here?h:(!h&&!pend&&here!=='vayron.com'&&TH.test(here)?'vayron.com':'');
    if(to&&!q.get('fwd')){q.set('fwd','1');CBQ='?'+q.toString();try{history.replaceState(null,'','/broker/callback/')}catch(e){}location.replace('https://'+to+'/broker/callback/'+CBQ);CBQ=null}})();
  if(CBQ===null)return;
  try{history.replaceState(null,'','/broker/callback/')}catch(e){}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',handleCallback);else handleCallback();return;
}
if(SESS){startEngine();bstat(SESS.id,SESS.via,1,'a')}
if(!SESS)sampleCfg();
renderGate();
/* Next.js client-side navigation: re-check the gate when the route changes without a page load */
(function(){var last=location.pathname;function chk(){if(location.pathname!==last){last=location.pathname;syncBlur()}}
  ['pushState','replaceState'].forEach(function(k){var o=history[k];if(o)history[k]=function(){var r=o.apply(this,arguments);setTimeout(chk,0);return r}});
  addEventListener('popstate',function(){setTimeout(chk,0)});})();
function boot(){setTimeout(mount,600)}
if(document.readyState==='complete')boot();else window.addEventListener('load',boot);
})();
