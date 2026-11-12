/* Vayron · broker-only data layer (connected visitors).
   Builds every dashboard file in THIS browser from the visitor's own broker API (their token), in the same JSON
   shapes the dashboards read. Nothing goes to Vayron servers; data.vayron.com market files are never requested.
   Views a broker cannot supply return {error:'Not available from your broker …'} (shown by the page's own
   error state) — never sample data and never Vayron's files. Read-only market-data endpoints only. */
(function(){
'use strict';
var BD=window.__vayronBD={};
var C=null;               // context from live.js: {sess,F0,ins,angel,meta,live,expired,note}
var IST=19800;
var NA_PREFIX='Not available from your broker: ';
var FULL_HINT='';
function now(){return Math.floor(Date.now()/1000)}
function r2(x){return x==null||!isFinite(x)?null:Math.round(x*100)/100}
function r1(x){return x==null||!isFinite(x)?null:Math.round(x*10)/10}
function istParts(t){var d=new Date(((t==null?now():t)+IST)*1000);return{y:d.getUTCFullYear(),m:d.getUTCMonth(),d:d.getUTCDate(),wd:d.getUTCDay(),h:d.getUTCHours(),mi:d.getUTCMinutes(),iso:d.toISOString()}}
function istDay(t){return istParts(t).iso.slice(0,10)}
function istTime(t){return istParts(t).iso.slice(11,16)}
function istStamp(t){return istParts(t).iso.slice(0,19).replace('T',' ')}
function istIso(t){return istParts(t).iso.slice(0,19)+'+05:30'}
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dmy(iso){var p=String(iso).slice(0,10).split('-');return p[2]+'-'+MON[+p[1]-1]+'-'+p[0]}
function fromDmy(s){var m=String(s).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);if(!m)return null;var i=MON.indexOf(m[2][0].toUpperCase()+m[2].slice(1,3).toLowerCase());return m[3]+'-'+('0'+(i+1)).slice(-2)+'-'+('0'+m[1]).slice(-2)}
function marketOpen(){var p=istParts();if(p.wd===0||p.wd===6)return false;var m=p.h*60+p.mi;return m>=555&&m<=930}
/* weekday after 09:15 IST: today's session exists (incl. after the close) */
function tradedToday(){var p=istParts();return p.wd!==0&&p.wd!==6&&p.h*60+p.mi>=555}
function tanh(x){var e=Math.exp(2*x);return (e-1)/(e+1)}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function sum(a){var s=0;for(var i=0;i<a.length;i++)s+=a[i]||0;return s}
function NA(what){return{error:NA_PREFIX+what}}

/* ---------- cache (memory + sessionStorage) ---------- */
var MEM={};
function cget(k){var e=MEM[k];if(!e){try{e=JSON.parse(sessionStorage.getItem('tbd:'+k)||'null')}catch(x){}if(e)MEM[k]=e}return e&&e.x>Date.now()?e.v:null}
function cset(k,v,ttl,persist){var e={v:v,x:Date.now()+ttl*1000};MEM[k]=e;if(persist)try{sessionStorage.setItem('tbd:'+k,JSON.stringify(e))}catch(x){}return v}
function lget(k){try{var e=JSON.parse(localStorage.getItem('tbd:'+k)||'null');return e&&e.x>Date.now()?e.v:null}catch(x){return null}}
function lset(k,v,ttl){try{localStorage.setItem('tbd:'+k,JSON.stringify({v:v,x:Date.now()+ttl*1000}))}catch(x){}return v}
var INFL={};
function once(k,fn){if(INFL[k])return INFL[k];var p=INFL[k]=fn().then(function(v){delete INFL[k];return v},function(e){delete INFL[k];throw e});return p}

/* ---------- per-broker request queue (rate limits) ---------- */
var GAP={upstox:130,fyers:330,angelone:200,kite:150,dhan:150};       // ms between calls: Upstox ≤500/min, FYERS ≤200/min; Angel per-endpoint limits below (ANL)
var QQ={},QR={},CUR='';   // serial per-broker queue; items tagged with the symbol so an opened chart can jump the line
var WANT={},WANTT=0;
function queued(fn,tag,ep){var id=C.sess.id;return new Promise(function(res,rej){var q=QQ[id]=QQ[id]||[],it={fn:fn,tag:tag||'',ep:ep||'',res:res,rej:rej};
  if(tag&&(tag in WANT)&&Date.now()<WANTT){var i=0;while(i<q.length&&(q[i].tag in WANT)&&WANT[q[i].tag]<=WANT[tag])i++;q.splice(i,0,it)}else q.push(it);pump(id)})}
function pump(id){if(QR[id])return;var q0=QQ[id];if(!q0||!q0.length)return;QR[id]=1;
  setTimeout(function run(){var q=QQ[id]||[],i=0,p;if(!q.length){QR[id]=0;return} /* read the queue now: BD.prio may have reordered it */
    if(id==='angelone'){var bw=1e15;i=-1;for(var j=0;j<q.length;j++){var w=anWait(q[j].ep);if(w<=0){i=j;break}if(w<bw)bw=w}
      if(i<0){setTimeout(run,Math.min(bw,60000)+10);return}anMark(q[i].ep)}
    var it=q.splice(i,1)[0];try{p=Promise.resolve(it.fn())}catch(e){p=Promise.reject(e)}
    p.then(it.res,it.rej);p.catch(function(){}).then(function(){QR[id]=0;pump(id)})},GAP[id]||300)}
/* Angel One SmartAPI per-endpoint throttle (documented: getCandleData 3/s·120–180/min·5000/h, quote 10/s·500/min·5000/h,
   optionGreek 1/s). Kept well below: a request waits until its endpoint has room; other endpoints keep flowing. */
var ANL={getCandleData:{gap:450,pm:100,ph:4500},quote:{gap:200,pm:400,ph:4500},optionGreek:{gap:1100,pm:50,ph:2000},getProfile:{gap:1000,pm:20,ph:300},other:{gap:500,pm:60,ph:1000}};
var ANS={};
function anS(ep){return ANS[ep]||(ANS[ep]={last:0,ts:[],cool:0})}
function anEp(url){var m=String(url).match(/\/(getCandleData|optionGreek|quote|getProfile)(?:$|[?\/])/);return m?m[1]:'other'}
function anWait(ep){var L=ANL[ep]||ANL.other,s=anS(ep),t=Date.now();while(s.ts.length&&t-s.ts[0]>=3600000)s.ts.shift();
  var w=Math.max(0,s.last+L.gap-t,s.cool-t),n=s.ts.length,m=0;for(var k=n-1;k>=0&&t-s.ts[k]<60000;k--)m++;
  if(m>=L.pm)w=Math.max(w,s.ts[n-L.pm]+60000-t+20);if(n>=L.ph)w=Math.max(w,s.ts[n-L.ph]+3600000-t+20);return w}
function anMark(ep){var s=anS(ep);s.last=Date.now();s.ts.push(s.last)}
function anCool(ep,ms){var s=anS(ep);s.cool=Math.max(s.cool,Date.now()+ms)}
/* What an Angel response means. Only a confirmed token error is a logout; rate limits / transient errors are retried. */
function anKind(st,j,t){var code=String((j&&(j.errorcode||j.errorCode))||''),msg=String((j&&j.message)||t||'');
  if(/^AG800[123]$/.test(code)||/invalid token|token (is )?expired|token missing|invalid session/i.test(msg))return'auth';
  if(st===401)return'auth';
  if(st===429||/exceed|rate.?limit|access rate|too many/i.test(msg))return'rate';
  if(st>=500||/^AB(1004|2000|2001)$/.test(code))return'rate';      /* "Something went wrong, try after sometime" */
  if(/^AB101[01]$/.test(code)||st===403)return'suspect';           /* ambiguous: retry, then check the session once */
  return'ok'}
var DEAD=null,ANV=null,ANVT=0,ANGEL_EXP='Angel One session expired (it ends at midnight IST) or was revoked. Please connect again.';
function anNote(m){try{if(C.note)C.note(m)}catch(e){}}
function anRead(r){return r.text().then(function(t){var j=null;try{j=JSON.parse(t)}catch(e){}return{st:r.status,j:j,t:String(t||'').slice(0,200)}},function(){return{st:r.status,j:null,t:''}})}
function anDie(){if(DEAD===C.sess.token)return;DEAD=C.sess.token;C.expired('angelone',ANGEL_EXP)}
/* one getProfile check (at most every 30 s) before logging anyone out on a token-looking error from a data call */
var ANVR='unknown';
function anVerify(){if(ANV)return ANV;if(Date.now()-ANVT<30000)return Promise.resolve(ANVR);ANVT=Date.now();var h=A.angelone.h();h.method='GET';
  ANV=queued(function(){return C.F0.call(window,'https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getProfile',Object.assign({credentials:'omit',cache:'no-store'},h))},'','getProfile')
    .then(anRead).then(function(x){var k=anKind(x.st,x.j,x.t);return k==='auth'?'auth':(x.j&&(x.j.status===true||x.j.status==='true'))?'ok':'unknown'},function(){return'unknown'})
    .then(function(v){ANV=null;ANVR=v;return v});return ANV}
function ax(url,opt,tries,tag){var ep=anEp(url);if(DEAD===C.sess.token)return Promise.reject(new Error('auth'));
  return queued(function(){if(DEAD===C.sess.token)return Promise.reject(new Error('auth'));return C.F0.call(window,url,Object.assign({credentials:'omit',cache:'no-store'},opt||{}))},tag,ep).then(anRead).then(function(x){
    var k=anKind(x.st,x.j,x.t);if(k==='ok')return x.j;
    if(k==='auth')return anVerify().then(function(v){if(v!=='ok'&&(v==='auth'||x.st===401||/^AG800[123]$/.test(String((x.j&&(x.j.errorcode||x.j.errorCode))||'')))){anDie();throw new Error('auth')}
      anNote('Angel One '+ep+': token error ('+x.st+') but the session check passed; not logging out.');var e=new Error('Angel One '+ep+' temporarily unavailable');e.soft=1;throw e});
    if(tries<3){var d=1500*Math.pow(2,tries);anCool(ep,d);return new Promise(function(res){setTimeout(res,d)}).then(function(){return ax(url,opt,tries+1,tag)})}
    var why=(x.j&&(x.j.errorcode||x.j.message))||x.t||('HTTP '+x.st);
    var fin=function(){anNote('Angel One '+ep+' temporarily unavailable after retries (HTTP '+x.st+': '+String(why).slice(0,80)+'). Session kept.');var e=new Error('Angel One '+ep+' temporarily unavailable');e.soft=1;throw e};
    if(k==='suspect')return anVerify().then(function(v){if(v==='auth'){anDie();throw new Error('auth')}return fin()});
    return fin()})}
BD.prio=function(syms){if(!C||!C.sess||!syms||!syms.length)return;var rank={};syms.forEach(function(s,i){if(!(s in rank))rank[s]=i});WANT=rank;WANTT=Date.now()+60000;var q=QQ[C.sess.id];if(!q||!q.length)return;
  var a=[],b=[];q.forEach(function(it){(it.tag in rank?a:b).push(it)});
  a.sort(function(x,y){return rank[x.tag]-rank[y.tag]});QQ[C.sess.id]=a.concat(b)};
function hx(url,opt,tries){var tag=CUR;
  if(C.sess.id==='angelone')return ax(url,opt,tries||0,tag);
  return queued(function(){return C.F0.call(window,url,Object.assign({credentials:'omit',cache:'no-store'},opt||{}))},tag).then(function(r){
    if(r.status===401||r.status===403){C.expired(C.sess.id);throw new Error('auth')}
    if(r.status===429&&(tries||0)<2)return new Promise(function(res){setTimeout(res,1500*((tries||0)+1))}).then(function(){return hx(url,opt,(tries||0)+1)});
    return r.json();
  });
}
function fyQuota(n){var k='vayron_broker_fyers_quota_v1',q={};try{q=JSON.parse(localStorage.getItem(k)||'{}')}catch(e){}
  if(q.day!==istDay())q={day:istDay(),n:0};if(q.n+n>4500)return false;q.n+=n;try{localStorage.setItem(k,JSON.stringify(q))}catch(e){}return true}

/* ---------- universe ---------- */
var IDX=['NIFTY','BANKNIFTY','FINNIFTY','MIDCPNIFTY','NIFTYNXT50'];
function eqList(){return Object.keys(C.ins.eq)}
function isIdx(s){return IDX.indexOf(s)>=0||s==='VIX'}
function meta(s){return (C.meta&&C.meta.eq&&C.meta.eq[s])||[s,'Others']}
var UPX_VIX='NSE_INDEX|India VIX',FY_VIX='NSE:INDIAVIX-INDEX',AN_VIX='99926017';
var CHAIN_NAME={NIFTY:'NIFTY',BANKNIFTY:'BANKNIFTY',FINNIFTY:'FINNIFTY',MIDCPNIFTY:'MIDCPNIFTY'};

/* ---------- adapters: each returns normalised data ----------
   quote: {p,prev,o,h,l,v,atp,oi,tbq,tsq,bids:[[p,q]],asks:[[p,q]],t}
   candles: [[t,o,h,l,c,v]] ascending, t = epoch seconds
   chain: {spot,expiry:'YYYY-MM-DD',expiries:[...],lot,rows:[{k,ce:{oi,poi,ltp,vol,iv},pe:{...}}],ts} */
var TFS={'5m':{u:['minutes',5],f:'5',a:'FIVE_MINUTE',sec:300,days:10},'15m':{u:['minutes',15],f:'15',a:'FIFTEEN_MINUTE',sec:900,days:25},
  '1h':{u:['hours',1],f:'60',a:'ONE_HOUR',sec:3600,days:80},'1d':{u:['days',1],f:'D',a:'ONE_DAY',sec:86400,days:400}};
var A={};
/* Upstox — REST v2/v3, CORS open, Bearer token */
A.upstox={caps:{quotes:1,candles:1,chain:1,chainOI:1,chainIV:1,depth:1},
  key:function(s){if(s==='VIX')return UPX_VIX;var i=C.ins.idx[s];if(i)return i.u;var e=C.ins.eq[s];return e?'NSE_EQ|'+e[1]:null},
  h:function(){return{headers:{Accept:'application/json',Authorization:'Bearer '+C.sess.token}}},
  quotes:function(syms){var self=this,out={},keys=[],back={};
    syms.forEach(function(s){var k=self.key(s);if(k){keys.push(k);back[k]=s}});
    var ch=[];for(var i=0;i<keys.length;i+=450)ch.push(keys.slice(i,i+450));
    return Promise.all(ch.map(function(c){return hx('https://api.upstox.com/v2/market-quote/quotes?instrument_key='+encodeURIComponent(c.join(',')),self.h()).then(function(j){
      var d=(j&&j.data)||{};Object.keys(d).forEach(function(n){var x=d[n],s=back[x.instrument_token];if(!s)return;var o=x.ohlc||{},dp=x.depth||{};
        out[s]={p:+x.last_price,prev:x.net_change!=null?+x.last_price-(+x.net_change):null,o:+o.open,h:+o.high,l:+o.low,v:+x.volume||0,atp:+x.average_price||null,oi:+x.oi||0,
          tbq:+x.total_buy_quantity||0,tsq:+x.total_sell_quantity||0,bids:(dp.buy||[]).filter(function(b){return b.price>0}).map(function(b){return[+b.price,+b.quantity]}),
          asks:(dp.sell||[]).filter(function(b){return b.price>0}).map(function(b){return[+b.price,+b.quantity]}),t:x.last_trade_time?Math.floor(+x.last_trade_time/1000):now()}})})})).then(function(){return out})},
  candles:function(s,tf){var k=this.key(s),T=TFS[tf],self=this;if(!k)return Promise.resolve([]);
    var to=istDay(),from=istDay(now()-T.days*86400),base='https://api.upstox.com/v3/historical-candle/';
    var calls=[hx(base+encodeURIComponent(k)+'/'+T.u[0]+'/'+T.u[1]+'/'+to+'/'+from,self.h())];
    if(tf!=='1d'&&tradedToday())calls.push(hx(base+'intraday/'+encodeURIComponent(k)+'/'+T.u[0]+'/'+T.u[1],self.h()));
    return Promise.all(calls).then(function(rs){var m={};rs.forEach(function(j){((j&&j.data&&j.data.candles)||[]).forEach(function(c){var t=Math.floor(Date.parse(c[0])/1000);m[t]=[t,+c[1],+c[2],+c[3],+c[4],+c[5]||0]})});
      return Object.keys(m).sort(function(a,b){return a-b}).map(function(t){return m[t]})})},
  chain:function(s,exp){var k=this.key(s),self=this;if(!k)return Promise.resolve(null);
    return hx('https://api.upstox.com/v2/option/contract?instrument_key='+encodeURIComponent(k),self.h()).then(function(j){
      var cs=(j&&j.data)||[],today=istDay(),ex={},lot=null;cs.forEach(function(c){if(c.expiry>=today)ex[c.expiry]=1;if(!lot&&c.lot_size)lot=+c.lot_size});
      var exps=Object.keys(ex).sort();if(!exps.length)return null;var e=exp&&exps.indexOf(exp)>=0?exp:exps[0];
      return hx('https://api.upstox.com/v2/option/chain?instrument_key='+encodeURIComponent(k)+'&expiry_date='+e,self.h()).then(function(j2){
        var d=(j2&&j2.data)||[];if(!d.length)return null;var spot=+d[0].underlying_spot_price;
        var leg=function(o){var m=(o&&o.market_data)||{},g=(o&&o.option_greeks)||{};return{oi:+m.oi||0,poi:+m.prev_oi||0,ltp:+m.ltp||0,vol:+m.volume||0,iv:+g.iv||null}};
        return{spot:spot,expiry:e,expiries:exps.slice(0,6),lot:lot,ts:now(),rows:d.map(function(r){return{k:+r.strike_price,ce:leg(r.call_options),pe:leg(r.put_options)}}).sort(function(a,b){return a.k-b.k})}})})}};
/* FYERS — REST v3 data API, CORS open, "APPID:token"; free plan: daily request budget shared with the live engine */
A.fyers={caps:{quotes:1,candles:1,chain:1,chainOI:1,chainIV:0,depth:1},
  sym:function(s){if(s==='VIX')return FY_VIX;var i=C.ins.idx[s];if(i)return i.f;return C.ins.eq[s]?'NSE:'+s+'-EQ':null},
  h:function(){return{headers:{Authorization:C.sess.key+':'+C.sess.token}}},
  ok:function(j){if(j&&j.s==='error'&&[-8,-15,-16,-17].indexOf(+j.code)>=0){C.expired('fyers');throw new Error('auth')}return j},
  quotes:function(syms){var self=this,out={},back={},list=[];syms.forEach(function(s){var f=self.sym(s);if(f){list.push(f);back[f]=s}});
    var ch=[];for(var i=0;i<list.length;i+=50)ch.push(list.slice(i,i+50));if(!fyQuota(ch.length))return Promise.reject(new Error('FYERS daily data limit reached'));
    return Promise.all(ch.map(function(c){return hx('https://api-t1.fyers.in/data/quotes?symbols='+encodeURIComponent(c.join(',')),self.h()).then(function(j){self.ok(j);
      ((j&&j.d)||[]).forEach(function(x){var v=x.v||{},s=back[x.n]||back[v.symbol];if(!s||!(+v.lp>0))return;
        out[s]={p:+v.lp,prev:+v.prev_close_price||null,o:+v.open_price,h:+v.high_price,l:+v.low_price,v:+v.volume||0,atp:+v.atp||null,oi:0,tbq:0,tsq:0,bids:[],asks:[],t:+v.tt||now()}})})})).then(function(){return out})},
  depth:function(s){var f=this.sym(s),self=this;if(!f||!fyQuota(1))return Promise.resolve(null);
    return hx('https://api-t1.fyers.in/data/depth?symbol='+encodeURIComponent(f)+'&ohlcv_flag=1',self.h()).then(function(j){self.ok(j);var d=j&&j.d&&j.d[f];if(!d)return null;
      return{bids:(d.bids||[]).filter(function(b){return b.price>0}).map(function(b){return[+b.price,+b.volume]}),asks:(d.ask||[]).filter(function(b){return b.price>0}).map(function(b){return[+b.price,+b.volume]}),tbq:+d.totalbuyqty||0,tsq:+d.totalsellqty||0}})},
  candles:function(s,tf){var f=this.sym(s),T=TFS[tf],self=this;if(!f||!fyQuota(1))return Promise.resolve([]);var to=now(),from=to-Math.min(T.days,tf==='1d'?365:95)*86400;
    return hx('https://api-t1.fyers.in/data/history?symbol='+encodeURIComponent(f)+'&resolution='+T.f+'&date_format=0&range_from='+from+'&range_to='+to+'&cont_flag=1',self.h()).then(function(j){self.ok(j);
      return ((j&&j.candles)||[]).map(function(c){return[+c[0],+c[1],+c[2],+c[3],+c[4],+c[5]||0]}).sort(function(a,b){return a[0]-b[0]})})},
  chain:function(s,exp){var f=this.sym(s),self=this;if(!f||!fyQuota(1))return Promise.resolve(null);
    var go=function(ts){return hx('https://api-t1.fyers.in/data/options-chain-v3?symbol='+encodeURIComponent(f)+'&strikecount=25'+(ts?'&timestamp='+ts:''),self.h()).then(function(j){self.ok(j);return j&&j.data})};
    return go('').then(function(d){if(!d)return null;var ed=(d.expiryData||[]).map(function(e){var p=String(e.date).split('-');return{iso:p[2]+'-'+p[1]+'-'+p[0],ts:e.expiry}});
      var want=exp&&ed.filter(function(e){return e.iso===exp})[0];
      return (want&&want!==ed[0]&&fyQuota(1)?go(want.ts):Promise.resolve(d)).then(function(d2){var spot=null,by={};
        (d2.optionsChain||[]).forEach(function(o){if(!o.option_type||o.strike_price<0){spot=+o.ltp;return}var k=+o.strike_price,r=by[k]||(by[k]={k:k,ce:null,pe:null});
          r[o.option_type==='CE'?'ce':'pe']={oi:+o.oi||0,poi:+o.prev_oi||((+o.oi||0)-(+o.oich||0)),ltp:+o.ltp||0,vol:+o.volume||0,iv:null}});
        var rows=Object.keys(by).map(function(k){var r=by[k];r.ce=r.ce||{oi:0,poi:0,ltp:0,vol:0,iv:null};r.pe=r.pe||{oi:0,poi:0,ltp:0,vol:0,iv:null};return r}).sort(function(a,b){return a.k-b.k});
        var e=(want||ed[0]||{}).iso;if(spot&&e)fillIV(rows,spot,e);
        return{spot:spot,expiry:e,expiries:ed.map(function(x){return x.iso}).slice(0,6),lot:null,ts:now(),rows:rows,ivNote:'IV computed in your browser from FYERS option prices (Black-Scholes, r=6.5%)'}})})}};
/* Angel One SmartAPI — REST, CORS open; option greeks/IV only (no per-strike OI without the scrip master) */
A.angelone={caps:{quotes:1,candles:1,chain:1,chainOI:0,chainIV:1,depth:1},
  tok:function(s){if(s==='VIX')return AN_VIX;var i=C.angel.idx&&C.angel.idx[s];if(i)return String(i.t);var e=C.angel.eq&&C.angel.eq[s];return e?String(e):null},
  h:function(){var s=C.sess;return{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-UserType':'USER','X-SourceID':'WEB','X-ClientLocalIP':'127.0.0.1','X-ClientPublicIP':'127.0.0.1','X-MACAddress':'00:00:00:00:00:00','X-PrivateKey':s.key,Authorization:'Bearer '+String(s.token||'').replace(/^Bearer\s+/i,'')}}},
  post:function(path,body){return hx('https://apiconnect.angelone.in/rest/secure/angelbroking/'+path,Object.assign(this.h(),{body:JSON.stringify(body)}))},
  quotes:function(syms){var self=this,out={},back={},list=[];syms.forEach(function(s){var t=self.tok(s);if(t){list.push(t);back[t]=s}});
    var ch=[];for(var i=0;i<list.length;i+=50)ch.push(list.slice(i,i+50));
    return Promise.all(ch.map(function(c){return self.post('market/v1/quote',{mode:'FULL',exchangeTokens:{NSE:c}}).then(function(j){
      ((j&&j.data&&j.data.fetched)||[]).forEach(function(x){var s=back[String(x.symbolToken)];if(!s)return;var dp=x.depth||{};
        out[s]={p:+x.ltp,prev:+x.close||null,o:+x.open,h:+x.high,l:+x.low,v:+x.tradeVolume||0,atp:+x.avgPrice||null,oi:+x.opnInterest||0,tbq:+x.totBuyQuan||0,tsq:+x.totSellQuan||0,
          bids:(dp.buy||[]).filter(function(b){return b.price>0}).map(function(b){return[+b.price,+b.quantity]}),asks:(dp.sell||[]).filter(function(b){return b.price>0}).map(function(b){return[+b.price,+b.quantity]}),t:now()}})},function(e){if(!e||!e.soft)throw e})})).then(function(){if(!Object.keys(out).length&&list.length)throw new Error('Angel One quotes temporarily unavailable');return out})},
  candles:function(s,tf){var t=this.tok(s),T=TFS[tf];if(!t)return Promise.resolve([]);
    var f=function(x){return istStamp(x).slice(0,16)};var to=now(),from=to-Math.min(T.days,tf==='5m'?30:tf==='15m'?60:tf==='1h'?100:400)*86400;
    return this.post('historical/v1/getCandleData',{exchange:'NSE',symboltoken:t,interval:T.a,fromdate:f(from),todate:f(to)}).then(function(j){
      return ((j&&j.data)||[]).map(function(c){return[Math.floor(Date.parse(c[0])/1000),+c[1],+c[2],+c[3],+c[4],+c[5]||0]}).sort(function(a,b){return a[0]-b[0]})})},
  chain:function(s,exp){var self=this,name=CHAIN_NAME[s]||s;
    var cands=expiryCandidates(s);if(exp)cands=[exp].concat(cands);
    var tryN=function(i){if(i>=Math.min(cands.length,6))return Promise.resolve(null);var e=cands[i],p=e.split('-'),ed=p[2]+MON[+p[1]-1].toUpperCase()+p[0];
      return self.post('marketData/v1/optionGreek',{name:name,expirydate:ed}).then(function(j){var d=(j&&j.data)||[];if(!d.length)return tryN(i+1);var by={};
        d.forEach(function(o){var k=+o.strikePrice,r=by[k]||(by[k]={k:k,ce:{oi:null,poi:null,ltp:null,vol:0,iv:null},pe:{oi:null,poi:null,ltp:null,vol:0,iv:null}});
          r[o.optionType==='CE'?'ce':'pe']={oi:null,poi:null,ltp:null,vol:+o.tradeVolume||0,iv:+o.impliedVolatility||null}});
        return{spot:null,expiry:e,expiries:[e],lot:null,ts:now(),rows:Object.keys(by).map(function(k){return by[k]}).sort(function(a,b){return a.k-b.k}),noOI:true}},function(err){if(err&&(err.soft||err.message==='auth'))throw err;return tryN(i+1)})};
    return tryN(0)}};
/* Kite / Dhan — REST blocks browser CORS; the browser WebSocket feed gives quotes only */
function wsAdapter(id){return{caps:{quotes:1,candles:0,chain:0,chainOI:0,chainIV:0,depth:0},ws:1,
  quotes:function(syms){return waitLive(syms).then(function(){var out={};syms.forEach(function(s){var q=C.live[s];if(q&&q.p>0)out[s]={p:q.p,prev:(q.prev>0&&!(q.prev===q.p&&!marketOpen()))?q.prev:null,o:q.o||null,h:q.h||null,l:q.l||null,v:q.v>0?q.v:0,atp:q.atp||null,oi:0,tbq:q.tbq||0,tsq:q.tsq||0,bids:[],asks:[],t:Math.floor((q.t||Date.now())/1000)}});return out})}}}
A.kite=wsAdapter('kite');A.dhan=wsAdapter('dhan');
/* Kite REST (historical candles, option quotes) through Vayron's stateless read-only pass-through /api/broker/kite/get
   (api.kite.trade has no browser CORS). Many sub-requests ride one worker call; the worker spaces them to Kite's limits. */
var KT_VIX=264969,KIV={'5m':'5minute','15m':'15minute','1h':'60minute','1d':'day'},KMAXD={'5m':95,'15m':190,'1h':390,'1d':1900};
function ktok(s){if(s==='VIX')return KT_VIX;var i=C.ins.idx[s];if(i)return i.k;var e=C.ins.eq[s];return e?e[0]:null}
function kpost(reqs){return queued(function(){return C.F0.call(window,'/api/broker/kite/get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:C.sess.key,access_token:C.sess.token,reqs:reqs}),credentials:'omit',cache:'no-store'})},CUR)
  .then(function(r){if(r.status===429)throw new Error('busy');return r.json()}).then(function(j){if(!j||!Array.isArray(j.results))throw new Error((j&&j.message)||'Kite relay error');
    if(j.auth_error||j.results.some(function(x){return x&&x.error_type==='TokenException'})){C.expired('kite');throw new Error('auth')}return j.results})}
var KB={q:[],t:0};
function kbAdd(path){return new Promise(function(res,rej){KB.q.push({p:path,res:res,rej:rej});if(KB.q.length>=20)kbFlush();else if(!KB.t)KB.t=setTimeout(kbFlush,120)})}
function kbFlush(){clearTimeout(KB.t);KB.t=0;while(KB.q.length){(function(b){kpost(b.map(function(x){return x.p})).then(function(rs){b.forEach(function(x,i){x.res(rs[i])})},function(e){b.forEach(function(x){x.rej(e)})})})(KB.q.splice(0,20))}}
function kts(t){return String(t).replace(/([+-]\d\d)(\d\d)$/,'$1:$2')}
function kquote(list){var out={},ch=[];for(var i=0;i<list.length;i+=200)ch.push(list.slice(i,i+200));if(!ch.length)return Promise.resolve(out);
  return kpost(ch.map(function(c){return '/quote?i='+c.map(encodeURIComponent).join('&i=')})).then(function(rs){rs.forEach(function(j){var d=j&&j.data;if(d)for(var k in d)out[k]=d[k]});return out})}
/* Kite's public NFO instrument list, parsed once per page load (the worker and the browser cache the file for 6 h) */
var NFO=null;
function nfoLoad(){if(NFO)return NFO;NFO=C.F0.call(window,'/api/broker/kite/nfo',{credentials:'omit'}).then(function(r){if(!r.ok)throw new Error('Kite instrument list unavailable');return r.text()}).then(function(t){
  var U={},L=t.split('\n');for(var i=1;i<L.length;i++){var c=L[i].split(',');if(c.length<12)continue;var ty=c[9];if(ty!=='CE'&&ty!=='PE'&&ty!=='FUT')continue;
    var nm=c[3].replace(/"/g,''),u=U[nm]||(U[nm]={lot:+c[8]||null,opt:{},fut:[]}),e=c[5];
    if(ty==='FUT'){u.fut.push({e:e,ts:c[2],lot:+c[8]})}else{var m=u.opt[e]||(u.opt[e]={}),k=+c[6],r=m[k]||(m[k]={k:k,ce:null,pe:null});r[ty==='CE'?'ce':'pe']=c[2];if(+c[8])u.lot=+c[8]}}
  for(var n in U)U[n].fut.sort(function(a,b){return a.e<b.e?-1:1});return U}).catch(function(e){NFO=null;throw e});return NFO}
function nfoExp(u,minDays,want){var d0=istDay(),ex=Object.keys(u.opt).filter(function(e){return e>=d0}).sort();if(want&&u.opt[want])return{e:want,list:ex};
  var md=minDays||0,pick=ex.filter(function(e){return (Date.parse(e+'T15:30:00+05:30')/1000-now())/86400>=md})[0]||ex[0];return{e:pick,list:ex}}
function nfoStrikes(u,e){var m=u.opt[e]||{};return Object.keys(m).map(function(k){return m[k]}).sort(function(a,b){return a.k-b.k})}
var KRT={candles:function(s,tf){var t=ktok(s),T=TFS[tf],iv=KIV[tf];if(!t||!T||!iv)return Promise.resolve([]);var to=now(),from=to-Math.min(T.days,KMAXD[tf])*86400;
    return kbAdd('/instruments/historical/'+t+'/'+iv+'?from='+encodeURIComponent(istStamp(from))+'&to='+encodeURIComponent(istStamp(to))+'&oi=0').then(function(j){
      return (((j&&j.data)||{}).candles||[]).map(function(c){return[Math.floor(Date.parse(kts(c[0]))/1000),+c[1],+c[2],+c[3],+c[4],+c[5]||0]}).filter(function(c){return c[0]>0}).sort(function(a,b){return a[0]-b[0]})})},
  chain:function(s,exp){return nfoLoad().then(function(N){var u=N[s];if(!u)return null;var X=nfoExp(u,0,exp),e=X.e;if(!e)return null;
    return Q([s]).then(function(q){var spot=q[s]&&q[s].p;var all=nfoStrikes(u,e);if(!all.length)return null;if(!spot)spot=all[Math.floor(all.length/2)].k;
      var i0=0;all.forEach(function(r,i){if(Math.abs(r.k-spot)<Math.abs(all[i0].k-spot))i0=i});var rows=all.slice(Math.max(0,i0-25),i0+26),syms=[];
      rows.forEach(function(r){if(r.ce)syms.push('NFO:'+r.ce);if(r.pe)syms.push('NFO:'+r.pe)});
      return kquote(syms).then(function(d){var leg=function(ts){var x=ts&&d['NFO:'+ts];return{oi:x?+x.oi||0:0,poi:null,ltp:x?+x.last_price||0:0,vol:x?+x.volume||0:0,iv:null}};
        var out=rows.map(function(r){return{k:r.k,ce:leg(r.ce),pe:leg(r.pe)}});if(!Object.keys(d).length)return null;fillIV(out,spot,e);
        return{spot:spot,expiry:e,expiries:X.list.slice(0,6),lot:u.lot,ts:now(),rows:out,noPrevOI:true,ivNote:'IV computed in your browser from Kite option prices (Black-Scholes, r=6.5%)'}})})})}};
A.kite.caps={quotes:1,candles:1,chain:1,chainOI:1,chainIV:0,depth:0};A.kite.candles=KRT.candles;A.kite.chain=KRT.chain;A.kite.rest=1;
/* OFALL: Dhan — today's 5-minute candles from 09:15 IST through Vayron's stateless read-only pass-through /api/broker/dhan/intraday
   (api.dhan.co has no browser CORS). Used ONLY to backfill order flow (A.dhan.today), so the other candle views keep their
   tick-only behaviour and request counts. Up to 20 stocks ride one worker call; the worker spaces them for Dhan's 5/s Data API limit.
   Any failure (no Data API, bad token, relay busy) returns null and order flow falls back to bars built from this browser's ticks. */
var DB={q:[],t:0},DOK=null;   /* DOK: null = not tried yet, 1 = backfill works, 0 = failed (fall back to tick-only gate) */
function dpost(reqs){var s=C.sess,d=istDay(),to=istStamp(now()+60);if(to.slice(0,10)!==d)to=d+' 23:59:00';
  return queued(function(){return C.F0.call(window,'/api/broker/dhan/intraday',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:String(s.key),access_token:String(s.token),interval:'5',from:d+' 09:15:00',to:to,reqs:reqs}),credentials:'omit',cache:'no-store'})},CUR)
  .then(function(r){if(r.status===429)throw new Error('busy');return r.json()}).then(function(j){if(!j||!Array.isArray(j.results))throw new Error((j&&j.message)||'Dhan relay error');
    if(j.auth_error){DOK=0;throw new Error('auth')}return j.results})}
function dbAdd(x){return new Promise(function(res,rej){DB.q.push({x:x,res:res,rej:rej});if(DB.q.length>=20)dbFlush();else if(!DB.t)DB.t=setTimeout(dbFlush,120)})}
function dbFlush(){clearTimeout(DB.t);DB.t=0;while(DB.q.length){(function(b){dpost(b.map(function(i){return i.x})).then(function(rs){b.forEach(function(i,k){i.res(rs[k])})},function(e){b.forEach(function(i){i.rej(e)})})})(DB.q.splice(0,20))}}
/* Dhan epochs are UTC seconds; if a response ever comes back IST-shifted (bars outside 09:15–15:30 IST) shift it back */
function dCandles(j){if(!j||!Array.isArray(j.timestamp)||!Array.isArray(j.close))return null;var T=j.timestamp.map(Number),out=[],i;
  var mins=function(t){var p=istParts(t);return p.h*60+p.mi},bad=T.filter(function(t){var m=mins(t);return m<555||m>930}).length,sh=0;
  if(T.length&&bad>T.length/2&&T.filter(function(t){var m=mins(t-IST);return m>=555&&m<=930}).length>T.length/2)sh=IST;
  for(i=0;i<T.length;i++){var t=T[i]-sh;t-=t%300;if(!(t>0)||!(+j.close[i]>0))continue;out.push([t,+j.open[i],+j.high[i],+j.low[i],+j.close[i],+(j.volume||[])[i]||0])}
  var m={};out.forEach(function(c){var e=m[c[0]];if(!e)m[c[0]]=c;else{e[2]=Math.max(e[2],c[2]);e[3]=Math.min(e[3],c[3]);e[4]=c[4];e[5]+=c[5]}});
  return Object.keys(m).map(Number).sort(function(a,b){return a-b}).map(function(k){return m[k]})}
A.dhan.today=function(s){var e=C.ins.eq[s],id=e&&e[2];if(!id||DOK===0)return Promise.resolve(null);if(!tradedToday())return Promise.resolve([]);
  return dbAdd({seg:'NSE_EQ',id:String(id)}).then(function(j){var c=dCandles(j);if(c){DOK=1;return c}if(j&&j.errorCode&&/DH-90[1-3]/.test(String(j.errorCode)))DOK=0;return null},function(){if(DOK!==1)DOK=0;return null})};
/* order flow may use today's backfill (Kite: REST candles; Dhan: intraday relay) — only once the session has started */
function useToday(){var a=AD();return !!(a&&a.ws&&(a.caps.candles||(a.today&&DOK!==0&&tradedToday())))}
/* PULSEFIX: wait only for symbols the WebSocket actually subscribes (INS idx/eq). VIX is not in the Kite/Dhan subscription, so a
   cache miss on VIX alone used to stall every build for the full 9 s. */
function waitLive(syms){syms=syms.filter(function(s){return (C.ins.idx&&s in C.ins.idx)||(C.ins.eq&&s in C.ins.eq)});return new Promise(function(res){var t0=Date.now();if(!syms.length)return res();(function chk(){var n=0;syms.forEach(function(s){if(C.live[s]&&C.live[s].p>0)n++});
  if(n>=syms.length*0.9||Date.now()-t0>9000)res();else setTimeout(chk,400)})()})}
function AD(){return A[C.sess.id]}
function bname(){return({kite:'Zerodha Kite',fyers:'FYERS',upstox:'Upstox',angelone:'Angel One',dhan:'Dhan'})[C.sess.id]||C.sess.id}
function hint(){return ''}
function cannot(what){return{error:'Not available with '+bname()+': '+what+' — '+bname()+' doesn’t provide this'+(AD()&&AD().rest?'':' to a browser')+'.'}}
/* inputs came back empty / all-zero (e.g. market closed and the feed only sent a last tick without volume or previous close) */
function empty(what,why){return{error:'Not available with '+bname()+': '+what+' — '+why+'.'+hint()}}
/* quality of quote-based inputs: share of F&O stocks with a real day change and with traded volume */
function quality(rows){var n=rows.length,mv=rows.filter(function(r){return r.p!=null&&r.p!==0}).length,vol=rows.filter(function(r){return r.tv>0}).length,need=Math.max(5,Math.ceil(n*0.2));
  return{n:n,breadth:n>0&&mv>=need,volume:n>0&&vol>=need}}
/* Market closed / pre-open / just opened: prices without traded volume are a waiting state, not "Not available" (any broker) */
function secsToOpen(){var t=now(),p=istParts(t),m=p.h*3600+p.mi*60+(t%60);return (p.wd>=1&&p.wd<=5&&m<33300)?33300-m:null}
function minsToOpen(){var x=secsToOpen();return x==null?null:Math.ceil(x/60)}
function nextOpenTxt(){var p=istParts(),m=p.h*60+p.mi;if(p.wd>=1&&p.wd<=5&&m<555){var mo=555-m;return '9:15 AM IST today'+(mo<=90?' (in '+mo+' min)':'')}return '9:15 AM IST on the next trading day'}
function hhmm(ms){return istTime(Math.floor(ms/1000))}
function closedMsg(what,extra){return{error:'Market closed · '+what+' will fill in after '+nextOpenTxt()+' — '+(extra?extra+' ':'')+'This page refreshes by itself once trading starts; keep this tab open.',waiting:1}}
function restWait(what,Qy,rows){var nv=rows.filter(function(r){return r.tv>0}).length,need=Math.max(5,Math.ceil(rows.length*0.2));
  if(!Qy.n)return null;
  if(!marketOpen()&&!Qy.volume)return closedMsg(what,bname()+' has prices but no traded volume yet.');
  if(marketOpen()&&!Qy.volume)return{error:'Collecting live data from '+bname()+'… ('+nv+' of '+rows.length+' stocks traded so far) — '+what+' appears once '+need+' stocks have traded, usually within a minute or two of 9:15 IST. This page refreshes by itself; keep this tab open.',waiting:1};
  return null}
function qWhy(Qy){return !Qy.n?'no quotes came back from '+bname():!Qy.volume&&!Qy.breadth?bname()+' sent prices without traded volume or the previous close (the market is closed or the feed sent only a last tick)':!Qy.volume?bname()+' sent no traded volume for these stocks':bname()+' sent no previous close, so day changes and breadth can’t be worked out'}

/* expiry guesses for Angel (NSE expiries are Tuesdays since Sep 2025; monthly = last Tuesday; holiday → day before) */
function expiryCandidates(s){var out=[],t=now();for(var i=0;i<60&&out.length<12;i++){var p=istParts(t+i*86400);if(p.wd===2||p.wd===1){var iso=istDay(t+i*86400);out.push(iso)}}
  var weekly=s==='NIFTY';return weekly?out:out.filter(function(iso){var d=new Date(iso+'T00:00:00Z'),n=new Date(d.getTime()+7*86400000);return n.getUTCMonth()!==d.getUTCMonth()||(d.getUTCDay()===1&&new Date(d.getTime()+8*86400000).getUTCMonth()!==d.getUTCMonth())})}

/* ---------- cached fetchers ---------- */
function Q(syms,ttl){var key='q:'+C.sess.id;var have=cget(key)||{},miss=syms.filter(function(s){return !have[s]});
  if(!miss.length)return Promise.resolve(have);
  return once(key+':'+miss.length+':'+miss[0],function(){return AD().quotes(miss)}).then(function(o){var m=cget(key)||{};for(var k in o)m[k]=o[k];var so=secsToOpen(),dt=ttl||(marketOpen()?10:so!=null?Math.max(5,Math.min(300,so+5)):300);return cset(key,m,dt)})}
function allQuotes(){return Q(IDX.concat(['VIX']).concat(eqList()))}
function K(s,tf){if(!AD().caps.candles)return Promise.resolve([]);var key='c:'+C.sess.id+':'+s+':'+tf,c=cget(key);if(c)return Promise.resolve(c);
  var ttl=tf==='1d'?(marketOpen()?(AD().rest?3600:600):6*3600):(marketOpen()?(tf==='5m'?60:180):3600);
  return once(key,function(){CUR=s;try{return AD().candles(s,tf)}finally{CUR=''}}).then(function(v){return cset(key,v,ttl,tf!=='5m'||!marketOpen())},function(){return []})}
function CH(s,exp){if(!AD().caps.chain)return Promise.resolve(null);var key='ch:'+C.sess.id+':'+s+':'+(exp||''),c=cget(key);if(c)return Promise.resolve(c);
  return once(key,function(){return AD().chain(s,exp)}).then(function(v){return cset(key,v,marketOpen()?60:900,true)},function(){return null})}
function lastSession(c){if(!c.length)return[];var d=istDay(c[c.length-1][0]);return c.filter(function(x){return istDay(x[0])===d})}

/* ---------- maths ---------- */
function ncdf(x){var t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p}
function bs(S,K,T,r,v,call){var d1=(Math.log(S/K)+(r+v*v/2)*T)/(v*Math.sqrt(T)),d2=d1-v*Math.sqrt(T);return call?S*ncdf(d1)-K*Math.exp(-r*T)*ncdf(d2):K*Math.exp(-r*T)*ncdf(-d2)-S*ncdf(-d1)}
function impVol(S,K,T,price,call){if(!(price>0)||!(T>0))return null;var lo=0.01,hi=3;if(bs(S,K,T,0.065,hi,call)<price)return null;for(var i=0;i<60;i++){var m=(lo+hi)/2;if(bs(S,K,T,0.065,m,call)>price)hi=m;else lo=m}var v=(lo+hi)/2;return v>0.011&&v<2.9?r2(v*100):null}
function yearsTo(iso){return Math.max(0.5,(Date.parse(iso+'T15:30:00+05:30')/1000-now())/86400)/365}
function fillIV(rows,spot,exp){var T=yearsTo(exp);rows.forEach(function(r){if(Math.abs(r.k/spot-1)>0.15)return;r.ce.iv=impVol(spot,r.k,T,r.ce.ltp,true);r.pe.iv=impVol(spot,r.k,T,r.pe.ltp,false)})}
function rsi(cl,n){n=n||14;if(cl.length<n+1)return null;var g=0,l=0,i,d;for(i=1;i<=n;i++){d=cl[i]-cl[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}g/=n;l/=n;
  for(i=n+1;i<cl.length;i++){d=cl[i]-cl[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n}return r1(l===0?100:100-100/(1+g/l))}
function atr(c,n){n=n||14;if(c.length<2)return null;var tr=[];for(var i=1;i<c.length;i++)tr.push(Math.max(c[i][2]-c[i][3],Math.abs(c[i][2]-c[i-1][4]),Math.abs(c[i][3]-c[i-1][4])));var a=tr.slice(-n);return sum(a)/a.length}
function vwapSeries(c){var pv=0,vv=0,d=null,out=[];c.forEach(function(x){var dd=istDay(x[0]);if(dd!==d){d=dd;pv=0;vv=0}var v=x[5]||1;pv+=(x[2]+x[3]+x[4])/3*v;vv+=v;out.push({time:x[0],value:r2(pv/vv)})});return out}

/* ---------- chain analytics (options / liquidity / pulse) ---------- */
function chainStats(ch,spot){var rows=ch.rows,S=spot||ch.spot;if(!rows.length||!S)return null;
  var atm=rows.reduce(function(b,r){return Math.abs(r.k-S)<Math.abs(b.k-S)?r:b},rows[0]);
  var hasOI=!ch.noOI,coi=sum(rows.map(function(r){return r.ce.oi})),poi=sum(rows.map(function(r){return r.pe.oi}));
  var cpo=sum(rows.map(function(r){return r.ce.poi})),ppo=sum(rows.map(function(r){return r.pe.poi}));
  var pcr=hasOI&&coi?r2(poi/coi):null,pcr0=hasOI&&cpo?poi&&ppo/cpo:null;
  var mp=null;if(hasOI){var best=Infinity;rows.forEach(function(x){var pain=0;rows.forEach(function(r){pain+=r.ce.oi*Math.max(0,x.k-r.k)+r.pe.oi*Math.max(0,r.k-x.k)});if(pain<best){best=pain;mp=x.k}})}
  var cw=hasOI?rows.filter(function(r){return r.k>=S}).sort(function(a,b){return b.ce.oi-a.ce.oi}):[],pw=hasOI?rows.filter(function(r){return r.k<=S}).sort(function(a,b){return b.pe.oi-a.pe.oi}):[];
  var iv=atm.ce.iv&&atm.pe.iv?(atm.ce.iv+atm.pe.iv)/2:(atm.ce.iv||atm.pe.iv||null);
  var T=yearsTo(ch.expiry),sd=iv?S*iv/100*Math.sqrt(T):null;
  return{atm:atm,pcr:pcr,pcr_chg:pcr&&pcr0?r2((pcr/pcr0-1)*100):null,max_pain:mp,callWall:cw[0]&&cw[0].k,putWall:pw[0]&&pw[0].k,cw:cw,pw:pw,atm_iv:r2(iv),
    straddle:atm.ce.ltp&&atm.pe.ltp?r2(atm.ce.ltp+atm.pe.ltp):null,iv1:sd?[r2(S-sd),r2(S+sd)]:null,hasOI:hasOI}}
function chgTag(dp,doi){return doi>0?(dp>=0?'LB':'SB'):doi<0?(dp>=0?'SC':'LU'):null}
var TAGN={LB:'Long buildup',SB:'Short buildup',SC:'Short covering',LU:'Long unwinding'};


/* ---------- Kite/Dhan: built live from the WebSocket feed in this browser (live.js aggregates ticks) ---------- */
function KLd(){try{return C.kl&&C.kl()}catch(e){return null}}
function bshort(){return({kite:'Kite',dhan:'Dhan'})[C.sess.id]||bname()}
function klSince(K){return K&&K.since?istTime(Math.floor(K.since/1000)):null}
function liveNote(K){return 'Built live from your '+bshort()+' feed since '+(klSince(K)||'—')+' IST'}
function maxBars(K){var n=0;if(K&&K.c){var d=istDay();for(var s in K.c){var a=K.c[s].filter(function(b){return istDay(b[0])===d}).length;if(a>n)n=a}}return n}
function wsWait(K,what,cnt,need,unit,eta){var open=marketOpen(),since=klSince(K);
  if(!open)return closedMsg(what,cnt?cnt+' '+unit+' were collected from your '+bshort()+' feed today; '+what+' needs '+need+'.':'it is built live from your '+bshort()+' feed while the market is open.');
  return{error:'Collecting live data from '+bshort()+'… ('+cnt+' '+unit+' so far'+(since?', since '+since+' IST':'')+') — '+what+' will appear once there are '+need+(eta?', ready around '+hhmm(eta)+' IST':'')+'. Keep this tab open; it refreshes by itself.',waiting:1}}
function wsFlowRows(q,K){var rows=[],f=(K&&K.f)||{};eqList().forEach(function(s){var x=q[s]||{},st=f[s]||{},lp=x.p>0?x.p:st.lp;if(!(lp>0))return;
  var prev=x.prev>0?x.prev:st.pv,p=prev>0?(lp/prev-1)*100:null,tv=(st.tv||0)/1e7,fl=(st.sf||0)/1e7,m=meta(s);
  rows.push({s:s,n:m[0],g:m[1],p:p==null?null:r2(p),lp:r2(lp),tv:Math.round(tv*1000)/1000,f:Math.round(fl*1000)/1000,w:null,clv:null,rv:null,fo:true,doi:null,bu:null,n500:false,vel:null,ivr:null,spd:null,dens:1,surge:false})});return rows}
function wsFlowGate(rows,K,what){var nt=rows.filter(function(r){return r.tv>0}).length,need=Math.max(5,Math.ceil(rows.length*0.2));
  if(nt<need||(marketOpen()&&K&&K.since&&Date.now()-K.since<120000))return wsWait(K,what,nt,need+' stocks with trades and two minutes of ticks','stocks traded',K&&K.since?Math.max(K.since+120000,Date.now()+20000):null);
  if(!quality(rows).breadth)return empty(what,bname()+' sent no previous close, so day changes and breadth can’t be worked out');return null}
/* PULSEFIX: during the first 2 minutes (or until enough stocks have tick-delta volume) use the quote-based estimate that the
   REST brokers use (day volume × ATP, close-location, %chg). Kite's quote-mode ticks already carry day volume, OHLC and prev close,
   so this needs no extra request. Switches to the tick-delta flow automatically once the gate passes. */
var LASTWARM=0;
function wsRows(q,K,what){LASTWARM=0;var rows=wsFlowRows(q,K),g=wsFlowGate(rows,K,what);if(!g)return{rows:rows,Qy:quality(rows)};
  if(g.waiting&&marketOpen()){var r2_=flowRows(q),Q2=quality(r2_);if(Q2.breadth&&Q2.volume){LASTWARM=1;return{rows:r2_,Qy:Q2,warm:1}}}return{g:g}}
function wsMergeQ(q,K){var f=(K&&K.f)||{},o={};for(var k in q)o[k]=q[k];eqList().forEach(function(s){var x=q[s]||{},st=f[s];if(!st)return;var lp=x.p>0?x.p:st.lp;if(!(lp>0))return;
  o[s]={p:lp,prev:x.prev>0?x.prev:st.pv,o:x.o,h:x.h,l:x.l,v:(st.tv||0)/lp,atp:null,oi:0,tbq:x.tbq||0,tsq:x.tsq||0,bids:[],asks:[],t:x.t||Math.floor((st.lt||Date.now())/1000)}});return o}

/* ---------- file builders ---------- */
function quotesFile(){return allQuotes().then(function(q){var o={};for(var s in q){var x=q[s];o[s]={p:r2(x.p),c:x.prev?r2(x.p-x.prev):null,cp:x.prev?r2((x.p/x.prev-1)*100):null}}
  return{ts:now(),open:marketOpen(),q:o,src:bname()}})}
function flowRows(q){var rows=[];eqList().forEach(function(s){var x=q[s];if(!x||!(x.p>0))return;var m=meta(s),p=x.prev>0?(x.p/x.prev-1)*100:null,px=x.atp||x.p,tv=(x.v||0)*px/1e7;
  var rng=(x.h||0)-(x.l||0),clv=rng>0?(2*x.p-x.h-x.l)/rng:0,f=tv*(0.5*clv+0.5*tanh((p||0)/1.5));
  rows.push({s:s,n:m[0],g:m[1],p:p==null?null:r2(p),lp:r2(x.p),tv:r2(tv),f:r2(f),w:null,clv:r2(clv),rv:null,fo:true,doi:null,bu:null,n500:false,vel:null,ivr:null,spd:null,dens:1,surge:false})});return rows}
function sectorsOf(rows){var sec={};rows.forEach(function(r){(sec[r.g]=sec[r.g]||[]).push(r)});return Object.keys(sec).map(function(g){var v=sec[g];
  return{g:g,f:r1(sum(v.map(function(r){return r.f}))),fin:r1(sum(v.map(function(r){return r.f>0?r.f:0}))),fout:r1(sum(v.map(function(r){return r.f<0?r.f:0}))),tv:r1(sum(v.map(function(r){return r.tv}))),n:v.length,
    adv:v.filter(function(r){return r.p>0}).length,dec:v.filter(function(r){return r.p<0}).length,p:r2(sum(v.map(function(r){return r.p}))/v.length),spd:null,vel:null,dens:1,surge:false,
    top:v.slice().sort(function(a,b){return b.tv-a.tv}).slice(0,12).map(function(r){return{s:r.s,p:r.p,tv:r.tv}})}}).sort(function(a,b){return Math.abs(b.f)-Math.abs(a.f)})}
function flowFile(){return allQuotes().then(function(q){var WS=AD().ws,KX=WS&&KLd(),rows=WS?null:flowRows(q),Qy=WS?null:quality(rows),WARM=0;if(WS){var W=wsRows(q,KX,'money flow');if(W.g)return W.g;rows=W.rows;Qy=W.Qy;WARM=W.warm||0}if(!WS){var w=restWait('money flow',Qy,rows);if(w)return w}if(!Qy.breadth||!Qy.volume)return empty('Money flow',qWhy(Qy));
  var adv=rows.filter(function(r){return r.p>0}).length,dec=rows.filter(function(r){return r.p<0}).length,inflow=r1(sum(rows.map(function(r){return r.f>0?r.f:0}))),outflow=r1(sum(rows.map(function(r){return r.f<0?r.f:0})));
  var sectors=sectorsOf(rows),srt=rows.slice().sort(function(a,b){return b.f-a.f}),ins=sectors.slice().sort(function(a,b){return b.f-a.f}),t=now();
  return{ts:istStamp(t),oi_ts:null,fetched:istIso(t),open:marketOpen(),status:'Live from '+bname(),n:rows.length,n_fo:rows.length,adv:adv,dec:dec,unch:rows.length-adv-dec,inflow:inflow,outflow:outflow,
    summary:(ins.some(function(z){return z.f})?'Money moving into '+ins.slice(0,2).map(function(z){return z.g}).join(' & ')+'; out of '+ins.slice(-2).map(function(z){return z.g}).join(' & ')+'; ':'No clear sector flow; ')+'F&O breadth '+adv+':'+dec+' (from '+bname()+')',
    sectors:sectors,stocks:rows,top_in:srt.slice(0,10).map(function(r){return r.s}),top_out:srt.slice(-10).reverse().map(function(r){return r.s}),shockers:rows.slice().sort(function(a,b){return Math.abs(b.p)-Math.abs(a.p)}).slice(0,10).map(function(r){return r.s}),
    fast_in:[],fast_out:[],fast_basis:'not available from your broker',speed_basis:'not available from your broker',surges:[],oi_unusual:[],session_frac:null,nse_adv:{fo:{advances:adv,declines:dec,unchange:rows.length-adv-dec}},
    notes:['Breadth and flow cover the '+rows.length+' F&O stocks quoted by '+bname()+'. Whole-market breadth (Nifty 500), relative volume, futures OI buildup and FII/DII flows are not available from your broker.'],
    method:'flow = traded value × (½ close-location + ½ tanh(%chg/1.5)), from '+bname()+' quotes in your browser',src:bname()}})}
function indexCard(s,q,ch,sp){var x=q[s];if(!x)return{symbol:s,error:'not available from your broker'};var st=ch&&chainStats(ch,x.p);
  return{symbol:s,spot:r2(x.p),chg:x.prev?r2(x.p-x.prev):null,chg_pct:x.prev?r2((x.p/x.prev-1)*100):null,quote_ts:x.t,bias:null,norm:0,expiry:ch?dmy(ch.expiry):null,
    range:st&&st.iv1,iv1:st&&st.iv1,walls:st&&st.hasOI?[st.putWall,st.callWall]:null,conviction:null,spark:{t:sp.map(function(c){return c[0]}),c:sp.map(function(c){return r2(c[4])})}}}
function vixInfo(q,vd){var x=q.VIX;if(!x||!(x.p>0))return{available:false,src:'not available from your broker'};var cl=vd.map(function(c){return c[4]}).slice(-250);
  var o={available:true,last:r2(x.p),prev:x.prev?r2(x.prev):null,chg:x.prev?r2(x.p-x.prev):0,chg_pct:x.prev?r2((x.p/x.prev-1)*100):0,src:bname(),spark:cl.slice(-30).map(r2),
    yhi:cl.length?r2(Math.max.apply(null,cl)):null,ylo:cl.length?r2(Math.min.apply(null,cl)):null,pctile:cl.length?r1(cl.filter(function(v){return v<=x.p}).length/cl.length*100):null};
  o.regime=x.p>20?'high':x.p>16?'elevated':x.p<12?'low':'normal';return o}
function pulseFile(){return Promise.all([allQuotes(),CH('NIFTY'),CH('BANKNIFTY'),K('NIFTY','15m'),K('BANKNIFTY','15m'),K('VIX','1d')]).then(function(a){
  var q=a[0],WS=AD().ws,KX=WS&&KLd(),rows=WS?null:flowRows(q),Qy=WS?null:quality(rows),WARM=0;if(WS){var W=wsRows(q,KX,'market pulse (mood, breadth and money flow)');if(W.g)return W.g;rows=W.rows;Qy=W.Qy;WARM=W.warm||0}if(!WS){var w=restWait('market pulse (mood, breadth and money flow)',Qy,rows);if(w)return w}if(!Qy.breadth||!Qy.volume)return empty('Market pulse (mood, breadth and money flow)',qWhy(Qy));
  var idx=[indexCard('NIFTY',q,a[1],lastSession(a[3])),indexCard('BANKNIFTY',q,a[2],lastSession(a[4]))],vix=vixInfo(q,a[5]);
  var adv=rows.filter(function(r){return r.p>0}).length,dec=rows.filter(function(r){return r.p<0}).length,inflow=r1(sum(rows.map(function(r){return r.f>0?r.f:0}))),outflow=r1(sum(rows.map(function(r){return r.f<0?r.f:0})));
  var b=(adv-dec)/Math.max(1,adv+dec),tot=inflow+Math.abs(outflow),f=tot?(inflow+outflow)/tot:0,n=idx[0].chg_pct!=null?clamp(idx[0].chg_pct,-1,1):0,v=0;
  if(vix.available)v=({low:0.5,normal:0.1,elevated:-0.5,high:-1})[vix.regime]-clamp(vix.chg_pct/10,-0.5,0.5);
  var sc=r1(50+50*clamp(0.35*b+0.30*f+0.20*n+0.15*v,-1,1)),lab=sc<35?'Risk-off':sc<45?'Cautious':sc<55?'Neutral':sc<65?'Constructive':'Risk-on';
  if(vix.available)idx.forEach(function(i){i.vix=vix});
  var sectors=sectorsOf(rows),top=sectors.slice().sort(function(x,y){return y.f-x.f});
  return{mood:{score:sc,label:lab,parts:{breadth:r2(b),flow:r2(f),nifty:r2(n),vix:r2(v)}},headline:lab+' reading from '+bname()+': F&O breadth '+adv+':'+dec+(top.some(function(z){return z.f})?', money into '+top.slice(0,2).map(function(z){return z.g}).join(' & ')+', out of '+top.slice(-2).map(function(z){return z.g}).join(' & '):', no clear sector flow')+'. For education only.',
    indices:idx,vix:vix,sectors:sectors.map(function(z){return{g:z.g,tv:z.tv,p:z.p,f:z.f,n:z.n,surge:false,top:z.top}}),adv:adv,dec:dec,inflow:inflow,outflow:outflow,ts:istStamp(now()),open:marketOpen(),sim:false,src:bname()}})}
function optionsFile(P){var s=(P.symbol||'NIFTY').toUpperCase(),exp=P.expiry?fromDmy(P.expiry)||P.expiry:null;
  if(!AD().caps.chain)return Promise.resolve(cannot('Option chain'));
  return Promise.all([CH(s,exp),Q([s])]).then(function(a){var ch=a[0],q=a[1][s];if(!ch||!ch.rows.length)return cannot('Option chain for '+s);
    var spot=(q&&q.p)||ch.spot,st=chainStats(ch,spot),i0=ch.rows.indexOf(st.atm),bars=ch.rows.slice(Math.max(0,i0-12),i0+13);
    var bullets=[];if(st.hasOI){bullets.push('Heaviest call OI at '+st.callWall+', heaviest put OI at '+st.putWall+' (from '+bname()+').');var add=ch.noPrevOI?null:ch.rows.slice().sort(function(x,y){return (y.ce.oi-y.ce.poi)-(x.ce.oi-x.ce.poi)})[0];if(ch.noPrevOI)bullets.push('Day OI change per strike is not in Kite quotes (no previous-day OI); OI flow tracks changes while this tab is open.');if(add)bullets.push('Largest call OI addition today: '+add.k+' ('+(add.ce.oi-add.ce.poi).toLocaleString('en-IN')+').')}
    else bullets.push('Open interest per strike is not available from '+bname()+' in the browser; IV and greeks are shown.');
    if(ch.ivNote)bullets.push(ch.ivNote+'.');bullets.push('For education only, not a recommendation.');
    return{symbol:s,spot:r2(spot),chg:q&&q.prev?r2(q.p-q.prev):null,chg_pct:q&&q.prev?r2((q.p/q.prev-1)*100):null,expiry:dmy(ch.expiry),expiries:ch.expiries.map(dmy),
      bars:bars.map(function(r){return{k:r.k,coi:r.ce.oi,poi:r.pe.oi,cchg:r.ce.oi!=null&&r.ce.poi!=null?r.ce.oi-r.ce.poi:null,pchg:r.pe.oi!=null&&r.pe.poi!=null?r.pe.oi-r.pe.poi:null,civ:r.ce.iv,piv:r.pe.iv}}),
      smile:ch.rows.filter(function(r){return r.ce.iv||r.pe.iv}).map(function(r){return{k:r.k,civ:r.ce.iv,piv:r.pe.iv}}),pcr:st.pcr,pcr_chg:st.pcr_chg,max_pain:st.max_pain,atm_iv:st.atm_iv,straddle:st.straddle,
      range:st.iv1,walls:st.hasOI?[st.putWall,st.callWall]:null,iv1:st.iv1,conviction:null,verdict:st.hasOI?('Option writers concentrated at '+st.putWall+' (puts) and '+st.callWall+' (calls); PCR '+st.pcr):'IV reading only (no OI from '+bname()+')',
      bias:st.pcr==null?'balanced':st.pcr>1.2?'put writers heavier':st.pcr<0.8?'call writers heavier':'balanced',confidence:null,bullets:bullets,chain_ts:dmy(istDay(ch.ts))+' '+istTime(ch.ts),lot:ch.lot,src:bname()}})}
function oiflowFile(P){var s=(P.symbol||'NIFTY').toUpperCase();if(!AD().caps.chainOI)return Promise.resolve(cannot('OI flow (per-strike open interest)'));
  return Promise.all([CH(s),Q([s])]).then(function(a){var ch=a[0],q=a[1][s];if(!ch)return cannot('OI flow for '+s);var spot=(q&&q.p)||ch.spot,st=chainStats(ch,spot);
    var key='oif:'+C.sess.id+':'+s+':'+istDay(),hist=[];try{hist=JSON.parse(sessionStorage.getItem(key)||'[]')}catch(e){}
    var i0=ch.rows.indexOf(st.atm),win=ch.rows.slice(Math.max(0,i0-14),i0+15),t=now(),prev=hist[hist.length-1];
    if(!prev||t-prev.ts>=55){var pm={};(prev&&prev.strikes||[]).forEach(function(x){pm[x.k]=x});var dt=prev?Math.max(1,(t-prev.ts)/60):1;
      var fr={ts:t,t:istTime(t),spot:r2(spot),fut:null,strikes:win.map(function(r){var p=pm[r.k]||{},cv=prev&&p.coi!=null?(r.ce.oi-p.coi)/dt:0,pv=prev&&p.poi!=null?(r.pe.oi-p.poi)/dt:0;
        return{k:r.k,coi:r.ce.oi,cchg:r.ce.poi!=null?r.ce.oi-r.ce.poi:null,cltp:r2(r.ce.ltp),cpx:p.cltp?r2((r.ce.ltp/p.cltp-1)*100):0,ct:chgTag(r.ce.ltp-(p.cltp||r.ce.ltp),cv),cti:null,cv:r1(cv),ca:r1(cv-(p.cv||0)),
          poi:r.pe.oi,pchg:r.pe.poi!=null?r.pe.oi-r.pe.poi:null,pltp:r2(r.pe.ltp),ppx:p.pltp?r2((r.pe.ltp/p.pltp-1)*100):0,pt:chgTag(r.pe.ltp-(p.pltp||r.pe.ltp),pv),pti:null,pv:r1(pv),pa:r1(pv-(p.pv||0))}})};
      hist.push(fr);hist=hist.slice(-120);try{sessionStorage.setItem(key,JSON.stringify(hist))}catch(e){hist=hist.slice(-30)}}
    var last=hist[hist.length-1],vmax=Math.max(1,Math.max.apply(null,last.strikes.map(function(x){return Math.max(Math.abs(x.cv),Math.abs(x.pv))})));
    var hot=last.strikes.map(function(x){return[{k:x.k,side:'CE',tag:x.ct,name:TAGN[x.ct]||'',v:x.cv,a:x.ca,oi:x.coi,chg:x.cchg},{k:x.k,side:'PE',tag:x.pt,name:TAGN[x.pt]||'',v:x.pv,a:x.pa,oi:x.poi,chg:x.pchg}]}).reduce(function(a,b){return a.concat(b)},[]).filter(function(x){return x.tag&&x.v}).sort(function(a,b){return Math.abs(b.v)-Math.abs(a.v)}).slice(0,3);
    var first=hist[0];
    var fl=(function(){var SP=function(f){return f?sum(f.strikes.map(function(x){return Math.abs(x.cv)+Math.abs(x.pv)})):0},sp=SP(last),pp=SP(hist[hist.length-2]),cvS=sum(last.strikes.map(function(x){return x.cv})),pvS=sum(last.strikes.map(function(x){return x.pv}));
      var mom=hist.length<2?0:Math.round(100*(pvS-cvS)/Math.max(1,Math.abs(pvS)+Math.abs(cvS)));return{sp:r1(sp),mom:mom,bias:mom>20?'Buyers stronger':mom<-20?'Sellers stronger':'Range-bound',conv:Math.min(100,Math.round(Math.abs(mom)*Math.min(1,hist.length/5))),acc:hist.length<3||!pp?'steady':sp>pp*1.15?'accelerating':sp<pp*0.85?'slowing':'steady'}})();
    return{symbol:s,sim:false,open:marketOpen(),frames:hist,step:win.length>1?win[1].k-win[0].k:null,vmax:r1(vmax),
      read:hist.length<2?'Collecting OI snapshots from '+bname()+' in this tab (one per minute). Velocity appears after the second snapshot.':'OI change per minute across '+hist.length+' snapshots taken in this tab from '+bname()+'.',
      summary:{bias:fl.bias,momentum:fl.mom,conviction:fl.conv,speed:fl.sp,accel:fl.acc,pcr:st.pcr,
        call_wall:st.callWall,put_wall:st.putWall,call_wall0:first&&first.cw||st.callWall,put_wall0:first&&first.pw||st.putWall,next:[],hot:hot,fut:null},
      interval_note:'velocity = OI change per minute between snapshots taken in this browser tab',disclaimer:'Live from your broker ('+bname()+'). Futures OI is not available from your broker.',expiry:dmy(ch.expiry),expiries:[dmy(ch.expiry)],chain_ts:dmy(istDay(ch.ts))+' '+istTime(ch.ts),src:bname()}})}
function liqFile(P){var s=(P.symbol||'NIFTY').toUpperCase(),tf=P.tf||'5m';if(!TFS[tf])tf='5m';if(!AD().caps.candles)return Promise.resolve(cannot('Liquidity map (candles)'));
  return Promise.all([K(s,tf),CH(s),Q([s])]).then(function(a){var c=a[0],ch=a[1],q=a[2][s];if(!c.length)return cannot('Candles for '+s);var spot=(q&&q.p)||c[c.length-1][4],st=ch&&chainStats(ch,spot);
    var W=null;if(st&&st.hasOI){var med=ch.rows.map(function(r){return r.ce.oi+r.pe.oi}).sort(function(x,y){return x-y})[Math.floor(ch.rows.length/2)];
      W={max_pain:st.max_pain,ce:st.cw.slice(0,3).map(function(r){return{k:r.k,oi:r.ce.oi,chg:r.ce.oi-r.ce.poi}}),pe:st.pw.slice(0,3).map(function(r){return{k:r.k,oi:r.pe.oi,chg:r.pe.oi-r.pe.poi}}),range:[st.putWall,st.callWall],
        strikes:ch.rows.map(function(r){return{k:r.k,coi:r.ce.oi,poi:r.pe.oi,cchg:r.ce.oi-r.ce.poi,pchg:r.pe.oi-r.pe.poi}}),med:med,spot:r2(spot)}}
    var sup=W&&W.pe[0],res=W&&W.ce[0];
    return{symbol:s,kind:'india',tf:tf,bars:c.slice(-750).map(function(x){return{t:x[0],o:x[1],h:x[2],l:x[3],c:x[4],v:x[5]}}),spot:r2(spot),chain_ts:ch?dmy(istDay(ch.ts))+' '+istTime(ch.ts):null,expiry:ch?dmy(ch.expiry):null,expiries:ch?ch.expiries.map(dmy):[],
      walls:W,buildup:[],buildup_src:'Futures OI buildup is not available from your broker',delivery:[],
      chips:{support:sup?{score:null,x:null,label:'Put OI '+sup.oi.toLocaleString('en-IN'),at:sup.k}:null,resistance:res?{score:null,x:null,label:'Call OI '+res.oi.toLocaleString('en-IN'),at:res.k}:null,bias:null},
      read:W?('Price '+r2(spot)+' between put OI at '+W.range[0]+' and call OI at '+W.range[1]+' ('+bname()+' option chain).'):'Candles from '+bname()+'; option walls not available from your broker for this symbol.',
      has_volume:!isIdx(s),open:marketOpen(),asof:istIso(now()),units:'contracts',srcs:['candles: '+bname()+' API (your browser)',W?'options: '+bname()+' option chain':'options: not available from your broker','buildup: not available from your broker'],src:bname()}})}

/* order flow: index from quotes; shards add candles + depth (only the ~19 stocks of the shard) */
var BINS=30,CMIN=5;
/* PULSEFIX: today's 5-minute bars for a WebSocket broker that also has REST candles (Kite): history from the relay, fetched once per
   stock per day (kept in localStorage, shared by this browser's tabs), merged with the bars this browser built from ticks. History is used up to and including the
   bar in which this browser's ticks started (that live bar is partial); live bars after it. Re-fetched at most every 5 min, and only
   when the merged series has a hole (e.g. the tab was closed for a while). */
function kHist(s){if(C.sess.id!=='kite'&&AD().today)return AD().today(s);var t=ktok(s);if(!t)return Promise.resolve([]);
  return kbAdd('/instruments/historical/'+t+'/5minute?from='+encodeURIComponent(istDay()+' 09:15:00')+'&to='+encodeURIComponent(istStamp(now()))+'&oi=0').then(function(j){
    return (((j&&j.data)||{}).candles||[]).map(function(c){return[Math.floor(Date.parse(kts(c[0]))/1000),+c[1],+c[2],+c[3],+c[4],+c[5]||0]}).filter(function(c){return c[0]>0}).sort(function(a,b){return a[0]-b[0]})},function(){return null})}
function kMerge(h,live,since){var sb=since?Math.floor(since/300000)*300:Infinity,m={};(h||[]).forEach(function(b){if(b[0]<=sb)m[b[0]]=b.slice()});
  (live||[]).forEach(function(b){if(b[0]>sb||!m[b[0]])m[b[0]]=b.slice()});return Object.keys(m).map(Number).sort(function(a,b){return a-b}).map(function(k){return m[k]})}
function kHole(c){var d=istDay(),b=c.filter(function(x){return istDay(x[0])===d});if(!b.length)return true;var cur=Math.floor(now()/300)*300;
  for(var i=1;i<b.length;i++)if(b[i][0]-b[i-1][0]>300)return true;return cur-b[b.length-1][0]>300}
function kToday(s,KX){var key='kt:'+C.sess.id+':'+istDay()+':'+s,e=lget(key),live=(((KX||{}).c||{})[s]||[]),since=KX&&KX.since;
  var merged=e?kMerge(e.h,live,since):null;if(merged&&(!kHole(merged)||Date.now()-e.at<300000||(C.sess.id!=='kite'&&!marketOpen()&&e.at>=Date.parse(istDay()+'T15:31:00+05:30'))))return Promise.resolve(merged);
  return once(key,function(){CUR=s;try{return kHist(s)}finally{CUR=''}}).then(function(h){if(h==null)return merged||live.map(function(b){return b.slice()});
    lset(key,{h:h,at:Date.now()},20*3600);return kMerge(h,live,since)})}
function ofAnalyse(sym,B,dp){if(!B||!B.length)return null;var lo=Math.min.apply(null,B.map(function(b){return b[3]})),hi=Math.max.apply(null,B.map(function(b){return b[2]})),step=hi>lo?Math.max((hi-lo)/BINS,0.05):0.05;
  var buy=[],sell=[],i;for(i=0;i<BINS;i++){buy.push(0);sell.push(0)}var cvd=0,cand=[],pv=0,vv=0,pc=B[0][1],agg=null;
  B.forEach(function(b){var t=b[0],o=b[1],h=b[2],l=b[3],c=b[4],v=b[5],rg=h-l,clv=rg>0?(2*c-h-l)/rg:(c>pc?1:c<pc?-1:0),d=v*clv;cvd+=d;pc=c;pv+=(h+l+c)/3*v;vv+=v;
    var i0=Math.min(BINS-1,Math.floor((l-lo)/step)),i1=Math.min(BINS-1,Math.floor((h-lo)/step)),n=i1-i0+1;for(var j=i0;j<=i1;j++){buy[j]+=v*(1+clv)/2/n;sell[j]+=v*(1-clv)/2/n}
    var k=t-t%(CMIN*60);if(agg&&agg[0]===k){agg[2]=Math.max(agg[2],h);agg[3]=Math.min(agg[3],l);agg[4]=c;agg[5]+=v;agg[6]+=d;agg[7]=cvd}else{if(agg)cand.push(agg);agg=[k,o,h,l,c,v,d,cvd]}});cand.push(agg);
  var tot=buy.map(function(x,i){return x+sell[i]}),T=sum(tot)||1,poc=tot.indexOf(Math.max.apply(null,tot)),a=poc,bb=poc,acc=tot[poc];
  while(acc<0.7*T&&(a>0||bb<BINS-1)){var up=bb<BINS-1?tot[bb+1]:-1,dn=a>0?tot[a-1]:-1;if(up>=dn){bb++;acc+=up}else{a--;acc+=dn}}
  var mid=function(i){return lo+(i+0.5)*step},ltp=(dp&&dp.ltp)||B[B.length-1][4];
  var hvn=[];for(i=1;i<BINS-1;i++)if(Math.abs(i-poc)>1&&tot[i]>=tot[i-1]&&tot[i]>=tot[i+1]&&tot[i]>0.6*T/BINS*1.5)hvn.push(i);
  var spaced=function(ps){var o=[];ps.forEach(function(p){if(o.every(function(x){return Math.abs(p-x)>=3*step}))o.push(p)});return o.slice(0,3)};
  var byv=function(ps){return ps.sort(function(x,y){return tot[Math.min(BINS-1,Math.floor((y-lo)/step))]-tot[Math.min(BINS-1,Math.floor((x-lo)/step))]})};
  var sup=spaced(byv(hvn.map(mid).filter(function(p){return p<ltp}))).sort(function(x,y){return y-x}),res=spaced(byv(hvn.map(mid).filter(function(p){return p>ltp}))).sort(function(x,y){return x-y});
  var lv=[{kind:'poc',label:'POC',price:r2(mid(poc))},{kind:'vah',label:'VAH',price:r2(lo+(bb+1)*step)},{kind:'val',label:'VAL',price:r2(lo+a*step)},{kind:'vwap',label:'VWAP',price:r2(vv?pv/vv:ltp)}];
  sup.forEach(function(p,j){lv.push({kind:'s',label:'S'+(j+1),price:r2(p)})});res.forEach(function(p,j){lv.push({kind:'r',label:'R'+(j+1),price:r2(p)})});
  var dep=null;if(dp&&(dp.bids.length||dp.asks.length)){var tb=dp.tbq||sum(dp.bids.map(function(x){return x[1]})),ts=dp.tsq||sum(dp.asks.map(function(x){return x[1]}));
    dep={bids:dp.bids,asks:dp.asks,tbq:tb,tsq:ts,imb:tb+ts?r2((tb-ts)/(tb+ts)):0,hist:[]};var qs=dp.bids.concat(dp.asks).map(function(x){return x[1]}).sort(function(x,y){return x-y}),md=qs[Math.floor(qs.length/2)]||1;
    dp.bids.forEach(function(x){if(x[1]>=3*md)lv.push({kind:'wall_bid',label:'Bid wall',price:r2(x[0]),qty:x[1]})});dp.asks.forEach(function(x){if(x[1]>=3*md)lv.push({kind:'wall_ask',label:'Ask wall',price:r2(x[0]),qty:x[1]})})}
  var bv=sum(buy),sv=sum(sell),m=meta(sym),prev=dp&&dp.prev;
  return{symbol:sym,name:m[0],sector:m[1],ltp:r2(ltp),prev:prev,chg_pct:prev?r2((ltp/prev-1)*100):null,candles:cand.map(function(c){return[c[0],r2(c[1]),r2(c[2]),r2(c[3]),r2(c[4]),Math.round(c[5]),Math.round(c[6]),Math.round(c[7])]}),
    profile:{lo:r2(lo),step:Math.round(step*1e4)/1e4,buy:buy.map(Math.round),sell:sell.map(Math.round)},poc:lv[0].price,vah:lv[1].price,val:lv[2].price,vwap:lv[3].price,cvd:Math.round(cvd),buy_pct:bv+sv?r2(bv/(bv+sv)*100):50,levels:lv,depth:dep}}
function ofIndex(){var WS=AD().ws,KX=WS&&KLd();
  /* OFALL: first order-flow build of this page with a relay backfill (Dhan): try one stock first, so a broker that refuses the
     backfill (no Data API, bad token, relay down) gets the old tick-only gate straight away instead of half-filled charts */
  if(WS&&AD().today&&DOK===null&&tradedToday()&&eqList().length){var s0=eqList()[0];return kToday(s0,KX).then(function(){if(DOK===null)DOK=lget('kt:'+C.sess.id+':'+istDay()+':'+s0)?1:0;return ofIndex()},function(){if(DOK===null)DOK=0;return ofIndex()})}
  if(WS&&!useToday()){var nb=maxBars(KX);if(nb<8)return Promise.resolve(wsWait(KX,'order blocks',nb,'8 five-minute candles','five-minute candles',(function(){var so=secsToOpen(),base=so!=null?Date.now()+so*1000:Math.floor(Date.now()/300000)*300000;return base+(8-nb)*300000})()))}else if(!WS&&!AD().caps.candles)return Promise.resolve(cannot('Order flow (needs 5-minute candles with volume)'));return allQuotes().then(function(q){var q0=q,UT=WS&&useToday();if(WS)q=wsMergeQ(q,KX);var list=eqList(),st=[];list.forEach(function(s,i){var x=q[s];if(!x||!(x.p>0))return;if(UT&&!(x.v>0)&&q0[s]&&q0[s].v>0){x=Object.assign({},x,{v:q0[s].v})} /* OFALL: first seconds after connect: day volume from the quote until tick deltas arrive */var m=meta(s),cached=cget('of:'+C.sess.id+':'+s);
    var base=cached||{symbol:s,name:m[0],sector:m[1],ltp:r2(x.p),prev:x.prev,chg_pct:x.prev?r2((x.p/x.prev-1)*100):null,poc:null,vah:null,val:null,vwap:x.atp?r2(x.atp):null,cvd:null,buy_pct:null,levels:[]};
    st.push({symbol:s,name:base.name,sector:base.sector,ltp:r2(x.p),prev:x.prev,chg_pct:x.prev?r2((x.p/x.prev-1)*100):null,poc:base.poc,vah:base.vah,val:base.val,vwap:base.vwap,cvd:base.cvd,buy_pct:base.buy_pct,sh:i%12,
      tv:r1((x.v||0)*(x.atp||x.p)/1e7),imb:x.tbq+x.tsq?r2((x.tbq-x.tsq)/(x.tbq+x.tsq)):null,levels:(base.levels||[]).filter(function(l){return l.kind==='s'||l.kind==='r'}),ob:{bull:0,bear:0,str:0,near:null,nb:null}})});
  if(!st.length)return empty('Order flow','no quotes came back from '+bname());if(!st.some(function(z){return z.tv>0})){if(!marketOpen())return closedMsg('order flow');if(!AD().ws)return{error:'Collecting live data from '+bname()+'… — order flow appears once stocks have traded. This page refreshes by itself.',waiting:1};if(useToday()&&KX&&KX.since&&Date.now()-KX.since<180000)return{error:'Collecting live data from '+bshort()+'… — today\u2019s candles are loaded; order flow appears with the next ticks (a few seconds). This page refreshes by itself.',waiting:1};return empty('Order flow',bname()+' sent no traded volume')}
  return{open:marketOpen(),ts:istStamp(now()),candle_min:CMIN,shards:12,sources:['quotes'+(AD().caps.candles?' + 5-minute candles':'')+' from '+bname()+' (your browser); volume profile and delta are estimated from candles'],stocks:st,src:bname()}})}
function ofShard(n,only){var WS=AD().ws,KX=WS&&KLd();if(!WS&&!AD().caps.candles)return Promise.resolve(cannot('Order-flow candles'));var list=only?[only]:eqList().filter(function(s,i){return i%12===n});
  return (only?(function(){CUR=only;try{return Q([only])}finally{CUR=''}})():allQuotes()).then(function(q){if(WS)q=wsMergeQ(q,KX);return Promise.all(list.map(function(s){return (WS?(useToday()?kToday(s,KX):Promise.resolve((((KX||{}).c||{})[s]||[]).map(function(b){return b.slice()}))):K(s,'5m')).then(function(c){var x=q[s]||{},B=lastSession(c);
      var dk='dp:'+C.sess.id+':'+s,dc=cget(dk),dpp=WS?Promise.resolve({bids:[],asks:[],tbq:x.tbq||0,tsq:x.tsq||0}):(x.bids&&x.bids.length)?Promise.resolve({bids:x.bids,asks:x.asks,tbq:x.tbq,tsq:x.tsq}):dc?Promise.resolve(dc):AD().depth?(function(){CUR=s;try{return AD().depth(s)}finally{CUR=''}})().then(function(d){return d&&cset(dk,d,180)},function(){return null}):Promise.resolve(null);
      return dpp.then(function(d){var r=ofAnalyse(s,B,{ltp:x.p,prev:x.prev,bids:d?d.bids:[],asks:d?d.asks:[],tbq:d?d.tbq:0,tsq:d?d.tsq:0});if(r){r.sh=n;cset('of:'+C.sess.id+':'+s,r,600)}return r})})}))}).then(function(rs){rs=rs.filter(Boolean);
    if(!rs.length)return cannot('Order-flow candles');return{open:marketOpen(),ts:istStamp(now()),candle_min:CMIN,sources:['5-minute candles'+(AD().caps.depth?' + market depth':'')+' from '+bname()+' (your browser)'],stocks:rs,src:bname()}})}

/* strength boards: quotes for all, ADR from daily candles (cached for the day), charts for the leaders */
var IMP=0.35,ONE=2.0,TOP=10;
function zones(c,side,adr){var o=c.map(function(x){return x[1]}),h=c.map(function(x){return x[2]}),l=c.map(function(x){return x[3]}),cl=c.map(function(x){return x[4]}),t=c.map(function(x){return x[0]}),n=cl.length,zs=[],i=0;
  while(i<n-1){var opp=side>0?cl[i]<o[i]:cl[i]>o[i];if(opp){var j=i+1,ext=side>0?h[i]:l[i],best=j;while(j<n){if(side>0&&h[j]>ext){ext=h[j];best=j}if(side<0&&l[j]<ext){ext=l[j];best=j}if((side>0&&cl[j]<l[i])||(side<0&&cl[j]>h[i]))break;j++;if(j-i>24)break}
    var leg=side>0?ext-h[i]:l[i]-ext;if(leg>=IMP*adr){var lo=side>0?l[i]:Math.min(o[i],cl[i]),hi=side>0?Math.max(o[i],cl[i]):h[i];zs.push({t:t[i],t_end:t[Math.min(best,n-1)],lo:r2(lo),hi:r2(hi)});i=best;continue}}i++}return zs.reverse().slice(0,4)}
function setup(c,side,adr,lp){var zs=zones(c,side,adr);if(!zs.length)return null;var z=zs[0],h=c.map(function(x){return x[2]}),l=c.map(function(x){return x[3]}),before=c.filter(function(x){return x[0]<z.t}),liq,inv,res,sup,mid,rr;
  if(side>0){liq=Math.min(before.length?Math.min.apply(null,before.map(function(x){return x[3]})):z.lo-0.15*adr,z.lo);inv=z.lo-0.1*adr;res=Math.max.apply(null,h);sup=lp>z.hi?z.hi:z.lo;mid=(z.lo+z.hi)/2;rr=(res-mid)/Math.max(1e-9,mid-inv)}
  else{liq=Math.max(before.length?Math.max.apply(null,before.map(function(x){return x[2]})):z.hi+0.15*adr,z.hi);inv=z.hi+0.1*adr;sup=Math.min.apply(null,l);res=lp<z.lo?z.lo:z.hi;mid=(z.lo+z.hi)/2;rr=(mid-sup)/Math.max(1e-9,inv-mid)}
  return{zone:z,prior:zs.slice(1),support:r2(sup),resistance:r2(res),liquidity:r2(liq),invalid:r2(inv),rr:r2(rr)}}
var ADRJOB=null;
function adrMap(){var k='adr:'+C.sess.id+':'+istDay();var m=lget(k)||{};return m}
function adrFill(){if(ADRJOB||!AD().caps.candles)return;var k='adr:'+C.sess.id+':'+istDay(),m=adrMap(),todo=eqList().filter(function(s){return m[s]==null});if(!todo.length)return;
  ADRJOB=chunks(todo,AD().rest?20:1).reduce(function(p,g){return p.then(function(){return Promise.all(g.map(function(s){return K(s,'1d').then(function(c){var d=c.filter(function(x){return istDay(x[0])<istDay()}).slice(-50);if(d.length){m[s]=r2(sum(d.map(function(b){return (b[2]-b[3])/b[4]*100}))/d.length);lset(k,m,20*3600)}})}))})},Promise.resolve()).then(function(){ADRJOB=null},function(){ADRJOB=null})}
function strengthFile(){if(!AD().caps.candles)return Promise.resolve(cannot('Strength boards (need daily candles for the average range)'));
  return allQuotes().then(function(q){adrFill();var adr=adrMap(),rows=[],pending=0;
    eqList().forEach(function(s){var x=q[s];if(!x||!(x.p>0)||!(x.o>0))return;var a=adr[s];if(a==null){pending++;return}var m=meta(s),op=x.o,up=x.h-op,dn=op-x.l,mv=(x.p-op)/op*100,clean=(up>ONE*dn&&mv>0)||(dn>ONE*up&&mv<0);
      rows.push({s:s,g:m[1],p:x.prev?r2((x.p/x.prev-1)*100):null,lp:r2(x.p),o:r2(op),st:clean&&a?r2(mv/a):0,adr:a,mv:r2(mv)})});
    if(!rows.length)return pending?{error:'Strength boards are still loading average ranges from '+bname()+' ('+pending+' stocks to go, refreshes automatically)'}:empty('Strength boards',bname()+' sent no open/high/low prices for these stocks');
    var bull=rows.filter(function(r){return r.st>0}).sort(function(a,b){return b.st-a.st}),bear=rows.filter(function(r){return r.st<0}).sort(function(a,b){return a.st-b.st});
    [bull,bear].forEach(function(l){l.forEach(function(r,i){r.rk=i+1;r.drk=null;r.new=false})});
    var lead=bull.slice(0,TOP).map(function(r){return[1,r]}).concat(bear.slice(0,TOP).map(function(r){return[-1,r]})),charts={};
    return Promise.all(lead.map(function(x){return K(x[1].s,'5m').then(function(c){var B=lastSession(c);if(B.length){x[1].setup=setup(B,x[0],x[1].adr/100*x[1].lp,x[1].lp);charts[x[1].s]=B.map(function(b){return b.slice(0,5)})}else x[1].setup=null})})).then(function(){
      var sec={};rows.forEach(function(r){(sec[r.g]=sec[r.g]||[]).push(r)});var adv=rows.filter(function(r){return r.p>0}).length,dec=rows.filter(function(r){return r.p<0}).length;
      return{ts:now(),open:marketOpen(),status:'Live from '+bname()+(pending?' · '+pending+' stocks still loading':''),tf:'5m',top:TOP,method:{adr_days:50,oneside:ONE,impulse_adr:IMP},
        breadth:{adv:adv,dec:dec,unch:rows.length-adv-dec,n:rows.length,bull:bull.length,bear:bear.length,choppy:rows.length-bull.length-bear.length},
        sectors:Object.keys(sec).map(function(g){var v=sec[g];return{g:g,st:r2(sum(v.map(function(z){return z.st}))/v.length),p:r2(sum(v.map(function(z){return z.p||0}))/v.length),n:v.length,up:v.filter(function(z){return z.p>0}).length}}).sort(function(a,b){return b.st-a.st}),
        bull:bull.slice(0,TOP*2),bear:bear.slice(0,TOP*2),charts:charts,dots:rows.map(function(r){return[r.s,r.mv,r.st,r.g]}),src:bname()}})})}

/* radar (reduced): price/candle axes + option chain; futures-OI axis not available */
function radarFile(P){var s=(P.symbol||'NIFTY').toUpperCase();if(!AD().caps.candles)return Promise.resolve(cannot('Radar (needs candles)'));
  return Promise.all([K(s,'15m'),K(s,'1h'),K(s,'1d'),CH(s),Q([s,'VIX'])]).then(function(a){var c15=a[0],c1h=a[1],c1d=a[2],ch=a[3],q=a[4][s],vx=a[4].VIX;if(!c15.length||!q)return cannot('Radar for '+s);
    var spot=q.p,st=ch&&chainStats(ch,spot),vw=vwapSeries(lastSession(c15)),lv=vw.length?vw[vw.length-1].value:spot,r15=rsi(c15.map(function(x){return x[4]})),r1h=rsi(c1h.map(function(x){return x[4]})),r1d=rsi(c1d.map(function(x){return x[4]}));
    var A1=atr(c1d),of=ofAnalyse(s,lastSession(c15),{ltp:spot,prev:q.prev,bids:[],asks:[]})||{};
    var hh=function(c){if(c.length<10)return 0;var a1=c.slice(-10,-5),b1=c.slice(-5),h1=Math.max.apply(null,a1.map(function(x){return x[2]})),h2=Math.max.apply(null,b1.map(function(x){return x[2]})),l1=Math.min.apply(null,a1.map(function(x){return x[3]})),l2=Math.min.apply(null,b1.map(function(x){return x[3]}));return h2>h1&&l2>l1?1:h2<h1&&l2<l1?-1:0};
    var pa=hh(c1h)+hh(c1d),vwS=clamp((spot-lv)/(A1||spot*0.01)*2,-2,2),vpS=of.vah?(spot>of.vah?1:spot<of.val?-1:0):0,rsS=r1h==null?0:clamp((r1h-50)/10,-2,2),opS=st&&st.pcr!=null?clamp((st.pcr-1)*2,-2,2):0;
    var comps=[{name:'Futures OI buildup',score:null,reason:'not available from your broker'},{name:'Option chain',score:st&&st.pcr!=null?r2(opS):null,reason:st&&st.pcr!=null?'PCR '+st.pcr+' ('+bname()+')':'OI not available from your broker'},
      {name:'Volume profile',score:vpS,reason:of.poc?'value area '+of.val+'–'+of.vah+', POC '+of.poc:'n/a'},{name:'RSI',score:r2(rsS),reason:'RSI 15m '+r15+' / 1h '+r1h+' / 1d '+r1d},{name:'Price action',score:pa,reason:'swing structure on 1h and 1d candles'},{name:'VWAP',score:r2(vwS),reason:'session VWAP '+lv}];
    var norm=r2(clamp((opS+vpS+rsS+pa+vwS)/5*5,-10,10)),bias=norm>1?'BULLISH':norm<-1?'BEARISH':'NEUTRAL';
    var sc=function(x){return x==null?null:r1(50+25*x)};
    var axes=[{k:'OI',v:null,line:'Futures OI: not available from your broker'},{k:'Options',v:st&&st.pcr!=null?sc(opS):null,line:st?(st.hasOI?'Puts '+st.putWall+' / calls '+st.callWall+'; PCR '+st.pcr:'IV '+st.atm_iv+'% (no OI from '+bname()+')'):'Option chain not available from your broker'},
      {k:'VWAP',v:sc(vwS),line:(spot>=lv?'Above':'Below')+' session VWAP '+lv},{k:'Vol profile',v:sc(vpS),line:of.val?'Value area '+of.val+'–'+of.vah+'; POC '+of.poc:'n/a'},{k:'RSI',v:sc(rsS),line:'RSI 15m '+r15+' / 1h '+r1h+' / 1d '+r1d},
      {k:'Price action',v:sc(pa/1),line:'1h + daily swing structure'},{k:'VIX/ATR calm',v:vx&&vx.p?r1(clamp(100-(vx.p-10)*5,0,100)):null,line:(vx&&vx.p?'India VIX '+r2(vx.p)+'; ':'')+'ATR '+r2(A1)+' pts'},
      {k:'S/R room',v:null,line:(of.levels||[]).filter(function(l){return l.kind==='s'||l.kind==='r'}).map(function(l){return l.label+' '+l.price}).join(' · ')||'n/a'}];
    var levels=(of.levels||[]).filter(function(l){return l.kind==='s'||l.kind==='r'}).map(function(l){return{p:l.price,t:l.label,k:l.kind==='s'?'sup':'res'}});
    var ser=function(c,n){var cc=c.slice(-n);return{c:cc.map(function(x){return x.slice(0,5)}),vwap:vwapSeries(cc)}};
    return{symbol:s,spot:r2(spot),chg:q.prev?r2(spot-q.prev):null,chg_pct:q.prev?r2((spot/q.prev-1)*100):null,bias:bias,norm:norm,verdict:'Indicator reading '+norm+'/10 from '+bname()+' data (5 of 6 inputs; futures OI not available). For education only.',
      axes:axes,range:st&&st.iv1,iv1:st&&st.iv1,conviction:null,expiry:ch?dmy(ch.expiry):null,levels:levels,series:{'15m':ser(c15,160),'1h':ser(c1h,160),'1d':ser(c1d,160)},
      plan:null,comps:comps,chain_ts:ch?dmy(istDay(ch.ts))+' '+istTime(ch.ts):null,src:bname()}})}

/* RSI screener: progressive (status.running/done/total), candles cached */
var RSI={rows:{},job:null,done:0};
function chunks(a,n){var o=[];for(var i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o}
function rsiFile(P){if(!AD().caps.candles)return Promise.resolve(cannot('RSI screener (needs candles)'));var OB=+P.ob||65,OS=+P.os||30,list=IDX.slice(0,4).concat(eqList());
  return allQuotes().then(function(q){if(!RSI.job){RSI.job=chunks(list,AD().rest?5:1).reduce(function(p,g){return p.then(function(){return Promise.all(g.map(function(s){if(RSI.rows[s])return;return Promise.all([K(s,'5m'),K(s,'15m'),K(s,'1h'),K(s,'1d')]).then(function(a){
      RSI.rows[s]={'5m':rsi(a[0].map(function(x){return x[4]})),'15m':rsi(a[1].map(function(x){return x[4]})),'1h':rsi(a[2].map(function(x){return x[4]})),'1d':rsi(a[3].map(function(x){return x[4]})),bar_t:a[0].length?istIso(a[0][a[0].length-1][0]):null};RSI.done++})}))})},Promise.resolve()).then(function(){RSI.job='done'},function(){RSI.job=null})}
    var rows=[];list.forEach(function(s){var r=RSI.rows[s],x=q[s];if(!r||!x)return;var v=[r['5m'],r['15m'],r['1h'],r['1d']];if(v.some(function(z){return z==null}))return;var nob=v.filter(function(z){return z>=OB}).length,nos=v.filter(function(z){return z<=OS}).length;
      rows.push({s:s,'5m':r['5m'],bar_t:r.bar_t,'15m':r['15m'],'1h':r['1h'],'1d':r['1d'],chg:x.prev?r2((x.p/x.prev-1)*100):null,last:r2(x.p),nob:nob,nos:nos,all_ob:nob===4,all_os:nos===4})});
    var cnt={};['5m','15m','1h','1d'].forEach(function(t){cnt['ob_'+t]=rows.filter(function(r){return r[t]>=OB}).length;cnt['os_'+t]=rows.filter(function(r){return r[t]<=OS}).length});
    cnt.ob_any=rows.filter(function(r){return r.nob>0}).length;cnt.os_any=rows.filter(function(r){return r.nos>0}).length;cnt.ob_all=rows.filter(function(r){return r.all_ob}).length;cnt.os_all=rows.filter(function(r){return r.all_os}).length;
    return{rows:rows,counts:cnt,ob:OB,os:OS,tfs:['5m','15m','1h','1d'],asof:istIso(now()),status:{ts:istIso(now()),running:RSI.job!=='done',done:RSI.done,total:list.length,error:null},sim:false,src:bname()}})}


/* ---------- Kite: calm zone (realised vol + in-browser ATM IV) and futures basis, from Kite REST via the pass-through ---------- */
function stdev(a){if(a.length<2)return null;var m=sum(a)/a.length,v=0;a.forEach(function(x){v+=(x-m)*(x-m)});return Math.sqrt(v/(a.length-1))}
function lrets(c){var r=[];for(var i=1;i<c.length;i++)if(c[i-1][4]>0&&c[i][4]>0)r.push(Math.log(c[i][4]/c[i-1][4]));return r}
function nearK(rows,x,dir){var b=null;rows.forEach(function(r){if(dir<0?r.k<=x:r.k>=x){if(!b||Math.abs(r.k-x)<Math.abs(b.k-x))b=r}});return b}
function stayed(c,n,dn,up){var ok=0,tot=0;for(var i=Math.max(0,c.length-260);i+n<c.length;i++){var p0=c[i][4],lo=Infinity,hi=-Infinity;for(var j=i+1;j<=i+n;j++){if(c[j][3]<lo)lo=c[j][3];if(c[j][2]>hi)hi=c[j][2]}
  tot++;if(lo>=p0*(1-dn/100)&&hi<=p0*(1+up/100))ok++}return tot?r1(ok/tot*100):null}
function calmFile(){if(!AD().rest||!AD().caps.chain)return Promise.resolve(cannot('Calm stocks (needs per-stock option IV, realised volatility and results dates)'));
  var list=eqList();
  return Promise.all([nfoLoad(),allQuotes(),K('NIFTY','1d')].concat(list.map(function(s){return K(s,'1d')}))).then(function(a){var N=a[0],q=a[1],nd=a[2],cds=a.slice(3);
    var nr={};lrets(nd).forEach(function(x,i){nr[nd[i+1][0]]=x});
    var plan=[],syms=[];list.forEach(function(s,i){var u=N[s],x=q[s],c=cds[i];if(!u||!x||!(x.p>0)||!c||c.length<70)return;var X=nfoExp(u,3);if(!X.e)return;var rows=nfoStrikes(u,X.e);if(!rows.length)return;
      var atm=nearK(rows,x.p,0)||rows[0];rows.forEach(function(r){if(Math.abs(r.k-x.p)<Math.abs(atm.k-x.p))atm=r});var pe=nearK(rows,x.p*0.9,-1),ce=nearK(rows,x.p*1.1,1);
      var leg=[atm.ce,atm.pe,pe&&pe.pe,ce&&ce.ce].filter(Boolean);leg.forEach(function(t){syms.push('NFO:'+t)});plan.push({s:s,u:u,x:x,c:c,e:X.e,atm:atm,pe:pe,ce:ce})});
    if(!plan.length)return cannot('Calm stocks (Kite sent no daily candles or option contracts)');
    return kquote(syms).then(function(d){var lp=function(t){var z=t&&d['NFO:'+t];return z?+z.last_price||0:0},oi=function(t){var z=t&&d['NFO:'+t];return z?+z.oi||0:0};
      var rows=[];plan.forEach(function(P){var c=P.c,spot=P.x.p,rt=lrets(c),rv60=stdev(rt.slice(-60)),rv20=stdev(rt.slice(-20));if(rv60==null)return;rv60*=Math.sqrt(252)*100;rv20=rv20!=null?rv20*Math.sqrt(252)*100:null;
        var dte=Math.max(1,(Date.parse(P.e+'T15:30:00+05:30')/1000-now())/86400),n=Math.max(1,Math.round(dte*5/7)),T=yearsTo(P.e);
        var civ=impVol(spot,P.atm.k,T,lp(P.atm.ce),true),piv=impVol(spot,P.atm.k,T,lp(P.atm.pe),false),iv=civ&&piv?(civ+piv)/2:(civ||piv||null);
        var A=atr(c),pa=[],pb=[];c.slice(-121).forEach(function(b,i,arr){if(i&&nr[b[0]]!=null&&arr[i-1][4]>0){pa.push(Math.log(b[4]/arr[i-1][4]));pb.push(nr[b[0]])}});
        var beta=null;if(pa.length>30){var ma=sum(pa)/pa.length,mb=sum(pb)/pb.length,cv=0,vb=0;for(var i=0;i<pa.length;i++){cv+=(pa[i]-ma)*(pb[i]-mb);vb+=(pb[i]-mb)*(pb[i]-mb)}beta=vb?r2(cv/vb):null}
        var dn=P.pe?r2((1-P.pe.k/spot)*100):null,up=P.ce?r2((P.ce.k/spot-1)*100):null,prem=P.pe&&P.ce?r2(lp(P.pe.pe)+lp(P.ce.ce)):null,lot=P.u.lot;
        rows.push({s:P.s,rv:r2(rv60),inr:stayed(c,n,10,10),atr:A&&spot?r2(A/spot*100):null,beta:beta,iv:iv!=null?r2(iv):null,ivr:iv&&rv20?r2(iv/rv20):null,oi:r1((oi(P.atm.ce)+oi(P.atm.pe))/1e5),
          earn:'unknown',earn_before:false,earn_text:'Results dates are not available from Kite, so results risk is not checked.',prem:prem!=null&&lot?r2(prem*lot):null,
          st:P.pe&&P.ce?{pe:P.pe.k,ce:P.ce.k,prem:prem,lot:lot,prem_lot:prem!=null&&lot?r2(prem*lot):null,dn:dn,up:up,dn_pct:dn,up_pct:up,hist:stayed(c,n,dn,up),hist_touch:stayed(c,n,dn,up)}:null,_e:P.e,_n:n})});
      var rvs=rows.map(function(r){return r.rv}).sort(function(a,b){return a-b});
      rows.forEach(function(r){var pct=rvs.indexOf(r.rv)/Math.max(1,rvs.length-1)*100;r.calm=r1(clamp(0.6*(r.inr||0)+0.4*(100-pct),0,100));var edge=r.ivr?clamp((r.ivr-0.8)/0.8*100,0,100):0;r.score=r1(0.7*r.calm+0.3*edge);
        r.verdict=(r.calm>=70?'Calm: ':r.calm>=45?'Moderate: ':'Jumpy: ')+'stayed within ±10% in '+(r.inr==null?'—':Math.round(r.inr))+'% of past '+r._n+'-session windows'+(r.ivr?', options priced at '+r.ivr+'× 20-day realised volatility':'')+'. Results date not checked. For education only, not advice.'});
      rows.sort(function(a,b){return b.score-a.score});rows.forEach(function(r,i){r.rank=i+1});
      var ec={};rows.forEach(function(r){ec[r._e]=(ec[r._e]||0)+1});var E=Object.keys(ec).sort(function(a,b){return ec[b]-ec[a]})[0];rows.forEach(function(r){delete r._e;delete r._n});
      return{asof:istDay(),expiry:E?dmy(E):null,days:E?Math.max(1,Math.round((Date.parse(E+'T15:30:00+05:30')/1000-now())/86400)):null,rows:rows,top:rows.slice(0,8).map(function(r){return r.s}),
        note:'Realised volatility from Kite daily candles; ATM IV computed in your browser from Kite option prices (Black-Scholes, r=6.5%). Results dates are not available from Kite.',src:bname()}})})}
function basisFile(P){if(!AD().rest)return Promise.resolve(cannot('Futures basis screener (futures contract quotes are not mapped for browser use yet)'));var par=+P.par||0.05,ser=P.series==='next'?1:0,R=6.5;
  return Promise.all([nfoLoad(),allQuotes()]).then(function(a){var N=a[0],q=a[1],list=IDX.slice(0,4).concat(eqList()),syms=[],plan=[];
    list.forEach(function(s){var u=N[s];if(!u||!u.fut.length)return;var fs=u.fut.filter(function(f){return f.e>=istDay()});if(!fs.length)return;plan.push({s:s,f:fs});fs.slice(0,2).forEach(function(f){syms.push('NFO:'+f.ts)})});
    return kquote(syms).then(function(d){var rows=[],cnt={Discount:0,'At par':0,Premium:0};
      var calc=function(s,f,spot){var z=d['NFO:'+f.ts];if(!z||!(z.last_price>0)||!(spot>0))return null;var dte=Math.max(1,(Date.parse(f.e+'T15:30:00+05:30')/1000-now())/86400),fut=+z.last_price,bp=(fut/spot-1)*100,ann=bp*365/dte,pc=z.ohlc&&z.ohlc.close>0?r2((fut/z.ohlc.close-1)*100):null;
        return{exp:dmy(f.e),fut:r2(fut),basis:r2(fut-spot),bp:r2(bp),ann:r2(ann),fair:r2(R*dte/365),vs_carry:r2(ann-R),oi:+z.oi||0,pchg:pc,vol:+z.volume||0}};
      plan.forEach(function(p){var x=q[p.s];if(!x||!(x.p>0))return;var f0=p.f[ser]||p.f[0],m=calc(p.s,f0,x.p);if(!m)return;var alt=p.f[ser?0:1],am=alt&&calc(p.s,alt,x.p);
        var bucket=m.bp<-par?'Discount':m.bp>par?'Premium':'At par';cnt[bucket]++;
        rows.push({s:p.s,idx:isIdx(p.s),spot:r2(x.p),fut:m.fut,exp:m.exp,basis:m.basis,bp:m.bp,ann:m.ann,fair:m.fair,vs_carry:m.vs_carry,oi:m.oi,doi:null,doi_pct:null,pchg:m.pchg,tag:null,bucket:bucket,thin:!m.vol,alt:am?{exp:am.exp,bp:am.bp,ann:am.ann,tag:null}:null})});
      if(!rows.length)return cannot('Futures basis (Kite sent no futures quotes)');
      return{rows:rows,counts:cnt,par:par,mode:P.mode||'raw',series:ser?'next':'cur',r:R,asof:istIso(now()),status:{ts:istIso(now()),running:false,done:rows.length,total:rows.length,error:null},sim:false,
        note:'Futures and spot from Kite. Day OI change is not in Kite quotes, so build-up tags are not shown.',src:bname()}})})}
function cachedB(k,ttl,fn){var key=k+':'+C.sess.id,c=cget(key);if(c)return Promise.resolve(c);return once(key,fn).then(function(v){return v&&!v.error?cset(key,v,ttl,true):v})}
/* ---------- router ---------- */
function parse(name){var m=String(name).replace(/^sim\//,'').replace(/\.json$/,'').split('@'),fam=m[0],P={};
  if(m[1])m[1].split('__').forEach(function(kv){var i=kv.indexOf('-');if(i>0)P[kv.slice(0,i)]=kv.slice(i+1).replace(/~([0-9A-F]{2})/g,function(_,h){return String.fromCharCode(parseInt(h,16))})});return{fam:fam,P:P}}
var AVAIL={quotes:'quotes',pulse:'quotes + candles + option chain',flow:'quotes',orderflow:'quotes + 5-minute candles',options:'option chain',oiflow:'option-chain OI snapshots',liq:'candles + option chain',strength:'quotes + candles',radar:'candles + option chain',screen_rsi:'candles'};
BD.ofOne=function(sym){try{if(!C||!C.sess||!AD()||AD().ws||!AD().caps.candles||!C.ins||!C.ins.eq||!(sym in C.ins.eq))return Promise.resolve(null);var n=eqList().indexOf(sym);return ofShard(n%12,sym)}catch(e){return Promise.resolve(null)}};
BD.build=function(name){var out=build0(name);if(!AD()||!AD().ws)return out;var fam=parse(name).fam;if(!/^(flow|pulse|orderflow(_p\d+)?)$/.test(fam))return out;
  return out.then(function(o){if(!o||o.error)return o;var K=KLd(),n=liveNote(K);if((fam==='flow'||fam==='pulse')&&LASTWARM)n+=' · first 2 minutes: money flow estimated from '+bshort()+' day volume and price, switching to tick-by-tick flow automatically';o.note=n;o.live_since=klSince(K);
    if(fam==='flow'){o.status=n;if(o.summary)o.summary=o.summary.replace(' (from '+bname()+')',' (live from your '+bshort()+' feed since '+(o.live_since||'—')+' IST)');o.notes=[n+'. Inflow/outflow = traded-volume changes between ticks × price direction, counted only while this browser was receiving the feed.'].concat(o.notes||[]);o.method='flow = Σ(Δ day volume × price × tick direction) from your '+bshort()+' WebSocket feed, in this browser';o.fast_basis=o.speed_basis='not available from your '+bshort()+' feed'}
    if(fam==='pulse'&&o.headline)o.headline=o.headline.replace(' reading from '+bname()+':',' reading from your '+bshort()+' feed (live since '+(o.live_since||'—')+' IST):');
    if(/^orderflow/.test(fam)){o.candle_min=5;o.sources=[useToday()?'Today\u2019s 5-minute candles from '+bshort()+' history, then '+n.charAt(0).toLowerCase()+n.slice(1)+' (live bars from ticks)':n+' (5-minute candles aggregated from ticks; volume from day-volume changes)']}
    return o})};
function build0(name){var p=parse(name),f=p.fam,P=p.P,sh=f.match(/^orderflow_p(\d+)$/);
  try{
    if(f==='quotes')return quotesFile();if(f==='pulse')return pulseFile();if(f==='flow')return flowFile();
    if(f==='orderflow')return ofIndex();if(sh)return ofShard(+sh[1]);
    if(f==='options')return optionsFile(P);if(f==='oiflow')return oiflowFile(P);if(f==='liq')return liqFile(P);
    if(f==='strength')return strengthFile();if(f==='radar')return radarFile(P);if(f==='screen_rsi')return rsiFile(P);
    if(f==='screen_iv')return Promise.resolve(cannot('IV screener (needs a year of implied-volatility history for every F&O stock)'));
    if(f==='screen_basis')return cachedB('bas:'+(P.series||'cur')+':'+(P.par||''),300,function(){return basisFile(P)});
    if(f==='calm')return cachedB('calm',1800,calmFile);
    if(/^fii|^dii|^fiidii/.test(f))return Promise.resolve(cannot('FII/DII flows (exchange-published, not broker data)'));
    return Promise.resolve(cannot('This view'));
  }catch(e){return Promise.resolve(cannot('This view (error: '+String(e&&e.message||e).slice(0,80)+')'))}};
BD.caps=function(){return AD()&&AD().caps};
BD.init=function(ctx){C=ctx;ANVR='unknown';ANVT=0;ANV=null};
BD.name=bname;
BD._test={anKind:anKind,ANL:ANL,parse:parse,impVol:impVol,rsi:rsi,ofAnalyse:ofAnalyse,expiryCandidates:expiryCandidates,chainStats:chainStats};
})();
