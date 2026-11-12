/* Vayron crypto & gold derivatives data layer — free public exchange REST only, fetched in the visitor's browser.
   Sources: OKX public v5 (candles, tickers, taker volume, OI, funding, long/short, liquidations, books),
   Deribit public v2 (BTC/ETH options, DVOL, perpetual), Hyperliquid public info (funding, OI).
   Educational only. Nothing here is mock data: when a source fails, the value is omitted. */
(function(){'use strict';
var OK='https://www.okx.com/api/v5/',HL='https://api.hyperliquid.xyz/info',DB='https://www.deribit.com/api/v2/public/';
var IST=19800,BINS=30,CMIN=5,NB=100;
/* OKX rubik stats have no CORS headers: on vayron hosts they go through a small cached same-origin relay (/api/cfno/okx). */
var RELAY=typeof location!=='undefined'&&/(^|\.)vayron\.(com|pages\.dev)$/.test(location.hostname)?'/api/cfno/okx?p=':null;
var A={
  BTC:{key:'BTC',name:'Bitcoin',swap:'BTC-USDT-SWAP',spot:'BTC-USDT',idx:'BTC-USDT',uly:'BTC-USDT',fut:'BTC-USD-',hl:'BTC',dbt:'BTC',tv:'OKX:BTCUSDT.P'},
  ETH:{key:'ETH',name:'Ether',swap:'ETH-USDT-SWAP',spot:'ETH-USDT',idx:'ETH-USDT',uly:'ETH-USDT',fut:'ETH-USD-',hl:'ETH',dbt:'ETH',tv:'OKX:ETHUSDT.P'},
  GOLD:{key:'GOLD',name:'Gold',swap:'XAU-USDT-SWAP',spot:'XAUT-USDT',idx:'XAU-USDT',uly:'XAU-USDT',fut:'XAU-USD_UM-',hl:'PAXG',dbt:null,tv:'OKX:XAUUSDT.P'}};
var INST=[
  {symbol:'BTC-PERP',a:'BTC',id:'BTC-USDT-SWAP',kind:'perp',group:'Bitcoin',name:'Bitcoin · BTC/USDT perpetual swap (OKX)',tv:'OKX:BTCUSDT.P'},
  {symbol:'BTC-SPOT',a:'BTC',id:'BTC-USDT',kind:'spot',group:'Bitcoin',name:'Bitcoin · BTC/USDT spot (OKX)',tv:'OKX:BTCUSDT'},
  {symbol:'ETH-PERP',a:'ETH',id:'ETH-USDT-SWAP',kind:'perp',group:'Ether',name:'Ether · ETH/USDT perpetual swap (OKX)',tv:'OKX:ETHUSDT.P'},
  {symbol:'ETH-SPOT',a:'ETH',id:'ETH-USDT',kind:'spot',group:'Ether',name:'Ether · ETH/USDT spot (OKX)',tv:'OKX:ETHUSDT'},
  {symbol:'XAU-PERP',a:'GOLD',id:'XAU-USDT-SWAP',kind:'perp',group:'Gold',name:'Gold · XAU/USDT perpetual swap (OKX, crypto-settled)',tv:'OKX:XAUUSDT.P'},
  {symbol:'XAUT',a:'GOLD',id:'XAUT-USDT',kind:'spot',group:'Gold',name:'Tether Gold token · XAUT/USDT spot (OKX)',tv:'OKX:XAUTUSDT'},
  {symbol:'PAXG',a:'GOLD',id:'PAXG-USDT',kind:'spot',group:'Gold',name:'Pax Gold token · PAXG/USDT spot (OKX)',tv:'OKX:PAXGUSDT'}];
var BYS={};INST.forEach(function(x,i){x.sh=i;BYS[x.symbol]=x});
function now(){return Math.floor(Date.now()/1000)}
function r2(x){return x==null||!isFinite(x)?null:Math.round(x*100)/100}
function rN(x,n){if(x==null||!isFinite(x))return null;var p=Math.pow(10,n);return Math.round(x*p)/p}
function sum(a){var s=0;for(var i=0;i<a.length;i++)s+=a[i];return s}
function ist(t){var d=new Date(((t==null?now():t)+IST)*1000);return d.toISOString().slice(0,19).replace('T',' ')}
function istHM(ms){return new Date(ms+IST*1000).toISOString().slice(11,16)}
function f(x){return parseFloat(x)}
/* ---- cache + paced queues (OKX rubik stats ≤5 req/2s; market ≤20 req/2s) ---- */
var MC=new Map(),INF=new Map(),Q={};
function cget(k){var e=MC.get(k);return e&&e.t>Date.now()?e.v:null}
function cset(k,v,ttl){MC.set(k,{v:v,t:Date.now()+ttl*1000});return v}
function paced(q,gap,fn){var t=Date.now(),at=Math.max(t,(Q[q]||0)+gap);Q[q]=at;return new Promise(function(r){setTimeout(r,at-t)}).then(fn)}
function getj(url,opt){return fetch(url,Object.assign({credentials:'omit',cache:'no-store'},opt||{})).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})}
function cached(k,ttl,fn){var c=cget(k);if(c)return Promise.resolve(c);if(INF.has(k))return INF.get(k);
  var p=fn().then(function(v){INF.delete(k);return cset(k,v,ttl)},function(e){INF.delete(k);throw e});INF.set(k,p);return p}
/* rubik stats via the relay: requests made within 60 ms go out as ONE batched worker request, and results are kept in
   localStorage for their TTL, so reloads and page switches cost no worker requests (free Workers quota). */
var RB=[],RBT=0,LSK='cfno_rb1:';
function lsGet(k){try{var e=JSON.parse(localStorage.getItem(LSK+k)||'null');return e&&e.t>Date.now()?e.v:null}catch(e){return null}}
function lsSet(k,v,ttl){try{localStorage.setItem(LSK+k,JSON.stringify({t:Date.now()+ttl*1000,v:v}))}catch(e){try{for(var i=localStorage.length-1;i>=0;i--){var kk=localStorage.key(i);if(kk&&kk.indexOf(LSK)===0)localStorage.removeItem(kk)}}catch(_){}}}
function rbFlush(){clearTimeout(RBT);RBT=0;var b=RB.splice(0,12);if(!b.length)return;if(RB.length)RBT=setTimeout(rbFlush,60);
  getj('/api/cfno/okx?b=1&'+b.map(function(x){return 'p='+encodeURIComponent(x.p)}).join('&')).then(function(j){var r=j&&j.r||[];b.forEach(function(x,i){var v=r[i];if(v&&v.code==='0')x.res(v);else x.rej(new Error('OKX '+(v&&v.msg||'relay')))})},function(e){b.forEach(function(x){x.rej(e)})})}
function relayGet(path){return new Promise(function(res,rej){RB.push({p:path,res:res,rej:rej});if(RB.length>=12)rbFlush();else if(!RBT)RBT=setTimeout(rbFlush,60)})}
/* OKX limits are per endpoint, so each endpoint gets its own paced queue (was one shared queue: ~40 calls in a row). */
function epOf(p){return p.split('?')[0]}
function gapOf(p){var e=epOf(p);return /mark-price|funding-rate|instruments/.test(e)?210:/candles|books/.test(e)?55:110}
function okx(path,ttl){var rub=/^rubik\//.test(path);
  if(rub&&RELAY){var lt=/period=5m/.test(path)?150:600;return cached('okx:'+path,lt,function(){var v=lsGet(path);if(v)return Promise.resolve(v);return relayGet(path).then(function(j){lsSet(path,j.data,lt);return j.data})})}
  return cached('okx:'+path,ttl||20,function(){return paced(rub?'rubik':'okx:'+epOf(path),rub?250:gapOf(path),function(){return getj(OK+path)}).then(function(j){if(!j||j.code!=='0')throw new Error('OKX '+(j&&j.msg||'error'));return j.data})})}
function hlCtx(){return cached('hl:ctx',30,function(){return getj(HL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'metaAndAssetCtxs'})}).then(function(j){var m={};j[0].universe.forEach(function(u,i){m[u.name]=j[1][i]});return m})})}
function dbt(path,ttl){return cached('dbt:'+path,ttl||60,function(){return getj(DB+path).then(function(j){if(!j||!('result' in j))throw new Error('Deribit error');return j.result})})}
function safe(p){return p.then(function(v){return v},function(){return null})}
/* ---- instruments meta ---- */
function ctVal(id){return cached('ct:'+id,86400,function(){return okx('public/instruments?instType=SWAP&instId='+id,86400).then(function(d){return f(d[0].ctVal)||1})})}
function futList(){return cached('futs',3600,function(){return okx('public/instruments?instType=FUTURES',3600)})}
function nearFut(a){return futList().then(function(L){var t=Date.now()+7*86400e3,c=L.filter(function(x){return x.instId.indexOf(A[a].fut)===0&&/^\d{6}$/.test(x.instId.slice(A[a].fut.length))&&+x.expTime>t}).sort(function(x,y){return x.expTime-y.expTime});
  // prefer a quarterly (Mar/Jun/Sep/Dec) contract for basis, else nearest
  var q=c.filter(function(x){return /^(03|06|09|12)$/.test(x.instId.slice(-4,-2))});return (q[0]||c[0])||null})}
/* ---- candles ---- */
function mapC(d){return d.map(function(x){return[+x[0]/1000,f(x[1]),f(x[2]),f(x[3]),f(x[4]),f(x[7])||f(x[6])||0,+x[8]]}).reverse()}
function candles(id,bar,n,ttl){n=n||NB;if(n>300)n=300;if(ttl==null)ttl=bar==='1m'?12:bar==='5m'?15:60;return okx('market/candles?instId='+id+'&bar='+bar+'&limit='+n,ttl).then(mapC)}
/* 1-minute candles: latest 300 (~5h) every ~12s, plus an older page cached ~90s, so ~10h covers the 5m card window without extra polling. */
function minCandles(id){return cached('m1:'+id,12,function(){return candles(id,'1m',300,12).then(function(latest){if(!latest.length)return latest;var after=Math.round(latest[0][0]*1000);return cached('m1h:'+id,90,function(){return okx('market/history-candles?instId='+id+'&bar=1m&limit=300&after='+after,90).then(mapC)}).then(function(hist){var seen={},out=[];(hist||[]).concat(latest).forEach(function(c){if(!seen[c[0]]){seen[c[0]]=1;out.push(c)}});return out.sort(function(a,b){return a[0]-b[0]})},function(){return latest})})})}
function liveBars(sym){var ins=BYS[sym];if(!ins)return Promise.reject(new Error('unknown instrument'));return Promise.all([candles(ins.id,'5m',NB,15),safe(minCandles(ins.id)),safe(ticker(ins.id))]).then(function(r){var c5=r[0]||[],m1=r[1]||[],tkr=r[2],ltp=tkr&&f(tkr.last)||(m1.length?m1[m1.length-1][4]:null)||(c5.length?c5[c5.length-1][4]:null);return{c5:c5,m1:m1,tkr:tkr,ltp:ltp,m1ok:m1.length>0}})}
function takerSeries(id,period,n){return okx('rubik/stat/taker-volume-contract?instId='+id+'&period='+period+'&limit='+(n||100)+'&unit=2',period==='5m'?60:300).then(function(d){var m={};d.forEach(function(x){m[+x[0]/1000]={sell:f(x[1]),buy:f(x[2])}});return m})}
function ticker(id){var pre=typeof window!=='undefined'&&window.__cfhPre&&window.__cfhPre[id];if(pre&&!pre._used){pre._used=1;return cached('okx:market/ticker?instId='+id,8,function(){return pre.then(function(d){return[d]})}).then(function(d){return d[0]})}return okx('market/ticker?instId='+id,8).then(function(d){return d[0]})}
function quick(a){return ticker(A[a].swap)}
function book(id){return okx('market/books?instId='+id+'&sz=400',15).then(function(d){var b=d[0];return{bids:b.bids.map(function(x){return[f(x[0]),f(x[1])]}),asks:b.asks.map(function(x){return[f(x[0]),f(x[1])]})}})}
/* backtest history: OKX history-candles, 100 per page */
function history(id,bar,n){var out=[],after='';function page(){return okx('market/history-candles?instId='+id+'&bar='+bar+'&limit=100'+(after?'&after='+after:''),300).then(function(d){if(!d.length)return out;d.forEach(function(x){out.push([+x[0]/1000,f(x[1]),f(x[2]),f(x[3]),f(x[4]),f(x[7])||f(x[6])||0])});after=d[d.length-1][0];return out.length<n&&d.length===100?page():out})}
  return cached('hist:'+id+':'+bar+':'+n,600,function(){return page().then(function(o){var seen={};return o.filter(function(c){if(seen[c[0]])return false;seen[c[0]]=1;return true}).sort(function(x,y){return x[0]-y[0]})})})}
/* ---- order-flow analysis (same output shape as the NSE order-flow files) ---- */
function analyse(ins,B,tk,dp,tkr){if(!B||!B.length)return null;var lo=Math.min.apply(null,B.map(function(b){return b[3]})),hi=Math.max.apply(null,B.map(function(b){return b[2]})),step=hi>lo?(hi-lo)/BINS:Math.max(lo*1e-4,1e-6);
  var buy=[],sell=[],i;for(i=0;i<BINS;i++){buy.push(0);sell.push(0)}var cvd=0,cand=[],pv=0,vv=0,pc=B[0][1],real=0;
  B.forEach(function(b){var t=b[0],o=b[1],h=b[2],l=b[3],c=b[4],v=b[5],rg=h-l,clv=rg>0?(2*c-h-l)/rg:(c>pc?1:c<pc?-1:0),x=tk&&tk[t],bf;
    if(x&&x.buy+x.sell>0){bf=x.buy/(x.buy+x.sell);real++}else bf=(1+clv)/2;var d=v*(2*bf-1);cvd+=d;pc=c;pv+=(h+l+c)/3*v;vv+=v;
    var i0=Math.min(BINS-1,Math.floor((l-lo)/step)),i1=Math.min(BINS-1,Math.floor((h-lo)/step)),n=i1-i0+1;for(var j=i0;j<=i1;j++){buy[j]+=v*bf/n;sell[j]+=v*(1-bf)/n}
    cand.push([t,o,h,l,c,Math.round(v),Math.round(d),Math.round(cvd)])});
  var tot=buy.map(function(x,i){return x+sell[i]}),T=sum(tot)||1,poc=tot.indexOf(Math.max.apply(null,tot)),a=poc,bb=poc,acc=tot[poc];
  while(acc<0.7*T&&(a>0||bb<BINS-1)){var up=bb<BINS-1?tot[bb+1]:-1,dn=a>0?tot[a-1]:-1;if(up>=dn){bb++;acc+=up}else{a--;acc+=dn}}
  var dec=lo<10?4:2,R=function(x){return rN(x,dec)},mid=function(i){return lo+(i+0.5)*step},ltp=tkr&&f(tkr.last)||B[B.length-1][4];
  var hvn=[];for(i=1;i<BINS-1;i++)if(Math.abs(i-poc)>1&&tot[i]>=tot[i-1]&&tot[i]>=tot[i+1]&&tot[i]>0.6*T/BINS*1.5)hvn.push(i);
  var spaced=function(ps){var o=[];ps.forEach(function(p){if(o.every(function(x){return Math.abs(p-x)>=3*step}))o.push(p)});return o.slice(0,3)};
  var byv=function(ps){return ps.sort(function(x,y){return tot[Math.min(BINS-1,Math.floor((y-lo)/step))]-tot[Math.min(BINS-1,Math.floor((x-lo)/step))]})};
  var sup=spaced(byv(hvn.map(mid).filter(function(p){return p<ltp}))).sort(function(x,y){return y-x}),res=spaced(byv(hvn.map(mid).filter(function(p){return p>ltp}))).sort(function(x,y){return x-y});
  var lv=[{kind:'poc',label:'POC',price:R(mid(poc))},{kind:'vah',label:'VAH',price:R(lo+(bb+1)*step)},{kind:'val',label:'VAL',price:R(lo+a*step)},{kind:'vwap',label:'VWAP',price:R(vv?pv/vv:ltp)}];
  sup.forEach(function(p,j){lv.push({kind:'s',label:'S'+(j+1),price:R(p)})});res.forEach(function(p,j){lv.push({kind:'r',label:'R'+(j+1),price:R(p)})});
  var dep=null;if(dp&&(dp.bids.length||dp.asks.length)){var tb=sum(dp.bids.map(function(x){return x[1]})),ts=sum(dp.asks.map(function(x){return x[1]}));
    dep={bids:dp.bids.slice(0,10),asks:dp.asks.slice(0,10),tbq:tb,tsq:ts,imb:tb+ts?r2((tb-ts)/(tb+ts)):0,hist:[]};var qs=dp.bids.concat(dp.asks).map(function(x){return x[1]}).sort(function(x,y){return x-y}),md=qs[Math.floor(qs.length/2)]||1;
    var walls=function(L,kind,label){L.filter(function(x){return x[1]>=8*md}).sort(function(x,y){return y[1]-x[1]}).slice(0,2).forEach(function(x){lv.push({kind:kind,label:label,price:R(x[0]),qty:x[1]})})};walls(dp.bids,'wall_bid','Bid wall');walls(dp.asks,'wall_ask','Ask wall')}
  var bv=sum(buy),sv=sum(sell),prev=tkr&&f(tkr.open24h);
  return{symbol:ins.symbol,name:ins.name,sector:ins.group,kind:ins.kind,ltp:R(ltp),prev:prev,chg_pct:prev?r2((ltp/prev-1)*100):null,candles:cand.map(function(c){return[c[0],R(c[1]),R(c[2]),R(c[3]),R(c[4]),c[5],c[6],c[7]]}),
    profile:{lo:R(lo),step:rN(step,6),buy:buy.map(Math.round),sell:sell.map(Math.round)},poc:lv[0].price,vah:lv[1].price,val:lv[2].price,vwap:lv[3].price,cvd:Math.round(cvd),buy_pct:bv+sv?r2(bv/(bv+sv)*100):50,levels:lv,depth:dep,
    delta_src:real>=B.length*0.6?'taker':'estimated',tv:r2(vv/1e6),sh:ins.sh}}
function shardFor(ins){return cached('of:'+ins.symbol,45,function(){return Promise.all([candles(ins.id,'5m',NB,15),ins.kind==='perp'?safe(takerSeries(ins.id,'5m',100)):Promise.resolve(null),safe(book(ins.id)),safe(ticker(ins.id)),safe(minCandles(ins.id))]).then(function(r){var x=analyse(ins,r[0],r[1],r[2],r[3]);if(!x)throw new Error('No candles');x.ts=ist();x.m1=r[4]||[];x.m1ok=!!(r[4]&&r[4].length);return x})})}
function obSummary(x){var B=window.__cfnoBlocks;if(!B||!x||!x.candles)return{bull:0,bear:0,str:0,near:null,nb:null};var obs=(B(x.candles,x.m1)||[]).filter(function(o){return !o.forming}),l=x.ltp,best=null;
  obs.forEach(function(o){if(o.mit)return;var d=Math.min(Math.abs(l-o.top),Math.abs(l-o.bot))/l*100;if(!best||d<best.d)best={d:d,b:o.bull}});
  return{bull:obs.filter(function(o){return o.bull}).length,bear:obs.filter(function(o){return !o.bull}).length,str:r2(Math.max.apply(null,[0].concat(obs.map(function(o){return o.str})))),near:best?r2(best.d):null,nb:best?best.b:null}}
function ofIndex(){return Promise.all(INST.map(function(ins){return safe(shardFor(ins))})).then(function(rs){var st=[];rs.forEach(function(x,i){if(!x)return;var ins=INST[i];
    st.push({symbol:ins.symbol,name:ins.name,sector:ins.group,kind:ins.kind,ltp:x.ltp,prev:x.prev,chg_pct:x.chg_pct,poc:x.poc,vah:x.vah,val:x.val,vwap:x.vwap,cvd:x.cvd,buy_pct:x.buy_pct,sh:ins.sh,tv:x.tv,imb:x.depth?x.depth.imb:null,
      levels:x.levels.filter(function(l){return l.kind==='s'||l.kind==='r'}),ob:obSummary(x)})});
  if(!st.length)return{error:'Not available: the public exchange feeds did not respond from this browser. Try again in a minute.'};
  return{open:true,ts:ist(),candle_min:CMIN,shards:INST.length,note:'Last '+Math.round(NB*CMIN/60*10)/10+' h of 5-minute candles',sources:['OKX public market data (candles, taker volume, order book) fetched in your browser'],stocks:st}})}
function flowFile(){return ofIndex().then(function(ix){var g={};(ix.stocks||[]).forEach(function(s){var e=g[s.sector]=g[s.sector]||{g:s.sector,ps:[],f:0};if(s.chg_pct!=null)e.ps.push(s.chg_pct);e.f+=(s.cvd||0)/1e6});
  return{sectors:Object.keys(g).map(function(k){var e=g[k];return{g:k,p:e.ps.length?r2(sum(e.ps)/e.ps.length):null,f:r2(e.f)}}),stocks:(ix.stocks||[]).map(function(s){return{s:s.symbol,n:s.name,g:s.sector,lp:s.ltp,p:s.chg_pct,f:r2((s.cvd||0)/1e6),fo:true}})}})}
function file(name){var m=String(name).replace(/\.json$/,''),sh=m.match(/^orderflow_p(\d+)$/);
  if(m==='orderflow')return ofIndex();if(sh){var ins=INST[+sh[1]];if(!ins)return Promise.resolve({error:'No such shard'});return shardFor(ins).then(function(x){return{open:true,ts:x.ts,candle_min:CMIN,stocks:[x]}},function(e){return{error:'Not available: '+e.message}})}
  if(m==='flow')return flowFile();return Promise.resolve({sim:true,rows:[]})}
/* ---- derivatives snapshot per asset ---- */
/* last good snapshot per asset in localStorage, shown instantly (labelled as cached) on the next visit */
function deriv(a){return derivLive(a).then(function(v){if(v&&v.last)lsSet('dv:'+a,v,6*3600);return v})}
function derivCached(a){return lsGet('dv:'+a)}
function derivLive(a){var X=A[a];return cached('dv:'+a,30,function(){
  return Promise.all([safe(ticker(X.swap)),safe(okx('public/mark-price?instType=SWAP&instId='+X.swap,10)),safe(okx('market/index-tickers?instId='+X.idx,10)),safe(okx('public/funding-rate?instId='+X.swap,60)),
    safe(okx('public/open-interest?instType=SWAP&instId='+X.swap,30)),safe(okx('rubik/stat/contracts/open-interest-history?instId='+X.swap+'&period=1H&limit=48',300)),
    safe(okx('rubik/stat/contracts/long-short-account-ratio-contract?instId='+X.swap+'&period=1H&limit=48',300)),safe(okx('rubik/stat/contracts/long-short-position-ratio-contract-top-trader?instId='+X.swap+'&period=1H&limit=48',300)),
    safe(takerSeries(X.swap,'1H',48)),safe(nearFut(a)),safe(hlCtx()),safe(ticker(X.spot)),safe(okx('public/funding-rate-history?instId='+X.swap+'&limit=90',600)),
    X.dbt?safe(dbt('ticker?instrument_name='+X.dbt+'-PERPETUAL',30)):Promise.resolve(null)]).then(function(r){
    var t=r[0],mk=r[1]&&f(r[1][0].markPx),ix=r[2]&&f(r[2][0].idxPx),fr=r[3]&&r[3][0],oi=r[4]&&r[4][0],oh=(r[5]||[]).map(function(x){return{t:+x[0]/1000,oi:f(x[1]),ccy:f(x[2]),usd:f(x[3])}}).reverse(),
      ls=(r[6]||[]).map(function(x){return{t:+x[0]/1000,v:f(x[1])}}).reverse(),tt=(r[7]||[]).map(function(x){return{t:+x[0]/1000,v:f(x[1])}}).reverse(),tk=r[8]||{},fu=r[9],hl=r[10]&&r[10][X.hl],sp=r[11],fh=(r[12]||[]).map(function(x){return{t:+x.fundingTime/1000,v:f(x.realizedRate||x.fundingRate)}}).reverse(),dp=r[13];
    var o={a:a,ts:ist(),last:t&&f(t.last),open24:t&&f(t.open24h),mark:mk,index:ix,spot:sp&&f(sp.last),vol24usd:t&&f(t.volCcy24h)*f(t.last)};
    o.chg24=o.last&&o.open24?(o.last/o.open24-1)*100:null;
    if(fr){o.funding=f(fr.fundingRate);o.fundingNext=+fr.fundingTime||null;var per=fr.fundingTime&&fr.nextFundingTime?(+fr.nextFundingTime-+fr.fundingTime)/3600e3:8;o.fundingHrs=per>0&&per<=24?per:8;o.fundingAnn=o.funding*(24/o.fundingHrs)*365*100}
    if(oi){o.oiUsd=f(oi.oiUsd);o.oiCcy=f(oi.oiCcy)}
    if(oh.length>24){var p0=oh[oh.length-25].usd,c0=oh[oh.length-25].ccy,lastc=oh[oh.length-1].ccy;o.oiChgPct=c0?(lastc/c0-1)*100:null;o.oiChgUsd=oh[oh.length-1].usd-p0}
    o.oiHist=oh;o.ls=ls.length?ls[ls.length-1].v:null;o.lsHist=ls;o.top=tt.length?tt[tt.length-1].v:null;o.topHist=tt;o.fundHist=fh;
    var tks=Object.keys(tk).map(Number).sort(function(x,y){return x-y}),last24=tks.slice(-24),b=0,s=0;last24.forEach(function(k){b+=tk[k].buy;s+=tk[k].sell});o.takerBuy24=b;o.takerSell24=s;o.takerHist=tks.map(function(k){return{t:k,buy:tk[k].buy,sell:tk[k].sell}});
    if(o.mark&&o.index)o.premium=(o.mark/o.index-1)*100;
    if(o.chg24!=null&&o.oiChgPct!=null){var pu=o.chg24>=0,ou=o.oiChgPct>=0;o.buildup=pu&&ou?'Long buildup':!pu&&ou?'Short buildup':pu&&!ou?'Short covering':'Long unwinding'}
    o.venues=[];if(o.funding!=null)o.venues.push({v:'OKX',sym:X.swap,funding8:o.funding*(8/o.fundingHrs)*100,oiUsd:o.oiUsd,premium:o.premium});
    if(hl){var hm=f(hl.markPx);o.venues.push({v:'Hyperliquid',sym:X.hl+(a==='GOLD'?' (PAXG perp)':' perp'),funding8:f(hl.funding)*8*100,oiUsd:f(hl.openInterest)*hm,premium:f(hl.premium)*100})}
    if(dp)o.venues.push({v:'Deribit',sym:X.dbt+'-PERPETUAL',funding8:dp.funding_8h!=null?dp.funding_8h*100:null,oiUsd:dp.open_interest,premium:dp.index_price?(dp.mark_price/dp.index_price-1)*100:null});
    return (fu?Promise.all([safe(ticker(fu.instId)),safe(okx('public/mark-price?instType=FUTURES&instId='+fu.instId,30))]):Promise.resolve([null,null])).then(function(q){
      if(fu&&o.index){var px=q[0]&&+q[0].vol24h>0?f(q[0].last):null,m2=q[1]&&f(q[1][0].markPx),use=px||m2,days=(+fu.expTime-Date.now())/86400e3;
        if(use){o.fut={id:fu.instId,exp:new Date(+fu.expTime).toISOString().slice(0,10),px:use,src:px?'last trade':'mark price',days:days,basis:use-o.index,basisPct:(use/o.index-1)*100,ann:(use/o.index-1)*365/days*100}}}
      return o})})})}
/* ---- options (Deribit public) ---- */
var MON={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
function options(a){var X=A[a];if(!X.dbt)return Promise.resolve(null);return cached('opt:'+a,90,function(){var t1=Date.now();
  return Promise.all([dbt('get_book_summary_by_currency?currency='+X.dbt+'&kind=option',90),safe(dbt('get_volatility_index_data?currency='+X.dbt+'&resolution=3600&start_timestamp='+(t1-3*86400e3)+'&end_timestamp='+t1,600))]).then(function(r){
    var by={},U=null;r[0].forEach(function(x){var p=x.instrument_name.split('-');if(p.length<4)return;var m=p[1].match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);if(!m)return;
      var exp=Date.UTC(2000+ +m[3],MON[m[2]],+m[1],8),K=+p[2],cp=p[3],e=by[exp]=by[exp]||{exp:exp,label:p[1],rows:{},coi:0,poi:0,cv:0,pv:0,und:null};
      var row=e.rows[K]=e.rows[K]||{k:K,coi:0,poi:0,civ:null,piv:null};var oi=x.open_interest||0,vol=x.volume||0;
      if(cp==='C'){row.coi+=oi;row.civ=x.mark_iv;e.coi+=oi;e.cv+=vol}else{row.poi+=oi;row.piv=x.mark_iv;e.poi+=oi;e.pv+=vol}if(x.underlying_price)e.und=x.underlying_price;if(x.estimated_delivery_price)U=x.estimated_delivery_price});
    var ex=Object.keys(by).map(Number).sort(function(x,y){return x-y}).map(function(k){var e=by[k],rows=Object.keys(e.rows).map(Number).sort(function(x,y){return x-y}).map(function(K){return e.rows[K]});e.rows=rows;
      var best=null;rows.forEach(function(r0){var pay=0;rows.forEach(function(r1){pay+=r1.coi*Math.max(0,r0.k-r1.k)+r1.poi*Math.max(0,r1.k-r0.k)});if(!best||pay<best.p)best={k:r0.k,p:pay}});e.maxPain=best&&best.k;
      var u=e.und||U,atm=null;rows.forEach(function(r0){if(r0.civ==null&&r0.piv==null)return;if(!atm||Math.abs(r0.k-u)<Math.abs(atm.k-u))atm=r0});
      e.atmIv=atm?(atm.civ!=null&&atm.piv!=null?(atm.civ+atm.piv)/2:(atm.civ!=null?atm.civ:atm.piv)):null;e.atmK=atm&&atm.k;e.pcr=e.coi?e.poi/e.coi:null;e.pcrVol=e.cv?e.pv/e.cv:null;e.days=(k-Date.now())/86400e3;e.und=u;return e}).filter(function(e){return e.days>0});
    var coi=sum(ex.map(function(e){return e.coi})),poi=sum(ex.map(function(e){return e.poi})),dv=r[1]&&r[1].data&&r[1].data.length?r[1].data[r[1].data.length-1][4]:null;
    var main=ex.filter(function(e){return e.days>=1.5})[0]||ex[0];
    return{a:a,ts:ist(),und:U,expiries:ex,pcr:coi?poi/coi:null,callOi:coi,putOi:poi,dvol:dv,dvolHist:r[1]&&r[1].data?r[1].data.map(function(x){return{t:x[0]/1000,v:x[4]}}):[],main:main,unit:X.dbt}})})}
/* ---- liquidations (OKX public, filled) ---- */
function liquidations(a){var X=A[a];return cached('liq:'+a,30,function(){return Promise.all([okx('public/liquidation-orders?instType=SWAP&uly='+X.uly+'&state=filled&limit=100',30),ctVal(X.swap)]).then(function(r){var L=[];(r[0]||[]).forEach(function(g){(g.details||[]).forEach(function(d){var px=f(d.bkPx),usd=f(d.sz)*r[1]*px;L.push({t:+d.ts/1000,side:d.posSide,px:px,usd:usd})})});
  L.sort(function(x,y){return y.t-x.t});var lg=sum(L.filter(function(x){return x.side==='long'}).map(function(x){return x.usd})),sh=sum(L.filter(function(x){return x.side==='short'}).map(function(x){return x.usd}));
  return{a:a,list:L,longUsd:lg,shortUsd:sh,from:L.length?L[L.length-1].t:null,to:L.length?L[0].t:null}})})}
/* ---- live trade stream (OKX public WebSocket) for real-time money flow ---- */
var WS=null,WSL=[],WSS={};
function live(onMsg){WSL.push(onMsg);if(WS)return;var ids=INST.map(function(x){return x.id});
  function open(){try{WS=new WebSocket('wss://ws.okx.com/ws/v5/public')}catch(e){WS=null;return}
    WS.onopen=function(){WS.send(JSON.stringify({op:'subscribe',args:ids.map(function(id){return{channel:'trades',instId:id}})}));WS._p=setInterval(function(){try{WS.send('ping')}catch(e){}},20000)};
    WS.onmessage=function(ev){if(ev.data==='pong')return;var j;try{j=JSON.parse(ev.data)}catch(e){return}if(!j.data||!j.arg)return;var id=j.arg.instId,ins=INST.filter(function(x){return x.id===id})[0];if(!ins)return;
      var ct=ins.kind==='perp'?(WSS['ct:'+id]||0):1;j.data.forEach(function(tr){var px=f(tr.px),sz=f(tr.sz),usd=ins.kind==='perp'?sz*ct*px:sz*px;if(!(usd>0))return;var s=WSS[ins.symbol]=WSS[ins.symbol]||{buy:0,sell:0,n:0,since:Date.now(),last:px,bars:[]};
        if(tr.side==='buy')s.buy+=usd;else s.sell+=usd;s.n++;s.last=px;var k=Math.floor(+tr.ts/60000)*60;var b=s.bars[s.bars.length-1];if(!b||b.t!==k){b={t:k,buy:0,sell:0};s.bars.push(b);if(s.bars.length>120)s.bars.shift()}if(tr.side==='buy')b.buy+=usd;else b.sell+=usd});
      WSL.forEach(function(fn){try{fn(WSS)}catch(e){}})};
    WS.onclose=function(){clearInterval(WS&&WS._p);WS=null;setTimeout(open,4000)};WS.onerror=function(){try{WS.close()}catch(e){}}}
  Promise.all(INST.filter(function(x){return x.kind==='perp'}).map(function(x){return safe(ctVal(x.id)).then(function(v){WSS['ct:'+x.id]=v||0})})).then(open)}
/* ---- modal tiles ---- */
function fmtUsd(x){if(x==null||!isFinite(x))return '—';var a=Math.abs(x),s=x<0?'-':'';return s+'$'+(a>=1e9?(a/1e9).toFixed(2)+'B':a>=1e6?(a/1e6).toFixed(1)+'M':a>=1e3?(a/1e3).toFixed(1)+'K':a.toFixed(0))}
function sp(x,n){return x==null||!isFinite(x)?'—':(x>=0?'+':'')+x.toFixed(n==null?2:n)+'%'}
function px(x){return x==null||!isFinite(x)?'—':'$'+Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
var DV={},OP={};
function need(sym){var ins=BYS[sym];if(!ins)return Promise.resolve();return Promise.all([deriv(ins.a).then(function(v){DV[ins.a]=v}),A[ins.a].dbt?options(ins.a).then(function(v){OP[ins.a]=v},function(){}):Promise.resolve()])}
function tiles(sym,s,d){var ins=BYS[sym]||{},v=DV[ins.a]||{},o=OP[ins.a],m=o&&o.main,sup=(s&&s.levels||[]).filter(function(x){return x.kind==='s'}).map(function(x){return x.price}),res=(s&&s.levels||[]).filter(function(x){return x.kind==='r'}).map(function(x){return x.price});
  var L=[['Open interest · perp',fmtUsd(v.oiUsd)],['OI change · 24h',sp(v.oiChgPct)],['Funding · per '+(v.fundingHrs||8)+'h',v.funding!=null?sp(v.funding*100,4):'—'],['Funding · annualised',sp(v.fundingAnn,1)],
    ['Long/short · accounts',v.ls!=null?v.ls.toFixed(2):'—'],['Long/short · top traders',v.top!=null?v.top.toFixed(2):'—'],['Perp premium · vs index',sp(v.premium,3)],
    ['Futures basis · '+(v.fut?v.fut.exp:'quarterly'),v.fut?sp(v.fut.basisPct,2)+' ('+sp(v.fut.ann,1).replace('%','% ann.')+')':'—'],['Buildup · 24h',v.buildup||'—'],
    ['Taker buy share · 24h',v.takerBuy24+v.takerSell24>0?(v.takerBuy24/(v.takerBuy24+v.takerSell24)*100).toFixed(1)+'%':'—'],
    ['PCR · options OI',o&&o.pcr!=null?o.pcr.toFixed(2):'—'],['Max pain · '+(m?m.label:'options'),m&&m.maxPain?px(m.maxPain):'—'],['ATM IV · '+(m?m.label:'options'),m&&m.atmIv!=null?m.atmIv.toFixed(1)+'%':'—'],
    ['Support · profile',sup.length?sup.map(px).join(' / '):'—'],['Resistance · profile',res.length?res.map(px).join(' / '):'—']];
  if(!DV[ins.a])L.unshift(['Derivatives','loading…']);return L}
function notes(sym,s,d){var ins=BYS[sym]||{},v=DV[ins.a];
  return '<p>Order flow: '+(d&&d.ts||'—')+' IST · 24/7 market · the live candle and forming zones refresh about every 15 s while visible; the full card reloads every 60 s.</p>'+
   '<p>'+(ins.kind==='perp'&&d&&d.delta_src==='taker'?'Delta = real taker buy minus taker sell volume (USD) per 5-minute bar from OKX.':'Delta is estimated from candle shape (close location in the bar range); spot taker splits are not published per bar.')+' OI, funding, long/short and basis are for the '+(A[ins.a]?A[ins.a].swap:'')+' perpetual'+(v&&v.fut?' and '+v.fut.id+' futures ('+v.fut.src+')':'')+'. '+(A[ins.a]&&A[ins.a].dbt?'Options from Deribit public data.':'No listed gold options on free public crypto venues.')+'</p>'+
   '<p>Support/resistance are volume-profile nodes. Order blocks are algorithmic 5-minute zones confirmed on 1-minute closes (about a 3-minute wait after the block candle). A dashed “forming” zone is unconfirmed and never flips direction. After it fails, no new forming zone appears until two more 5-minute candles have closed, and never as an opposite zone on that candle or the next one; faded = retested. Educational only — not investment advice. No mock values.</p>'}
window.__cfno={A:A,INST:INST,file:file,deriv:deriv,derivCached:derivCached,quick:quick,options:options,liquidations:liquidations,history:history,candles:candles,minCandles:minCandles,liveBars:liveBars,live:live,need:need,tiles:tiles,notes:notes,
  tv:function(sym){return (BYS[sym]||{}).tv||'OKX:BTCUSDT.P'},fmtUsd:fmtUsd,sp:sp,px:px,ist:ist,istHM:istHM,hl:hlCtx};
})();
