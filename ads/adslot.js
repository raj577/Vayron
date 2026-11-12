/* Vayron AdSlot runtime v3. See /ad-config.js. Never runs on /login /register /admin /404 /_not-found.
   Empty/unfilled slots take zero space and show no label. Reveal only when <ins data-ad-status="filled">.
   ?adpreview=1 shows dashed preview boxes. */
(function(){
  if(/^\/(login|register|admin|404|_not-found)(\/|$)/.test(location.pathname))return;
  var C=window.__VAYRON_ADS__||{slots:{}},S=C.slots||{};
  var q=/[?&]adpreview=1/.test(location.search);if(q)try{sessionStorage.setItem("adpreview","1")}catch(e){}
  var PV=q||(function(){try{return sessionStorage.getItem("adpreview")==="1"}catch(e){return false}})();
  var T={top_billboard:["display",100,"970x90 / 728x90 · 320x100 mobile","horizontal"],mid_1:["display",250,"responsive display 728x90–970x250","auto"],mid_2:["display",250,"responsive display","auto"],mid_3:["display",250,"responsive display","auto"],
    orderflow_mid:["display",100,"728x90 / 320x100","horizontal"],orderflow_grid:["infeed",250,"native in-feed card","fluid"],infeed:["infeed",250,"native in-feed","fluid"],
    multiplex:["multiplex",320,"multiplex (autorelaxed)","autorelaxed"],footer_leaderboard:["display",100,"728x90 / 320x100","horizontal"],
    rail_halfpage:["display",600,"300x600 half-page","vertical"],rail_rect:["display",250,"300x250 rectangle","rectangle"],mobile_anchor:["display",50,"320x50 anchor","horizontal"]};
  function sid(k){var t=T[k][0],v=S[k]||(t==="display"?C.defaultDisplaySlot:t==="infeed"?C.defaultInfeedSlot:C.defaultMultiplexSlot);return /^\d+$/.test(v||"")?v:null;}
  function collapse(w){
    w.style.cssText="display:block;box-sizing:border-box;margin:0;padding:0;width:100%;max-width:100%;min-height:0;height:0;overflow:hidden;border:0;opacity:0;pointer-events:none;clear:both;";
    w.dataset.adState="collapsed";
    var lab=w.querySelector(".vayron-ad-label");if(lab)lab.style.display="none";
  }
  function expand(w,k){
    var t=T[k]||["display",100,"",""];
    if(k==="mobile_anchor"){
      w.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:30;height:66px;background:rgba(255,255,255,.96);border-top:1px solid rgba(127,127,127,.25);text-align:center;padding:4px 0;box-sizing:border-box;overflow:hidden;opacity:1;pointer-events:auto;margin:0;";
    }else if(/^rail_/.test(k)){
      w.style.cssText="display:block;width:300px;text-align:center;margin:0;padding:0;opacity:1;pointer-events:auto;min-height:0;height:auto;overflow:visible;";
    }else{
      w.style.cssText="display:block;box-sizing:border-box;margin:20px auto;padding:6px 0 0;width:100%;max-width:100%;text-align:center;clear:both;min-height:0;height:auto;overflow:visible;border-top:1px solid rgba(127,127,127,.12);opacity:1;pointer-events:auto;";
    }
    w.dataset.adState="filled";
    var lab=w.querySelector(".vayron-ad-label");
    if(lab){lab.textContent="Ad";lab.style.cssText="font:500 9px/1.4 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;opacity:.4;margin:0 0 2px;display:block";}
    if(k==="mobile_anchor")document.body.style.paddingBottom="66px";
    if(/^rail_/.test(k)){var RR=document.getElementById("vayron-rail");if(RR)RR.style.display="flex";syncRailPad(true);}
  }
  function syncRailPad(forceOn){
    var m=document.querySelector("main"),R=document.getElementById("vayron-rail");
    if(!m)return;
    var filled=forceOn||(R&&R.querySelector('[data-ad-state="filled"]'));
    if(innerWidth>=1360&&filled){m.style.paddingRight="332px";m.style.boxSizing="border-box";}
    else{m.style.paddingRight="";}
  }
  function watch(w,ins,k){
    function check(){
      var st=ins.getAttribute("data-ad-status");
      if(st==="filled"){if(w.dataset.adState!=="filled")expand(w,k);return;}
      if(st==="unfilled"){
        collapse(w);
        if(k==="mobile_anchor"){document.body.style.paddingBottom="";}
        if(/^rail_/.test(k))syncRailPad(false);
        return;
      }
    }
    try{new MutationObserver(check).observe(ins,{attributes:true,attributeFilter:["data-ad-status"]});}catch(e){}
    check();
    setTimeout(check,800);setTimeout(check,2500);setTimeout(check,6000);
  }
  function make(k,id,css){
    var s=sid(k);if(!s&&!PV)return null;var t=T[k],w=document.createElement(k.indexOf("grid")>0||k==="infeed"?"div":"aside");
    w.className="vayron-ad";w.dataset.ad=k;w.dataset.adId=id;
    var l=document.createElement("div");l.className="vayron-ad-label";l.textContent="";l.style.display="none";w.appendChild(l);
    if(PV&&!s){
      w.style.cssText=css||"display:block;box-sizing:border-box;margin:24px auto;padding:8px 0 0;width:100%;max-width:100%;text-align:center;clear:both;min-height:"+(t[1]+22)+"px;border-top:1px solid rgba(127,127,127,.18);";
      l.textContent="Ad";l.style.cssText="font:500 9px/1.4 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;opacity:.4;margin:0 0 2px;display:block";
      var b=document.createElement("div");b.textContent=k+" · "+t[2];b.style.cssText="display:flex;align-items:center;justify-content:center;height:"+t[1]+"px;max-width:"+(/^rail/.test(k)?300:970)+"px;margin:0 auto;border:2px dashed #f59e0b;border-radius:10px;background:rgba(245,158,11,.08);color:#b45309;font:600 12px system-ui";w.appendChild(b);w.dataset.adState="preview";return w;
    }
    if(PV){
      // preview with real slot ids: show dashed frame + live unit so layout can be checked
      w.style.cssText=css||"display:block;box-sizing:border-box;margin:24px auto;padding:8px 0 0;width:100%;max-width:100%;text-align:center;clear:both;min-height:"+(t[1]+22)+"px;border-top:1px solid rgba(127,127,127,.18);";
      l.textContent="Ad";l.style.cssText="font:500 9px/1.4 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;opacity:.4;margin:0 0 2px;display:block";
      w.dataset.adState="preview";
    }else{
      collapse(w);
    }
    var i=document.createElement("ins");i.className="adsbygoogle";i.style.display="block";
    if(/^rail|anchor/.test(k)){var d=k==="rail_halfpage"?[300,600]:k==="rail_rect"?[300,250]:[320,50];i.style.cssText="display:inline-block;width:"+d[0]+"px;height:"+d[1]+"px";}
    i.setAttribute("data-ad-client",C.client||"ca-pub-5880331394195978");i.setAttribute("data-ad-slot",s);
    if(t[3]==="fluid"){i.setAttribute("data-ad-format","fluid");if(C.infeedLayoutKey)i.setAttribute("data-ad-layout-key",C.infeedLayoutKey);else i.setAttribute("data-ad-layout","in-article");}
    else if(t[3]==="autorelaxed")i.setAttribute("data-ad-format","autorelaxed");
    else if(!/^rail|anchor/.test(k)){i.setAttribute("data-ad-format",t[3]);i.setAttribute("data-full-width-responsive","true");}
    w.appendChild(i);w._p=1;if(!PV)watch(w,i,k);return w;
  }
  function push(w){if(w&&w._p){w._p=0;try{(window.adsbygoogle=window.adsbygoogle||[]).push({})}catch(e){}}}
  function put(id,k,par,ref){if(!par)return;var ex=document.querySelector('[data-ad-id="'+id+'"]');
    if(ex){if(ex.parentNode!==par||ex.nextSibling!==(ref||null))par.insertBefore(ex,ref||null);return;}
    var w=make(k,id);if(w){par.insertBefore(w,ref||null);push(w);}}
  function el(p){return [].slice.call(p.children).filter(function(x){return !(x.dataset&&x.dataset.adId)&&x.tagName!=="SCRIPT"&&x.offsetHeight>0;});}
  function blocks(m){var c=m,g=0;while(g++<8){var k=el(c);
      var f=k.filter(function(x){return /\bflex-1\b/.test(x.className)&&x.offsetHeight>200;});
      if(k.length===1)c=k[0];else if(k.length<=3&&f.length===1&&f[0].offsetHeight>0.6*c.offsetHeight)c=f[0];else break;}
    return c;}
  var lastP;
  function run(){
    var p=location.pathname+(/view=orderflow/.test(location.search)?"?of":""),m=document.querySelector("main");if(!m)return;
    if(p!==lastP){document.querySelectorAll("[data-ad-id]").forEach(function(n){n.remove()});
      var oldR=document.getElementById("vayron-rail");if(oldR)oldR.remove();
      var oldA=document.getElementById("vayron-anchor");if(oldA){oldA.remove();document.body.style.paddingBottom="";}
      m.style.paddingRight="";lastP=p;}
    var c=blocks(m),k=el(c),of=/\?of$/.test(p),home=location.pathname==="/";
    // 1) top leaderboard
    put("top","top_billboard",c,k[home?1:1]||null);
    k=el(c);
    if(of){
      // 2) one mid above F&O grid — no in-feed cards inside the grid
      var g=[].slice.call(c.querySelectorAll("div.grid")).find(function(x){return x.children.length>=6&&/·/.test(x.children[0].innerText||"")});
      if(g){var bar=g.previousElementSibling;if(bar)put("ofm","orderflow_mid",g.parentNode,bar);}
    }else{
      // 2) one mid-content slot only
      var long=/^\/(academy|news|options|liquidity|screeners|pulse|oi-flow)?(\/|$)/.test(location.pathname)||home;
      var rows=[];k.forEach(function(b,bi){if(bi===0){rows.push([c,b]);return;}var x=b,z=0;while(z++<4&&el(x).length===1)x=el(x)[0];var xs=el(x);
        if(b.offsetHeight>650&&xs.length>=2)xs.forEach(function(y){rows.push([x,y])});else rows.push([c,b]);});
      var idx=home?2:/^\/pulse(\/|$)/.test(location.pathname)?2:1;
      var rr=rows[idx+1]||(rows.length>=3?[c,null]:null);
      if(rr&&long){put("m0","mid_1",rr[0],rr[1]);var e=document.querySelector('[data-ad-id="m0"]');if(e&&getComputedStyle(rr[0]).display==="grid")e.style.gridColumn="1/-1";}
      // in-feed list/grid placements dropped (config slots kept for later)
    }
    // 3) bottom multiplex (skip legal pages)
    if(!/^\/(privacy|disclaimer|data-integrity|support)\//.test(location.pathname))put("mx","multiplex",c,null);
    // 4a) desktop sticky right rail — NO main padding until filled
    var R=document.getElementById("vayron-rail");
    if(innerWidth>=1360&&(PV||sid("rail_halfpage"))){
      if(!R){R=document.createElement("div");R.id="vayron-rail";R.style.cssText="position:fixed;top:84px;right:16px;width:300px;z-index:20;display:none;flex-direction:column;gap:16px";document.body.appendChild(R);}
      if(!R.querySelector('[data-ad-id="rh"]')){var a=make("rail_halfpage","rh","display:block;width:300px;text-align:center");if(a){R.appendChild(a);push(a);}}
      if(PV){R.style.display="flex";syncRailPad(true);}else syncRailPad(false);
    }else if(R){R.remove();m.style.paddingRight="";}
    // 4b) mobile anchor — NO body padding until filled
    var A=document.getElementById("vayron-anchor");
    if(innerWidth<1024&&(PV||sid("mobile_anchor"))&&!A&&!window._anchorClosed){
      A=make("mobile_anchor","ma");
      if(A){A.id="vayron-anchor";var x=document.createElement("button");x.textContent="×";x.setAttribute("aria-label","Close ad");x.style.cssText="position:absolute;top:2px;right:6px;border:0;background:none;font-size:18px;cursor:pointer;display:none";x.onclick=function(){A.remove();document.body.style.paddingBottom="";window._anchorClosed=1};A.appendChild(x);
        // show close button only once filled / in preview
        if(PV){x.style.display="block";document.body.style.paddingBottom="66px";}
        else{
          var ins=A.querySelector("ins.adsbygoogle");
          if(ins){var _exp=A;var obs=new MutationObserver(function(){if(ins.getAttribute("data-ad-status")==="filled"){x.style.display="block";}});obs.observe(ins,{attributes:true,attributeFilter:["data-ad-status"]});}
        }
        document.body.appendChild(A);push(A);}
    }else if(A&&innerWidth>=1024){A.remove();document.body.style.paddingBottom="";}
  }
  var t;new MutationObserver(function(ms){
    if(ms.every(function(x){return [].slice.call(x.addedNodes).concat([].slice.call(x.removedNodes)).every(function(n){return n.nodeType!==1||n.closest&&n.closest("[data-ad-id],#vayron-rail")||(n.dataset&&n.dataset.adId)})}))return;
    clearTimeout(t);t=setTimeout(run,300);}).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(run,2500);addEventListener("resize",function(){clearTimeout(t);t=setTimeout(run,300)});
  if(document.readyState!=="loading")run();else document.addEventListener("DOMContentLoaded",run);
})();
