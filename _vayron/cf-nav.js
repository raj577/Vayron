/* Crypto-first navigation for the Next pages: adds a "Crypto F&O" entry (the home dashboard at /) at the start of the
   header nav and of the mobile navigation sheet, and moves Crypto up where the list is flex. Runs after hydration and
   only inserts plain new nodes; React-owned nodes are never moved or edited (no hydration errors). */
(function(){
  if(window.__cfNav)return;window.__cfNav=1;
  var CSS='.cfnav-fno{order:-3}.cfnav-crypto{order:-2}@media (max-width:767px){header .cfnav-fno{display:none}}';
  var TXT={'Crypto':'Crypto F&O','Crypto & Gold':'Crypto & Gold F&O','BTC, ETH and gold with live prices and signal scores.':'Order flow, order blocks, OI, liquidations and backtests for BTC, ETH and gold.'};
  function css(){if(document.getElementById('cfnav-css'))return;var s=document.createElement('style');s.id='cfnav-css';s.textContent=CSS;document.head.appendChild(s)}
  function hasPulse(el){return el.matches&&el.matches('a[href="/pulse/"]')||!!(el.querySelector&&el.querySelector('a[href="/pulse/"]'))}
  function fix(cr){
    var item=cr,d=0;
    while(item.parentElement&&d<4){var par=item.parentElement,sib=false;for(var i=0;i<par.children.length;i++){var c=par.children[i];if(c!==item&&hasPulse(c)){sib=true;break}}if(sib)break;item=par;d++}
    var list=item.parentElement;if(!list||d>=4||list.querySelector(':scope>.cfnav-fno'))return;
    var active=item.matches('[aria-current]')||!!item.querySelector('[aria-current]'),tpl=item,icon=null;
    if(active){for(var j=0;j<list.children.length;j++){var c2=list.children[j];if(c2!==item&&hasPulse(c2)&&!(c2.matches('[aria-current]')||c2.querySelector('[aria-current]'))){tpl=c2;icon=cr.querySelector('svg');break}}if(tpl===item)return}
    var n=tpl.cloneNode(true);n.classList.add('cfnav-fno');
    [n].concat([].slice.call(n.querySelectorAll('*'))).forEach(function(e){e.removeAttribute&&(e.removeAttribute('aria-current'),e.removeAttribute('data-state'),e.removeAttribute('id'));if(e.tagName==='A'){e.setAttribute('href','/');e.setAttribute('title','Crypto & Gold F&O dashboard')}});
    if(icon){var o=n.querySelector('svg');if(o)o.parentNode.replaceChild(icon.cloneNode(true),o)}
    var w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT),t,done=0;
    while((t=w.nextNode())){var k=t.nodeValue.trim();if(TXT[k]){t.nodeValue=t.nodeValue.replace(k,TXT[k]);done=1}else if(icon&&k&&!done){t.nodeValue='Crypto F&O';done=1}else if(icon&&k){t.nodeValue=''}}
    item.classList.add('cfnav-crypto');
    list.insertBefore(n,list.firstChild);
  }
  /* headers without a Crypto link (e.g. the NSE home at /markets/): add Crypto F&O before the first header link */
  function hdr(){var h=document.querySelector('header');if(!h||h.querySelector('a[href="/crypto/"]')||h.querySelector('.cfnav-fno'))return;
    var a=h.querySelector('a[href="/academy/"]');if(!a||!a.parentElement)return;var n=a.cloneNode(true);n.classList.add('cfnav-fno');n.setAttribute('href','/');n.removeAttribute('aria-current');n.setAttribute('title','Crypto & Gold F&O dashboard');n.textContent='Crypto F&O';a.parentElement.insertBefore(n,a.parentElement.firstChild)}
  function scan(){var ls=document.querySelectorAll('a[href="/crypto/"]');for(var i=0;i<ls.length;i++)if(!ls[i].closest('.cfnav-fno'))fix(ls[i]);hdr()}
  function go(){css();scan();try{new MutationObserver(function(){clearTimeout(go.t);go.t=setTimeout(scan,40)}).observe(document.body,{childList:true,subtree:true})}catch(e){}}
  if(document.readyState==='complete')setTimeout(go,300);else addEventListener('load',function(){setTimeout(go,300)});
})();
