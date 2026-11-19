/* Meta-only preference. Does not change Shopify or other analytics preferences. */
(() => {
  if (window.__wenMetaConsentLoaded) return;
  window.__wenMetaConsentLoaded = true;
  const key = 'wen-meta-consent-v1';
  const preview = location.hostname?.endsWith('.vercel.app') || ['localhost','127.0.0.1'].includes(location.hostname);
  let choice = '';
  const sent = new Set();
  const blocked = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  try { choice = localStorage.getItem(key) || ''; } catch (_) {}
  const allowed = () => choice === 'allow' && !blocked();
  const send = (name, data) => {
    if (!allowed() || sent.has(name)) return;
    sent.add(name);
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    if (preview) { console.info('Meta preview event (not sent)', JSON.stringify({event_name:name,event_id:id,custom_data:data})); return; }
    window.fbq('track', name, data, { eventID: id });
    // A shared event ID deduplicates the browser/server pair. No purchase events.
    fetch('/api/meta-capi', {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({marketing_consent:true,event_name:name,event_id:id,
        event_source_url:location.origin + location.pathname,custom_data:data}), keepalive:true}).catch(() => {});
  };
  const start = () => {
    if (!allowed()) return;
    if (!window.fbq) {
      const q = function(){ q.callMethod ? q.callMethod.apply(q, arguments) : q.queue.push(arguments); };
      q.queue=[]; q.loaded=true; q.version='2.0'; window.fbq=q; window._fbq=q;
      q('consent','grant'); q('init','1022347530218534');
      const script=document.createElement('script'); script.async=true;
      script.src='https://connect.facebook.net/en_US/fbevents.js'; if (!preview) document.head.appendChild(script);
    } else window.fbq('consent','grant');
    send('PageView',{});
    // This page displays all variants, so use the verified catalog GROUP, not 10lb.
    if (/^\/products\/2lb-bag-of-whole-dried-black-soldier-fly-larvae-bsfl(?:\.html)?\/?$/.test(location.pathname)) {
      send('ViewContent',{content_type:'product_group',content_ids:['8975496478860']});
    }
  };
  const init = () => {
    const panel=document.createElement('section'); panel.setAttribute('aria-label','Meta advertising privacy');
    panel.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:10000;background:#fff;color:#18332a;border:1px solid #52665c;padding:16px;box-shadow:0 2px 12px #0003;max-width:640px;border-radius:8px';
    const text=document.createElement('p');
    text.textContent='Allow Meta (Facebook and Instagram) to receive page and product views for ad measurement? This shares your IP address, browser information and page path with Meta and lets Meta use advertising cookies. Optional: the site and shopping links work without it. This choice applies only to Meta tracking on this website, not Shopify checkout or other analytics.';
    panel.appendChild(text);
    const status=document.createElement('p'); status.setAttribute('role','status'); panel.appendChild(status);
    const choose = value => {
      choice=value; try { localStorage.setItem(key,value); } catch (_) {}
      if (!allowed() && window.fbq) window.fbq('consent','revoke');
      panel.hidden=true; start();
    };
    for (const [label,value] of [['Reject Meta tracking','reject'],['Allow Meta tracking','allow']]) {
      const button=document.createElement('button'); button.type='button'; button.textContent=label;
      button.style.cssText='margin:6px;padding:10px;border:1px solid #52665c;background:#fff;color:#18332a;border-radius:4px';
      button.disabled=value==='allow' && blocked(); button.addEventListener('click',()=>choose(value)); panel.appendChild(button);
    }
    const link=document.createElement('a'); link.href='/privacy'; link.textContent='Privacy policy'; panel.appendChild(link);
    const manage=document.createElement('button'); manage.type='button'; manage.textContent='Meta privacy choices';
    manage.style.cssText='position:fixed;bottom:8px;left:8px;z-index:9999;background:#fff;color:#18332a;border:1px solid #52665c;border-radius:4px;padding:6px';
    manage.addEventListener('click',()=>{panel.hidden=false;});
    status.textContent=blocked()?'Your browser privacy signal blocks Meta tracking.':preview?'Preview only: no Meta events are sent.':'';
    panel.hidden=!!choice || blocked(); document.body.append(manage,panel); start();
    window.addEventListener('storage', e => { if(e.key===key){choice=e.newValue||'';if(!allowed()&&window.fbq)window.fbq('consent','revoke');start();} });
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
