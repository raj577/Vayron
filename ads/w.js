/* First-party analytics v2. One arrival/day + cumulative pagehide/hidden snapshot.
   Existing section/event trackers feed this collector synchronously. No public UI.
   Quota: snapshots are cumulative per tab session, so the first hide of a session is sent and later ones
   at most every 15 min (the next one carries everything). No timers ever call the worker. */
(function(){
  if(window.__vayronW)return;window.__vayronW=2;if(!/(^|\.)vayron\.com$/.test(location.hostname))return;
  var F=window.fetch.bind(window),B=navigator.sendBeacon&&navigator.sendBeacon.bind(navigator),blocked=/^\/(admin|login|register)(\/|$)/.test(location.pathname)||/bot|crawl|spider|Mediapartners|AdsBot|Googlebot|HeadlessChrome|Lighthouse/i.test(navigator.userAgent);
  var state=null,vid='',started=false,dirty=false,sentSeq=0,hiding=false,home=location.pathname==='/',last=Date.now(),active=last,visible=!document.hidden,GAP=900000;
  function get(store,k){try{return store.getItem(k)}catch(e){return null}}
  function put(store,k,v){try{store.setItem(k,v)}catch(e){}}
  function day(){return new Date(Date.now()+19800000).toISOString().slice(0,10)}
  function id(){var a=new Uint8Array(12);crypto.getRandomValues(a);return Array.from(a,function(n){return ('0'+n.toString(16)).slice(-2)}).join('')}
  function save(){state.touched=Date.now();put(sessionStorage,'vayron_analytics2',JSON.stringify(state))}
  function init(){
    if(state&&state.day===day())return;
    var old;try{old=JSON.parse(get(sessionStorage,'vayron_analytics2')||'null')}catch(e){}
    var same=old&&Date.now()-old.touched<1800000,attr;
    if(same)attr=old.attribution;else{var q=new URLSearchParams(location.search);attr={referrer:document.referrer||'',utm_source:q.get('utm_source')||'',utm_medium:q.get('utm_medium')||'',utm_campaign:q.get('utm_campaign')||''}}
    state=same&&old.day===day()?old:{day:day(),sid:id(),seq:0,sections:{},ev:{},attribution:attr};
    var ck=(document.cookie.match(/(?:^|;\s*)vayron_vid=([A-Za-z0-9_-]{8,40})/)||[])[1];
    vid=ck||get(localStorage,'vayron_vid');if(!vid||!/^[A-Za-z0-9_-]{8,40}$/.test(vid))vid=id();
    put(localStorage,'vayron_vid',vid);if(ck!==vid)document.cookie='vayron_vid='+vid+'; Max-Age=31536000; Path=/; SameSite=Lax; Secure';save();
  }
  function ingest(o){
    if(blocked)return;init();
    Object.keys(o.sections||{}).slice(0,12).forEach(function(k){var v=o.sections[k];if(!/^[a-z0-9-]{1,24}$/.test(k)||!v)return;var x=state.sections[k]||(state.sections[k]={s:0,v:0});x.s=Math.min(86400,x.s+(+v.s||0));x.v=Math.min(500,x.v+(+v.v||0));dirty=true});
    Object.keys(o.ev||{}).slice(0,20).forEach(function(k){state.ev[k]=Math.min(10000,(state.ev[k]||0)+(+o.ev[k]||0));dirty=true});
    if(dirty){state.seq++;save()}
    if(hiding||document.hidden)flush(false);
  }
  function flush(arrive){
    if(blocked)return;init();if(!arrive&&(!dirty||sentSeq===state.seq))return;if(+get(localStorage,'vayron_track_off')>Date.now())return;
    if(!arrive){if(state.sentAt&&Date.now()-state.sentAt<GAP)return;state.sentAt=Date.now()}
    if(!state.seq)state.seq=1;
    var payload=JSON.stringify({v:2,vid:vid,sid:state.sid,seq:state.seq,arrive:arrive?1:0,sections:state.sections,ev:state.ev,attribution:state.attribution});
    save();sentSeq=state.seq;dirty=false;
    if(!arrive&&B&&B('/api/track',new Blob([payload],{type:'text/plain'})))return;
    F('/api/track',{method:'POST',body:payload,credentials:'same-origin',keepalive:true}).then(function(r){if(r.ok&&arrive)put(localStorage,'vayron_v2_arrived_day',state.day);if(!r.ok){dirty=true;sentSeq=0;if(r.status>=429)put(localStorage,'vayron_track_off',String(Date.now()+1800000))}}).catch(function(){dirty=true;sentSeq=0;put(localStorage,'vayron_track_off',String(Date.now()+600000))});
  }
  function tick(){var now=Date.now();if(home&&visible&&now-active<60000){var n=Math.floor(Math.min(now-last,60000)/1000);if(n)ingest({sections:{home:{s:n,v:0}}})}last=now}
  function start(){if(blocked||started)return;started=true;init();if(home)ingest({sections:{home:{s:0,v:1}}});
    if(get(localStorage,'vayron_v2_arrived_day')!==day())flush(true);
    addEventListener('pagehide',function(){tick();hiding=true;flush(false)});
    document.addEventListener('visibilitychange',function(){tick();visible=!document.hidden;last=Date.now();if(home&&document.hidden)flush(false)});
    ['pointerdown','pointermove','keydown','scroll','touchstart'].forEach(function(k){addEventListener(k,function(){if(Date.now()-active>=60000)last=Date.now();active=Date.now()},{passive:true})});
    addEventListener('pageshow',function(e){hiding=false;last=Date.now();if(e.persisted&&get(localStorage,'vayron_v2_arrived_day')!==day())flush(true)});
  }
  window.__vayronTrack=function(o){start();ingest(o)};
  window.__vayronAnalytics={start:start,flush:function(){tick();flush(false)}};
  function path(input){try{var u=new URL(typeof input==='string'?input:input.url,location.origin);return u.origin===location.origin?u.pathname.replace(/\/+$/,''):''}catch(e){return ''}}
  function json(o){return Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}))}
  function allowMe(){return /(?:^|;\s*)vayron_li=1(?:;|$)/.test(document.cookie)||/^\/admin(\/|$)/.test(location.pathname)}
  var MEK='vayron_me_c1',ADM=/^\/admin(\/|$)/.test(location.pathname),meP=null;
  function meCached(){if(ADM)return null;try{var c=JSON.parse(get(sessionStorage,MEK)||'null');if(c&&Date.now()-c.t<GAP)return c.b}catch(e){}return null}
  window.fetch=function(input,opt){var p=path(input);if(p==='/api/config')return json({});if(p==='/api/auth/info')return json({enabled:true,auth_required:true});if((p==='/api/auth/me'||p==='/api/me')&&!allowMe())return json({user:null,anonymous:true});
    if(/^\/api\/(auth\/)?(login|logout|register|welcome-seen)$/.test(p))try{sessionStorage.removeItem(MEK)}catch(e){}
    if((p==='/api/auth/me'||p==='/api/me')&&!ADM){var hit=meCached();if(hit)return json(hit);if(meP)return meP.then(function(b){return b?json(b):F(input,opt)});
      var pr=F(input,opt);meP=pr.then(function(r){return r.ok?r.clone().json().then(function(b){put(sessionStorage,MEK,JSON.stringify({t:Date.now(),b:b}));return b}):null}).catch(function(){return null});meP.then(function(){meP=null});return pr}
    if(p==='/api/track'){try{ingest(JSON.parse(opt.body))}catch(e){}return Promise.resolve(new Response(null,{status:204}))}return F(input,opt)};
  if(B)navigator.sendBeacon=function(url,data){if(path(url)==='/api/track'){if(typeof data==='string'){try{ingest(JSON.parse(data))}catch(e){}}else if(data&&data.text)data.text().then(function(s){try{ingest(JSON.parse(s))}catch(e){}});return true}return B(url,data)};
})();
