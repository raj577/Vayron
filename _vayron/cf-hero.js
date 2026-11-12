/* Vayron · crypto-first showpiece hero. Everything here is real, public, free exchange data fetched straight from the
   visitor's browser (no Vayron worker requests): OKX, Coinbase, Bybit, Kraken and Binance public WebSockets, OKX public
   REST, alternative.me Fear & Greed, Coinbase reference FX. Nothing is simulated; when a feed fails it shows nothing.
   Canvas only, capped particle counts, pauses when hidden or off-screen, honours reduced motion. Educational only. */
(function(){'use strict';
var root=document.getElementById('cfh');if(!root||window.__cfh)return;window.__cfh=1;
var LAND='AAAAEz/P//8ABwAAAADAAAAAAAABKZAP//8AAAAA4AH4AAAAAAADwDQAP/8AAAAGAH/4AIAAgEAAfG/gH/4AAAAGHf//9/gAB///1Ds4H/gAAf4F6///////8/////w+H8BAB/0/////////AP////UcHwCAD3/////////+A////8BgDgAAPn////////74AeB//+B6AAAAPn///////4CAAIAf//h+AAACFP///////gOAAAAP//7/gAANH////////wMAAAAH////wAAD/////////wAAAAAD///04AAD/////////wAAAAAD///8AAAB//X3/////gAAAAAD///wAAAB6+Dv/////EAAAAAD///gAAAPhvbz////8IAAAAAB///AAAAPAp/z///+IIAAAAAB///AAAAA8Af/////EwAAAAAAf/+AAAAH8AP/////BAAAAAAAX/4AAAAP/uv/////gAAAAAAAP8EAAAAP///v////gAAAAAAAD4EAAAA///3z////AAAAAAAAB4AAAAA///3+H//+gAAAAAAAA4gAAAB///7/D+fgAAAAAAAAA9gYAAA///7+B8PQAAAAAAAAAHgAAAB///94B4HggAAAAAAAAA4AAAB////gAwHwwAAAAAAAAAAoAAA///+QAwFgAAAAAAAAAAF/AAAf///wAAEAIAAAAAAAAAB/gAAPv//wAICAAAAAAAAAAAB/8AAAD//gAAGGAAAAAAAAAAD/8AAAD//AAADOAAAAAAAAAAD//AAAD/+AAADOjAAAAAAAAAD//4AAD/8AAABAg8AAAAAAAAD//8AAB/8AAAAgAeAAAAAAAAD//8AAB/8AAAABoIAAAAAAAAB//4AAB/8AAAAAAAAAAAAAAAB//wAAB/8QAAAADAAAAAAAAAAf/wAAB/8wAAAAfkAAAAAAAAAP/wAAB/wwAAAAf+AAAAAAAAAP/wAAB/xgAAAD//AAAAAAAAAP/AAAA/xgAAAH//AAAAAAAAAP+AAAA/gAAAAH//gAAAAAAAAf8AAAAfgAAAAD//gAAAAAAAAf8AAAAfAAAAAD//gAAAAAAAAf4AAAAcAAAAADw/gAAAAAAAAfgAAAAAAAAAAAAPAAAAAAAAAfAAAAAAAAAAAAACACAAAAAAA8AAAAAAAAAAAAACAEAAAAAAAcAAAAAAAAAAAAAAAIAAAAAAA4AAAAAAAAAAAAAAAQAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAwgAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAACAAAAAAAGAABEAAAAAAAAAAAEAAAAAAR/8f////gAAAAAAAA+AAAF////5//////wAAABAf+/AAB////////////gAAP////wAAP///////////+AAT////+ADj/////////////g';
function $(id){return document.getElementById(id)}
var NOW=function(){return Date.now()};
var ASSETS=['BTC','ETH','GOLD'],NAME={BTC:'Bitcoin',ETH:'Ether',GOLD:'Gold'},COL={BTC:'#f7931a',ETH:'#9a8cff',GOLD:'#ffd166'},SYM={BTC:'₿',ETH:'Ξ',GOLD:'Au'};
var WHALE={BTC:1e5,ETH:5e4,GOLD:2.5e4};
/* ---------- motion preference ---------- */
var mq=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
function userMotion(){try{return localStorage.getItem('mp-motion')}catch(e){return null}}
function reduced(){var u=userMotion();if(u==='reduced')return true;if(u==='full')return false;return !!mq.matches}
var RM=reduced(),userPaused=false;try{userPaused=localStorage.getItem('cfh-paused')==='1'}catch(e){}
root.dataset.rm=RM?'1':'0';
/* ---------- format ---------- */
function usd(x){if(x==null||!isFinite(x))return '—';var a=Math.abs(x),s=x<0?'-':'';return s+'$'+(a>=1e9?(a/1e9).toFixed(2)+'B':a>=1e6?(a/1e6).toFixed(a>=1e8?0:1)+'M':a>=1e3?(a/1e3).toFixed(a>=1e5?0:1)+'K':a.toFixed(0))}
function px(x,d){if(x==null||!isFinite(x))return '—';return '$'+Number(x).toLocaleString('en-US',{minimumFractionDigits:d==null?2:d,maximumFractionDigits:d==null?2:d})}
function inr(x){if(x==null||!isFinite(x))return '—';return x>=1e7?'₹'+(x/1e7).toFixed(2)+' crore':x>=1e5?'₹'+(x/1e5).toFixed(2)+' lakh':'₹'+Math.round(x).toLocaleString('en-IN')}
function hm(ms){return new Date(ms+19800e3).toISOString().slice(11,19)}
function hhmm(ms){return new Date(ms+19800e3).toISOString().slice(11,16)}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
/* count-up tween (instant under reduced motion) */
function tween(el,to,fmt){if(!el)return;var from=el._v;el._v=to;if(RM||from==null||!isFinite(from)||!isFinite(to)||document.hidden){el.textContent=fmt(to);return}
  var t0=performance.now(),D=700;cancelAnimationFrame(el._r);(function st(t){var k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3);el.textContent=fmt(from+(to-from)*e);if(k<1)el._r=requestAnimationFrame(st)})(t0)}
/* ---------- localStorage snapshot: instant first paint on repeat visits ---------- */
var SK='cfh_snap_v1',SNAP={};try{SNAP=JSON.parse(localStorage.getItem(SK)||'{}')||{}}catch(e){SNAP={}}
function saveSnap(){try{localStorage.setItem(SK,JSON.stringify(SNAP))}catch(e){}}
function lsc(k,ttl,fn){try{var e=JSON.parse(localStorage.getItem(k)||'null');if(e&&e.t>NOW()-ttl*1000)return Promise.resolve(e.v)}catch(_){}
  return fn().then(function(v){try{localStorage.setItem(k,JSON.stringify({t:NOW(),v:v}))}catch(_){}return v})}
function getj(u){return fetch(u,{credentials:'omit',cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})}
/* ---------- state ---------- */
var T={BTC:[],ETH:[],GOLD:[]};                 // [ms, usd, side(+1 buy / -1 sell), src]
var PXS={},FUND={},VENUE={},LQ=[],LQK={},liqCover=null,book={a:'BTC'},FNG=null,FX=null;
var SRC={okx:{n:'OKX'},cb:{n:'Coinbase'},by:{n:'Bybit'},kr:{n:'Kraken'},bn:{n:'Binance (liquidations)'}};
Object.keys(SRC).forEach(function(k){SRC[k].st='wait';SRC[k].m=0});
/* ---------- river canvas ---------- */
var stage=$('cfh-stage'),cv=$('cfh-river'),cx=cv.getContext('2d'),W=0,H=0,DPR=1,LY=[.17,.5,.83];
var P=[],BURST=[],FLOAT=[],ORB={BTC:{e:0},ETH:{e:0},GOLD:{e:0}},ACC={},MIN={},EMIT={},onScreen=true,q=1,running=false,lastT=0,ftAvg=16;
ASSETS.forEach(function(a){ACC[a+1]=0;ACC[a+-1]=0;MIN[a]=a==='GOLD'?300:2000;EMIT[a]=0});
function size(){var r=cv.getBoundingClientRect();DPR=Math.min(2,window.devicePixelRatio||1);W=Math.max(1,r.width);H=Math.max(1,r.height);cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);cx.setTransform(DPR,0,0,DPR,0,0);cx.fillStyle='#05090f';cx.fillRect(0,0,W,H)}
function rad(u){return Math.max(1.3,Math.min(15,1.2+2.3*Math.log10(Math.max(1,u)/1000+1)*1.6))}
function cap(){return (W<640?220:520)*q}
function emit(a,side,u,big){if(RM||userPaused||document.hidden||!onScreen)return;if(P.length>=cap())return;var i=ASSETS.indexOf(a);
  P.push({a:a,i:i,s:side,u:u,r:rad(u),k:0,d:(W<640?1.5:2.1)*(0.85+Math.random()*.3)*(big?1.25:1),off:(Math.random()-.5)*(H/3)*.62,ph:Math.random()*6.28,amp:3+Math.random()*7,big:big});EMIT[a]++}
function onTradeViz(a,side,u){var big=u>=WHALE[a];if(big){emit(a,side,u,true);ORB[a].e=Math.min(1,ORB[a].e+.5);return}
  var k=a+side;ACC[k]+=u;if(ACC[k]>=MIN[a]){emit(a,side,ACC[k],false);ACC[k]=0;ORB[a].e=Math.min(1,ORB[a].e+.04)}}
setInterval(function(){ASSETS.forEach(function(a){var n=EMIT[a];EMIT[a]=0;if(n>(W<640?14:26))MIN[a]*=1.5;else if(n<6&&MIN[a]>200)MIN[a]/=1.3})},1000);
function burst(a,u,isLong,src){if(RM||userPaused||document.hidden)return;var i=ASSETS.indexOf(a),n=Math.round(10+Math.min(30,Math.log10(u+10)*5)),x=W/2,y=H*LY[i];
  BURST.push({x:x,y:y,k:0,R:30+Math.min(110,Math.log10(u+10)*16)});
  for(var j=0;j<n&&P.length<cap()+80;j++){var ang=Math.random()*6.283,sp=60+Math.random()*160;P.push({spark:1,x:x,y:y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,l:0.9+Math.random()*.6,k:0,r:1.2+Math.random()*2.2})}
  FLOAT.push({x:x,y:y-26,k:0,t:usd(u)+' '+(isLong?'rise':'fall')+'-bet wiped out'});ORB[a].e=1}
function orbX(){return W/2}
function frame(t){if(!running)return;var dt=Math.min(.05,(t-(lastT||t))/1000);lastT=t;ftAvg=ftAvg*.95+dt*1000*.05;
  if(ftAvg>24&&q>.45)q-=.01;else if(ftAvg<17&&q<1)q+=.005;
  var c=cx,ox=orbX();c.globalCompositeOperation='source-over';c.fillStyle='rgba(5,9,15,0.30)';c.fillRect(0,0,W,H);
  for(var i=0;i<3;i++){var y=H*LY[i],g=c.createLinearGradient(0,0,W,0);g.addColorStop(0,'rgba(53,231,160,0)');g.addColorStop(.45,'rgba(53,231,160,.10)');g.addColorStop(.55,'rgba(255,89,125,.10)');g.addColorStop(1,'rgba(255,89,125,0)');c.fillStyle=g;c.fillRect(0,y-1,W,2)}
  c.globalCompositeOperation='lighter';
  for(var k=P.length-1;k>=0;k--){var p=P[k];
    if(p.spark){p.k+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;var al=1-p.k/p.l;if(al<=0){P.splice(k,1);continue}c.fillStyle='rgba(255,176,32,'+al.toFixed(3)+')';c.beginPath();c.arc(p.x,p.y,p.r,0,6.283);c.fill();continue}
    p.k+=dt/p.d;if(p.k>=1){if(p.s>0)ORB[p.a].e=Math.min(1,ORB[p.a].e+.02);P.splice(k,1);continue}
    var e=p.k,ly=H*LY[p.i],x,y2,conv;
    if(p.s>0){x=-12+(ox-12)*e;conv=1-e*e}else{x=ox+(W-ox+12)*e;conv=e*(2-e)}
    y2=ly+p.off*conv+Math.sin(p.ph+e*7)*p.amp*conv;
    var col=p.s>0?'53,231,160':'255,89,125',a2=p.s>0?Math.min(1,.35+e):Math.max(.15,1-e*.8);
    if(p.big&&q>.6){c.fillStyle='rgba('+col+','+(a2*.18).toFixed(3)+')';c.beginPath();c.arc(x,y2,p.r*2.6,0,6.283);c.fill()}
    c.fillStyle='rgba('+col+','+a2.toFixed(3)+')';c.beginPath();c.arc(x,y2,p.r,0,6.283);c.fill()}
  for(var b=BURST.length-1;b>=0;b--){var B=BURST[b];B.k+=dt/1.1;if(B.k>=1){BURST.splice(b,1);continue}c.strokeStyle='rgba(255,176,32,'+(1-B.k).toFixed(3)+')';c.lineWidth=3*(1-B.k)+.5;c.beginPath();c.arc(B.x,B.y,B.R*B.k+14,0,6.283);c.stroke()}
  c.globalCompositeOperation='source-over';
  for(var i2=0;i2<3;i2++){var a=ASSETS[i2],o=ORB[a],y3=H*LY[i2],R=(W<640?13:17)+o.e*8,gr=c.createRadialGradient(ox,y3,2,ox,y3,R*2.4);o.e*=Math.pow(.25,dt);
    gr.addColorStop(0,COL[a]);gr.addColorStop(.38,COL[a]+'aa');gr.addColorStop(1,COL[a]+'00');c.fillStyle=gr;c.beginPath();c.arc(ox,y3,R*2.4,0,6.283);c.fill();
    c.fillStyle='#05090f';c.beginPath();c.arc(ox,y3,R*.72,0,6.283);c.fill();c.fillStyle='#fff';c.font='700 '+(W<640?11:13)+'px ui-monospace,monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(SYM[a],ox,y3+.5)}
  for(var f=FLOAT.length-1;f>=0;f--){var F=FLOAT[f];F.k+=dt/2.6;if(F.k>=1){FLOAT.splice(f,1);continue}c.globalAlpha=1-F.k;c.fillStyle='#ffcf70';c.font='600 12px system-ui,sans-serif';c.textAlign='center';c.fillText(F.t,F.x,F.y-F.k*30);c.globalAlpha=1}
  requestAnimationFrame(frame)}
/* still picture for reduced motion / paused: in vs out bars per lane from the last minute of real trades */
function still(){if(!W)size();var c=cx,ox=orbX();c.globalCompositeOperation='source-over';c.fillStyle='#05090f';c.fillRect(0,0,W,H);var S=stats(),mx=1;
  ASSETS.forEach(function(a){mx=Math.max(mx,S[a].in,S[a].out)});
  ASSETS.forEach(function(a,i){var y=H*LY[i],li=(ox-30)*S[a].in/mx,lo=(W-ox-30)*S[a].out/mx;c.fillStyle='rgba(53,231,160,.55)';c.fillRect(ox-20-li,y-5,li,10);c.fillStyle='rgba(255,89,125,.55)';c.fillRect(ox+20,y-5,lo,10);
    c.fillStyle=COL[a];c.beginPath();c.arc(ox,y,15,0,6.283);c.fill();c.fillStyle='#05090f';c.font='700 12px ui-monospace,monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(SYM[a],ox,y+.5)})}
function start(){if(running||RM||userPaused||document.hidden||!onScreen)return;running=true;lastT=0;requestAnimationFrame(frame)}
function stop(){running=false}
function syncMotion(){var b=$('cfh-motion');if(b){b.textContent=RM?'Motion off (system setting)':userPaused?'Play motion':'Pause motion';b.disabled=RM}if(RM||userPaused){stop();P.length=0;BURST.length=0;FLOAT.length=0;still()}else start()}
$('cfh-motion').addEventListener('click',function(){userPaused=!userPaused;try{localStorage.setItem('cfh-paused',userPaused?'1':'0')}catch(e){}syncMotion()});
if(mq.addEventListener)mq.addEventListener('change',function(){RM=reduced();root.dataset.rm=RM?'1':'0';syncMotion()});
if('IntersectionObserver' in window)new IntersectionObserver(function(es){onScreen=es[0].isIntersecting;if(onScreen)start();else stop()}).observe(stage);
var rzT;window.addEventListener('resize',function(){clearTimeout(rzT);rzT=setTimeout(function(){size();drawMap();drawBook(1);if(RM||userPaused)still()},150)});
/* ---------- rolling stats ---------- */
function prune(){var lim=NOW()-300e3;ASSETS.forEach(function(a){var L=T[a],i=0;while(i<L.length&&L[i][0]<lim)i++;if(i)L.splice(0,i)})}
function stats(){var t=NOW()-60e3,o={all:0,big:null};ASSETS.forEach(function(a){var s={in:0,out:0,n:0};T[a].forEach(function(x){if(x[2]>0||x[0]>=0){}if(x[0]>=t){if(x[2]>0)s.in+=x[1];else s.out+=x[1];s.n++}if(!o.big||x[1]>o.big[1])o.big=[x[0],x[1],x[2],x[3],a]});o[a]=s;o.all+=s.in+s.out});return o}
/* ---------- trades + liquidations from all feeds ---------- */
var firstData=false;
function trade(a,side,u,p,src,ts){if(!(u>0))return;T[a].push([ts||NOW(),u,side,src]);if(a==='BTC'&&p)VENUE[src]={p:p,t:NOW()};onTradeViz(a,side,u);
  if(!firstData){firstData=true;cv.setAttribute('data-ready','1')}
  if(u>=WHALE[a])whale(a,side,u,p,src,ts||NOW())}
var WL=$('cfh-whales');
function whale(a,side,u,p,src,ts){var li=document.createElement('li');li.innerHTML='<span class="t">'+hm(ts)+'</span><span class="v '+(side>0?'cfh-up':'cfh-dn')+'">'+usd(u)+'</span><span class="w">'+NAME[a]+' '+(side>0?'bought':'sold')+' on '+SRC[src].n+' at '+px(p,a==='ETH'||a==='GOLD'?2:0)+'</span>';
  var e=WL.querySelector('.e');if(e)e.remove();WL.insertBefore(li,WL.firstChild);while(WL.children.length>8)WL.removeChild(WL.lastChild);
  if(u>=WHALE[a]*5)toast('🐋 '+usd(u)+' of '+NAME[a]+' just '+(side>0?'bought':'sold')+' in one trade · '+SRC[src].n,'whale')}
var LL=$('cfh-liqs');
function liq(a,isLong,u,p,src,ts,live){if(!(u>0))return;var key=src+a+ts+Math.round(u);if(LQK[key])return;LQK[key]=1;LQ.push({a:a,l:isLong,u:u,p:p,s:src,t:ts});
  if(live){burst(a,u,isLong,src);if(u>=2e4)toast('💥 '+usd(u)+' bet that '+NAME[a]+' would '+(isLong?'rise':'fall')+' just got wiped out · '+SRC[src].n,'')}
  liqList()}
function liqList(){var L=LQ.filter(function(x){return x.u>=500}).sort(function(x,y){return y.t-x.t}).slice(0,8);if(!L.length)return;LL.innerHTML=L.map(LI).join('')}
function LI(x){return '<li><span class="t">'+hm(x.t)+'</span><span class="v '+(x.l?'cfh-dn':'cfh-up')+'">'+usd(x.u)+'</span><span class="w">'+NAME[x.a]+' '+(x.l?'rise':'fall')+'-bet wiped out · '+SRC[x.s].n+'</span></li>'}
var toT,toEl=$('cfh-toast');
function toast(msg,cls){if(document.hidden)return;toEl.className='cfh-toast '+(cls||'');toEl.textContent=msg;void toEl.offsetWidth;toEl.classList.add('on');clearTimeout(toT);toT=setTimeout(function(){toEl.classList.remove('on')},4200)}
/* ---------- WebSockets ---------- */
var SOCK={},hiddenAt=0;
function sock(k,url,subs,onmsg,ping){var s=SOCK[k]||(SOCK[k]={k:k,tries:0});s.url=url;s.subs=subs;s.onmsg=onmsg;s.ping=ping;open(s)}
function open(s){if(s.ws||s.off)return;var ws;try{ws=new WebSocket(s.url)}catch(e){SRC[s.k].st='bad';chips();return}s.ws=ws;
  ws.onopen=function(){s.tries=0;if(SRC[s.k].st!=='ok'){SRC[s.k].st='wait';chips()}(s.subs||[]).forEach(function(m){ws.send(typeof m==='string'?m:JSON.stringify(m))});if(s.ping)s.pi=setInterval(function(){try{ws.send(s.ping)}catch(e){}},20000)};
  ws.onmessage=function(ev){var d=ev.data;if(d==='pong')return;var m;try{m=JSON.parse(d)}catch(e){return}SRC[s.k].m++;if(SRC[s.k].st!=='ok'){SRC[s.k].st='ok';chips()}try{s.onmsg(m)}catch(e){}};
  ws.onerror=function(){try{ws.close()}catch(e){}};
  ws.onclose=function(){clearInterval(s.pi);s.ws=null;if(s.off)return;s.tries++;SRC[s.k].st=s.tries>2?'bad':'wait';chips();setTimeout(function(){open(s)},Math.min(30000,1500*Math.pow(2,s.tries)))}}
function closeAll(){Object.keys(SOCK).forEach(function(k){var s=SOCK[k];s.off=true;if(s.ws)try{s.ws.close()}catch(e){}})}
function reopenAll(){Object.keys(SOCK).forEach(function(k){var s=SOCK[k];s.off=false;s.tries=0;open(s)})}
var CT={'BTC-USDT-SWAP':.01,'ETH-USDT-SWAP':.1,'XAU-USDT-SWAP':.001},OKA={'BTC-USDT-SWAP':'BTC','ETH-USDT-SWAP':'ETH','XAU-USDT-SWAP':'GOLD','BTC-USDT':'BTC','ETH-USDT':'ETH','XAUT-USDT':'GOLD','PAXG-USDT':'GOLD'};
function feeds(){
  var okArgs=[];Object.keys(OKA).forEach(function(id){okArgs.push({channel:'trades',instId:id})});
  ['BTC-USDT-SWAP','ETH-USDT-SWAP','XAU-USDT-SWAP'].forEach(function(id){okArgs.push({channel:'tickers',instId:id});okArgs.push({channel:'funding-rate',instId:id})});
  okArgs.push({channel:'liquidation-orders',instType:'SWAP'});
  sock('okx','wss://ws.okx.com/ws/v5/public',[{op:'subscribe',args:okArgs}],function(m){if(!m.arg||!m.data)return;var ch=m.arg.channel;
    m.data.forEach(function(d){var id=d.instId||m.arg.instId,a=OKA[id];
      if(ch==='trades'&&a){var p=+d.px,u=+d.sz*(CT[id]||1)*p;trade(a,d.side==='buy'?1:-1,u,id.indexOf('SWAP')>0||a!=='BTC'?(a==='BTC'?p:p):p,'okx',+d.ts)}
      else if(ch==='tickers'&&a){PXS[a]={last:+d.last,open:+d.open24h,t:NOW()}}
      else if(ch==='funding-rate'&&a){FUND[a]={r:+d.fundingRate,ft:+d.fundingTime,nt:+d.nextFundingTime||0};drawFund()}
      else if(ch==='liquidation-orders'&&a&&CT[id]){(d.details||[]).forEach(function(x){var p=+x.bkPx,isL=x.posSide==='long'||(x.posSide==='net'&&x.side==='sell');liq(a,isL,+x.sz*CT[id]*p,p,'okx',+x.ts,true)})}})},'ping');
  sock('cb','wss://ws-feed.exchange.coinbase.com',[{type:'subscribe',product_ids:['BTC-USD','ETH-USD','PAXG-USD'],channels:['matches']}],function(m){if(m.type!=='match')return;var a=m.product_id==='BTC-USD'?'BTC':m.product_id==='ETH-USD'?'ETH':'GOLD',p=+m.price;
    trade(a,m.side==='buy'?-1:1,+m.size*p,p,'cb',Date.parse(m.time)||NOW())});   // Coinbase "side" is the maker side; the taker did the opposite
  sock('by','wss://stream.bybit.com/v5/public/linear',[{op:'subscribe',args:['publicTrade.BTCUSDT','publicTrade.ETHUSDT','allLiquidation.BTCUSDT','allLiquidation.ETHUSDT']}],function(m){if(!m.topic||!m.data)return;var a=/BTC/.test(m.topic)?'BTC':'ETH';
    if(m.topic.indexOf('publicTrade')===0)m.data.forEach(function(d){var p=+d.p;trade(a,d.S==='Buy'?1:-1,+d.v*p,p,'by',+d.T)});
    else m.data.forEach(function(d){var p=+d.p;liq(a,d.S==='Buy',+d.v*p,p,'by',+d.T,true)})},JSON.stringify({op:'ping'}));   // Bybit: S=Buy means a long position was liquidated
  sock('kr','wss://ws.kraken.com/v2',[{method:'subscribe',params:{channel:'trade',symbol:['BTC/USD','ETH/USD','PAXG/USD'],snapshot:false}}],function(m){if(m.channel!=='trade'||!m.data)return;
    m.data.forEach(function(d){var a=d.symbol==='BTC/USD'?'BTC':d.symbol==='ETH/USD'?'ETH':'GOLD',p=+d.price;trade(a,d.side==='buy'?1:-1,+d.qty*p,p,'kr',Date.parse(d.timestamp)||NOW())})},JSON.stringify({method:'ping'}));
  sock('bn','wss://fstream.binance.com/ws/!forceOrder@arr',[],function(m){var o=m.o;if(!o)return;var a=o.s==='BTCUSDT'?'BTC':o.s==='ETHUSDT'?'ETH':null;if(!a)return;var p=+o.ap||+o.p;liq(a,o.S==='SELL',+o.q*p,p,'bn',+o.T,true)},null)}
function chips(){var el=$('cfh-chips');if(!el)return;el.innerHTML='<span>Live feeds:</span>'+Object.keys(SRC).map(function(k){var s=SRC[k];return '<span class="cfh-chip '+s.st+'" title="'+(s.st==='ok'?'receiving data':s.st==='bad'?'not reachable from this network right now':'connecting or quiet')+'"><i></i>'+esc(s.n)+'</span>'}).join('')}
/* ---------- REST seeds (direct to public APIs, never through Vayron) ---------- */
function seeds(){
  var ul={BTC:'BTC-USDT',ETH:'ETH-USDT',GOLD:'XAU-USDT'},sw={BTC:'BTC-USDT-SWAP',ETH:'ETH-USDT-SWAP',GOLD:'XAU-USDT-SWAP'},cov=[];
  Promise.all(ASSETS.map(function(a){return getj('https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly='+ul[a]+'&state=filled&limit=100').then(function(j){var n=0,old=Infinity;
    (j.data||[]).forEach(function(g){if(g.instId&&g.instId!==sw[a])return;(g.details||[]).forEach(function(x){var p=+x.bkPx,isL=x.posSide==='long'||(x.posSide==='net'&&x.side==='sell');n++;old=Math.min(old,+x.ts);liq(a,isL,+x.sz*CT[sw[a]]*p,p,'okx',+x.ts,false)})});
    if(n>=100)cov.push(old)},function(){})})).then(function(){liqCover=cov.length?Math.max.apply(null,cov):null;tick()});
  lsc('cfh_fng1',3600,function(){return getj('https://api.alternative.me/fng/?limit=31').then(function(j){return (j.data||[]).map(function(x){return[+x.value,x.value_classification,+x.timestamp]})})}).then(function(v){FNG=v;drawFng()},function(){$('cfh-fng-s').textContent='The Fear & Greed feed did not respond. It retries on your next visit.'});
  lsc('cfh_fx1',1800,function(){return getj('https://api.coinbase.com/v2/exchange-rates?currency=USD').then(function(j){var r=j.data.rates;return{INR:+r.INR,EUR:+r.EUR,AED:+r.AED,GBP:+r.GBP}})}).then(function(v){FX=v;tick()},function(){})}
/* ---------- order book wall ---------- */
var bc=$('cfh-book'),bx=bc.getContext('2d'),BK={},bookT=0,bookVis=false,bAnim=null;
var BW={BTC:.005,ETH:.01,GOLD:.01},BSW={BTC:'BTC-USDT-SWAP',ETH:'ETH-USDT-SWAP',GOLD:'XAU-USDT-SWAP'};
function loadBook(){var a=book.a;if(document.hidden||!bookVis)return;getj('https://www.okx.com/api/v5/market/books-full?instId='+BSW[a]+'&sz=5000').then(function(j){var d=j.data[0],ct=CT[BSW[a]];
  var bids=d.bids.map(function(x){return[+x[0],+x[1]*ct*+x[0]]}),asks=d.asks.map(function(x){return[+x[0],+x[1]*ct*+x[0]]}),mid=(bids[0][0]+asks[0][0])/2,w=BW[a],N=48,bb=new Array(N).fill(0),ab=new Array(N).fill(0),wb=null,wa=null;
  bids.forEach(function(x){var r=(mid-x[0])/mid;if(r<0||r>w)return;var i=Math.min(N-1,Math.floor(r/w*N));bb[i]+=x[1];if(!wb||x[1]>wb[1])wb=x});
  asks.forEach(function(x){var r=(x[0]-mid)/mid;if(r<0||r>w)return;var i=Math.min(N-1,Math.floor(r/w*N));ab[i]+=x[1];if(!wa||x[1]>wa[1])wa=x});
  for(var i=1;i<N;i++){bb[i]+=bb[i-1];ab[i]+=ab[i-1]}
  var prev=BK[a];BK[a]={a:a,mid:mid,w:w,bb:bb,ab:ab,wb:wb,wa:wa,t:NOW(),from:prev&&prev.bb.length===N?{bb:prev.cbb||prev.bb,ab:prev.cab||prev.ab}:null};
  $('cfh-book-s').innerHTML='<b class="cfh-up">'+usd(bb[N-1])+'</b> of '+NAME[a]+' buy orders wait within '+(w*100)+'% below the price, and <b class="cfh-dn">'+usd(ab[N-1])+'</b> of sell orders within '+(w*100)+'% above. Biggest buy wall: <b>'+usd(wb&&wb[1])+'</b> at '+px(wb&&wb[0],a==='BTC'?0:2)+'.';
  drawBook()},function(){$('cfh-book-s').textContent='The OKX order book did not respond from your browser. Retrying in 30 s.'})}
function drawBook(now){var B=BK[book.a];var r=bc.getBoundingClientRect(),w=r.width,h=150,dp=Math.min(2,devicePixelRatio||1);if(!w)return;if(bc.width!==Math.round(w*dp)){bc.width=Math.round(w*dp);bc.height=h*dp}bx.setTransform(dp,0,0,dp,0,0);
  if(!B){bx.clearRect(0,0,w,h);return}var t0=performance.now(),D=RM||now?0:800;cancelAnimationFrame(bAnim);
  (function st(t){var k=D?Math.min(1,(t-t0)/D):1,e=1-Math.pow(1-k,3),N=B.bb.length,bb=[],ab=[];for(var i=0;i<N;i++){bb[i]=B.from?B.from.bb[i]+(B.bb[i]-B.from.bb[i])*e:B.bb[i]*e;ab[i]=B.from?B.from.ab[i]+(B.ab[i]-B.from.ab[i])*e:B.ab[i]*e}B.cbb=bb;B.cab=ab;
    var mx=Math.max(B.bb[N-1],B.ab[N-1])||1,mid=w/2,c=bx;c.clearRect(0,0,w,h);
    function side(arr,dir,fill,line){c.beginPath();c.moveTo(mid,h-14);for(var i=0;i<N;i++){c.lineTo(mid+dir*(i+1)/N*(mid-4),h-14-(arr[i]/mx)*(h-34))}c.lineTo(mid+dir*(mid-4),h-14);c.closePath();var g=c.createLinearGradient(0,10,0,h);g.addColorStop(0,fill);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fill();c.strokeStyle=line;c.lineWidth=1.5;c.stroke()}
    side(bb,-1,'rgba(53,231,160,.55)','#35e7a0');side(ab,1,'rgba(255,89,125,.5)','#ff597d');
    c.strokeStyle='#ffffff55';c.setLineDash([3,3]);c.beginPath();c.moveTo(mid,8);c.lineTo(mid,h-14);c.stroke();c.setLineDash([]);
    c.fillStyle='#8ea3ad';c.font='10px ui-monospace,monospace';c.textAlign='left';c.fillText('-'+(B.w*100)+'%',2,h-2);c.textAlign='right';c.fillText('+'+(B.w*100)+'%',w-2,h-2);c.textAlign='center';c.fillStyle='#fff';c.fillText(px(B.mid,B.a==='BTC'?0:2),mid,h-2);
    function wall(x,col){if(!x)return;var r=Math.abs(x[0]-B.mid)/B.mid/B.w,xx=mid+(x[0]<B.mid?-1:1)*r*(mid-4);c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.moveTo(xx,h-14);c.lineTo(xx,20);c.stroke();c.fillStyle=col;c.textAlign=x[0]<B.mid?'left':'right';c.fillText('wall '+usd(x[1]),xx+(x[0]<B.mid?3:-3),18)}
    wall(B.wb,'#7ff0c2');wall(B.wa,'#ff9db2');
    if(k<1)bAnim=requestAnimationFrame(st)})(t0)}
$('cfh-book-seg').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;book.a=b.dataset.a;[].forEach.call(this.children,function(x){x.classList.toggle('on',x===b)});drawBook(1);loadBook()});
if('IntersectionObserver' in window)new IntersectionObserver(function(es){bookVis=es[0].isIntersecting;if(bookVis&&(!BK[book.a]||NOW()-BK[book.a].t>30e3))loadBook()},{rootMargin:'200px'}).observe($('cfh-c-book'));else bookVis=true;
setInterval(function(){if(bookVis&&!document.hidden)loadBook()},30000);
/* ---------- fear & greed ---------- */
function drawFng(){if(!FNG||!FNG.length)return;var v=FNG[0][0],cl=FNG[0][1],y=FNG[1],wk=FNG[7],mo=FNG[30];
  $('cfh-needle').style.transform='rotate('+(-90+v*1.8)+'deg)';tween($('cfh-fng-v'),v,function(x){return Math.round(x)});
  $('cfh-fng-s').innerHTML='Today the crypto crowd feels <b>'+esc(cl)+'</b> ('+v+'/100).'+(y?' Yesterday '+y[0]+'.':'')+(wk?' A week ago '+wk[0]+'.':'')+(mo?' A month ago '+mo[0]+'.':'');
  var c=$('cfh-fng-spark'),r=c.getBoundingClientRect(),w=r.width,h=34,dp=Math.min(2,devicePixelRatio||1);if(!w)return;c.width=w*dp;c.height=h*dp;var g=c.getContext('2d');g.setTransform(dp,0,0,dp,0,0);var L=FNG.slice().reverse();
  g.strokeStyle='#ffd166';g.lineWidth=1.5;g.beginPath();L.forEach(function(x,i){var X=i/(L.length-1)*(w-4)+2,Y=h-3-(x[0]/100)*(h-6);i?g.lineTo(X,Y):g.moveTo(X,Y)});g.stroke();g.fillStyle='#8ea3ad';g.font='9px ui-monospace,monospace';g.fillText('30 days',2,9)}
/* ---------- funding thermometers ---------- */
function drawFund(){var el=$('cfh-fund');el.innerHTML=ASSETS.map(function(a){var f=FUND[a];if(!f)return '<div class="cfh-th"><div class="cfh-tube"></div><b>'+NAME[a]+'</b><span class="cfh-mu">waiting…</span></div>';
  var hrs=f.nt&&f.ft?(f.nt-f.ft)/3600e3:8;if(!(hrs>0&&hrs<=24))hrs=8;var r=f.r,pct=Math.min(1,Math.abs(r)/0.0003)*50,pos=r>=0,ann=r*(24/hrs)*365*100;
  return '<div class="cfh-th"><div class="cfh-tube"><div class="cfh-merc" style="'+(pos?'bottom:50%;height:'+pct.toFixed(1)+'%;background:linear-gradient(0deg,#ffb020,#ff597d)':'top:50%;height:'+pct.toFixed(1)+'%;background:linear-gradient(180deg,#38bdf8,#35e7a0)')+'"></div></div><b class="'+(pos?'cfh-dn':'cfh-up')+'">'+(r*100).toFixed(4)+'%</b><span><b style="color:#fff">'+NAME[a]+'</b><br>'+(pos?'Buyers pay sellers':'Sellers pay buyers')+' every '+hrs.toFixed(0)+'h<br><span class="cfh-mu">≈'+Math.abs(ann).toFixed(1)+'% a year</span></span></div>'}).join('')}
/* ---------- world map + market hours ---------- */
var MK=[['Mumbai NSE','Asia/Kolkata',19.08,72.88,[[555,930]]],['New York NYSE','America/New_York',40.71,-74.01,[[570,960]]],['London LSE','Europe/London',51.51,-.09,[[480,990]]],['Frankfurt','Europe/Berlin',50.11,8.68,[[540,1050]]],
  ['Tokyo','Asia/Tokyo',35.68,139.77,[[540,690],[750,930]]],['Hong Kong','Asia/Hong_Kong',22.28,114.16,[[570,720],[780,960]]],['Shanghai','Asia/Shanghai',31.23,121.47,[[570,690],[780,900]]],['Sydney','Australia/Sydney',-33.87,151.21,[[600,960]]],
  ['Dubai','Asia/Dubai',25.2,55.27,[[600,900]]],['São Paulo','America/Sao_Paulo',-23.55,-46.63,[[600,1020]]],['Toronto','America/Toronto',43.65,-79.38,[[570,960]]],['COMEX gold','America/New_York',41.2,-72.5,'comex']];
var FMT={};function lp(tz){var f=FMT[tz]||(FMT[tz]=new Intl.DateTimeFormat('en-GB',{timeZone:tz,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));var o={};f.formatToParts(new Date()).forEach(function(p){o[p.type]=p.value});return{wd:o.weekday,m:(+o.hour%24)*60+ +o.minute,s:o.hour+':'+o.minute}}
function isOpen(m){var l=lp(m[1]),wd=l.wd;if(m[4]==='comex'){if(wd==='Sat')return false;if(wd==='Sun')return l.m>=1080;if(wd==='Fri')return l.m<1020;return l.m<1020||l.m>=1080}
  if(wd==='Sat'||wd==='Sun')return false;return m[4].some(function(r){return l.m>=r[0]&&l.m<r[1]})}
var LB=null;function land(){if(LB)return LB;var s=atob(LAND),b=new Uint8Array(144*64);for(var i=0;i<b.length;i++)b[i]=(s.charCodeAt(i>>3)>>(7-(i&7)))&1;return LB=b}
function sun(){var d=NOW()/864e5-10957.5,r=Math.PI/180,g=(357.529+.98560028*d)*r,qq=280.459+.98564736*d,L=(qq+1.915*Math.sin(g)+.02*Math.sin(2*g))*r,e=(23.439-3.6e-7*d)*r,dec=Math.asin(Math.sin(e)*Math.sin(L)),ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L))/r,gm=(18.697374558+24.06570982441908*d)%24*15,lon=((ra-gm)%360+540)%360-180;return{dec:dec,lon:lon}}
var mc=$('cfh-map'),mx2=mc.getContext('2d'),mapVis=false,mapRun=false,mapPh=0;
function drawMap(ph){var r=mc.getBoundingClientRect(),w=r.width,dp=Math.min(2,devicePixelRatio||1);if(!w)return;var h=Math.round(w*64/144);if(mc.height!==Math.round(h*dp)||mc.width!==Math.round(w*dp)){mc.width=Math.round(w*dp);mc.height=Math.round(h*dp);mc.style.height=h+'px'}
  var c=mx2;c.setTransform(dp,0,0,dp,0,0);c.clearRect(0,0,w,h);var b=land(),S=sun(),rd=Math.PI/180,cw=w/144,ch=h/64,rr=Math.max(.8,Math.min(cw,ch)*.36);
  for(var j=0;j<64;j++){var lat=(80-(j+.5)*2.5)*rd,sl=Math.sin(lat),cl=Math.cos(lat);for(var i=0;i<144;i++){if(!b[j*144+i])continue;var lon=-180+(i+.5)*2.5,cz=sl*Math.sin(S.dec)+cl*Math.cos(S.dec)*Math.cos((lon-S.lon)*rd),day=Math.max(0,Math.min(1,(cz+.08)/.16));
    c.fillStyle='rgba('+Math.round(70+90*day)+','+Math.round(100+130*day)+','+Math.round(150+50*day)+','+(0.5+.45*day).toFixed(2)+')';c.fillRect(i*cw+cw/2-rr,j*ch+ch/2-rr,rr*2,rr*2)}}
  MK.forEach(function(m){var x=(m[3]+180)/360*w,y=(80-m[2])/160*h,o=isOpen(m);if(o){var k=(((ph||0)+m[3]/90)%1+1)%1;c.strokeStyle='rgba(53,231,160,'+(1-k).toFixed(2)+')';c.lineWidth=1.5;c.beginPath();c.arc(x,y,3+k*10,0,6.283);c.stroke()}
    c.fillStyle=o?'#35e7a0':'#ff597d99';c.beginPath();c.arc(x,y,o?3:2.2,0,6.283);c.fill()})}
function mapLoop(t){if(!mapRun)return;mapPh=(t/2400)%1;drawMap(mapPh);setTimeout(function(){requestAnimationFrame(mapLoop)},50)}
function mapState(){var want=mapVis&&!document.hidden&&!RM&&!userPaused;if(want&&!mapRun){mapRun=true;requestAnimationFrame(mapLoop)}else if(!want){mapRun=false;drawMap(0)}}
if('IntersectionObserver' in window)new IntersectionObserver(function(es){mapVis=es[0].isIntersecting;mapState()}).observe(mc);
function mkts(){var open=[],closed=[];MK.forEach(function(m){(isOpen(m)?open:closed).push(m)});
  $('cfh-mkts').innerHTML=MK.map(function(m){var o=isOpen(m),l=lp(m[1]);return '<span title="local time '+l.s+'"><i style="background:'+(o?'#35e7a0':'#ff597d99')+'"></i>'+esc(m[0])+' <span class="cfh-mu">'+l.s+'</span></span>'}).join('')+'<span><i style="background:#f7931a"></i>Crypto · always open</span>';return open}
/* ---------- 1 Hz tick: numbers, lanes, captions, snapshot ---------- */
var lanes={};[].forEach.call(root.querySelectorAll('.cfh-lane'),function(el){lanes[el.dataset.a]=el});
function laneTxt(a,s){var el=lanes[a],p=PXS[a];if(!el)return;if(p&&p.last){el.querySelector('.px').textContent=px(p.last,a==='BTC'?0:2);var ch=p.open?(p.last/p.open-1)*100:null;var c=el.querySelector('.ch');c.textContent=ch==null?'':(ch>=0?'▲':'▼')+Math.abs(ch).toFixed(2)+'%';c.className='ch '+(ch>=0?'cfh-up':'cfh-dn')}
  if(s){el.querySelector('.in').textContent='in '+usd(s.in);el.querySelector('.out').textContent='out '+usd(s.out)}}
function liqHour(){var t=NOW()-3600e3,from=liqCover&&liqCover>t?liqCover:t,o={u:0,l:0,s:0,from:from};LQ.forEach(function(x){if(x.s==='okx'&&x.t>=from){o.u+=x.u;if(x.l)o.l+=x.u;else o.s+=x.u}});return o}
var CAP=[],capI=0,capT=0;
function tick(){prune();var S=stats(),mins=NOW()-60e3,live=firstData;
  ASSETS.forEach(function(a){laneTxt(a,live?S[a]:null)});
  if(live){tween($('cfh-s-vol'),S.all,usd);$('cfh-s-vol2').textContent='BTC '+usd(S.BTC.in+S.BTC.out)+' · ETH '+usd(S.ETH.in+S.ETH.out)+' · gold '+usd(S.GOLD.in+S.GOLD.out);
    if(S.big){$('cfh-s-big').textContent=usd(S.big[1]);$('cfh-s-big2').textContent=NAME[S.big[4]]+' '+(S.big[2]>0?'bought':'sold')+' on '+SRC[S.big[3]].n+' at '+hhmm(S.big[0])+' IST'}}
  var LH=liqHour();if(LQ.length){tween($('cfh-s-liq'),LH.u,usd);var mn=Math.round((NOW()-LH.from)/60e3);$('cfh-s-liq2').textContent='OKX · '+(mn<59?'last '+mn+' min':'last hour')+' · rise-bets '+usd(LH.l)+' · fall-bets '+usd(LH.s);
    $('cfh-liq-s').innerHTML='<b>'+usd(LH.u)+'</b> of leveraged BTC, ETH and gold bets were force-closed on OKX in the '+(mn<59?'last '+mn+' minutes':'last hour')+'. Most were bets on prices going <b>'+(LH.l>=LH.s?'up':'down')+'</b>.'}
  var btc=PXS.BTC&&PXS.BTC.last;if(btc&&FX&&FX.INR){tween($('cfh-s-inr'),btc*FX.INR,inr);$('cfh-s-inr2').textContent='$'+Math.round(btc).toLocaleString('en-US')+' × ₹'+FX.INR.toFixed(2)+' per $ (Coinbase rate)'}
  /* world strip */
  var wx=[],avg=[];['okx','cb','by','kr'].forEach(function(k){var v=VENUE[k];if(v&&NOW()-v.t<120e3)avg.push(v.p)});var av=avg.length?avg.reduce(function(x,y){return x+y},0)/avg.length:null;
  ['okx','cb','by','kr'].forEach(function(k){var v=VENUE[k];wx.push('<div><small>Bitcoin on '+SRC[k].n+(k==='cb'||k==='kr'?' (USD)':' (USDT)')+'</small><b>'+(v?px(v.p,0):'…')+'</b>'+(v&&av?' <span class="cfh-mu" style="font-size:10px">'+(v.p-av>=0?'+':'')+(v.p-av).toFixed(0)+'</span>':'')+'</div>')});
  var g=PXS.GOLD&&PXS.GOLD.last;if(FX&&FX.INR){wx.push('<div><small>US dollar in rupees</small><b>₹'+FX.INR.toFixed(2)+'</b></div>');if(g)wx.push('<div><small>10 g gold, world price in ₹</small><b>'+inr(g/31.1035*10*FX.INR)+'</b></div>')}
  $('cfh-wx').innerHTML=wx.join('');var open=mkts();if(!mapRun)drawMap(0);
  /* plain-English captions from the real numbers */
  CAP=[];if(live&&S.BTC.in+S.BTC.out>0)CAP.push('<b>'+usd(S.BTC.in)+'</b> of Bitcoin was bought and <b>'+usd(S.BTC.out)+'</b> sold in the last minute on the feeds we watch. '+(S.BTC.in>=S.BTC.out?'Buyers are ahead.':'Sellers are ahead.'));
  if(LQ.length&&LH.u>0){var lm=Math.round((NOW()-LH.from)/60e3);CAP.push('<b>'+usd(LH.u)+'</b> of leveraged Bitcoin, Ether and gold bets got wiped out on OKX in the '+(lm<59?'last '+lm+' minutes':'last hour')+', mostly people betting prices would go '+(LH.l>=LH.s?'up':'down')+'.')}
  if(FNG)CAP.push('Crypto market mood today: <b>'+esc(FNG[0][1])+' ('+FNG[0][0]+'/100)</b>.');
  if(FUND.BTC)CAP.push(FUND.BTC.r>=0?'More Bitcoin traders are betting on a rise: they pay the other side <b>'+(FUND.BTC.r*100).toFixed(4)+'%</b> to keep their bets open.':'More Bitcoin traders are betting on a fall: they pay the other side <b>'+(Math.abs(FUND.BTC.r)*100).toFixed(4)+'%</b> to keep their bets open.');
  if(BK.BTC)CAP.push('<b>'+usd(BK.BTC.bb[BK.BTC.bb.length-1])+'</b> of Bitcoin buy orders are waiting just below today\'s price on OKX.');
  if(btc&&FX&&FX.INR)CAP.push('1 Bitcoin costs about <b>'+inr(btc*FX.INR)+'</b> right now.');
  CAP.push('It is <b>'+lp('Asia/Kolkata').s+'</b> in Mumbai. Stock markets open now: '+(open.length?open.map(function(m){return m[0]}).join(', '):'none')+'. Crypto never closes.');
  if(NOW()-capT>7000&&CAP.length){capT=NOW();var cp=$('cfh-cap'),txt=CAP[capI++%CAP.length];if(RM){cp.innerHTML=txt}else{cp.classList.add('is-out');setTimeout(function(){cp.innerHTML=txt;cp.classList.remove('is-out')},350)}}
  if(RM||userPaused)still();
  /* snapshot for the next visit */
  if(btc){SNAP={t:NOW(),px:PXS,inr:FX&&FX.INR,vol:live?S.all:SNAP.vol};}
}
setInterval(function(){if(!document.hidden)tick()},1000);
setInterval(function(){if(SNAP.t)saveSnap()},15000);
document.addEventListener('visibilitychange',function(){if(document.hidden){stop();mapState();saveSnap();hiddenAt=NOW();setTimeout(function(){if(document.hidden&&NOW()-hiddenAt>=59e3)closeAll()},60e3)}else{reopenAll();tick();start();mapState()}});
window.addEventListener('pagehide',saveSnap);
window.__cfhState=function(){return{src:SRC,n:{BTC:T.BTC.length,ETH:T.ETH.length,GOLD:T.GOLD.length},liq:LQ.length,p:P.length,q:q,ft:ftAvg,running:running,onScreen:onScreen,px:PXS}};
/* ---------- boot ---------- */
size();
if(SNAP.t&&SNAP.px&&NOW()-SNAP.t<6*3600e3){ASSETS.forEach(function(a){if(SNAP.px[a])PXS[a]=Object.assign({},SNAP.px[a],{c:1});laneTxt(a,null)});$('cfh-cap').textContent='Showing prices from your last visit ('+hhmm(SNAP.t)+' IST) while live feeds connect…'}
var PRE=window.__cfhPre||{};[['BTC-USDT-SWAP','BTC'],['ETH-USDT-SWAP','ETH'],['XAU-USDT-SWAP','GOLD']].forEach(function(x){var q=PRE[x[0]];if(q)q.then(function(d){var p=PXS[x[1]];if(!p||p.c){PXS[x[1]]={last:+d.last,open:+d.open24h,t:NOW()};laneTxt(x[1],null)}},function(){})});
chips();drawFund();drawMap(0);mkts();syncMotion();
feeds();
var idle=window.requestIdleCallback||function(f){return setTimeout(f,200)};idle(seeds);
setTimeout(tick,600);
})();
