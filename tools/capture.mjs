import fs from 'node:fs/promises';

const [url, prefix = '.reference/original', width = '1440', height = '1000'] = process.argv.slice(2);
const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
const socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const result = JSON.parse(event.data);
  if (result.id) {
    const callback = pending.get(result.id);
    pending.delete(result.id);
    result.error ? callback.reject(result.error) : callback.resolve(result.result);
  }
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride', { width: +width, height: +height, deviceScaleFactor: 1, mobile: false });
await call('Page.navigate', { url });
await new Promise(resolve => setTimeout(resolve, 5000));
await evaluate(`(async () => { await document.fonts.ready; for (let y = 0; y < document.body.scrollHeight; y += 650) { window.scrollTo({top:y,behavior:'instant'}); await new Promise(r=>setTimeout(r,160)); } await Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,10000))]); window.scrollTo({top:0,behavior:'instant'}); await new Promise(r=>setTimeout(r,1500)); })()`);
await fs.mkdir('.reference', { recursive: true });
const html = await evaluate('document.documentElement.outerHTML');
await fs.writeFile(prefix + '.html', '<!doctype html>\n' + html);
if (url.startsWith('https://www.xn--')) {
  await evaluate(`document.querySelector('header button[aria-label="Меню"]').click()`);
  const body = await evaluate(`(() => {
    const copy = document.querySelector('header').parentElement.cloneNode(true);
    for (const el of copy.querySelectorAll('[style]')) {
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
      if (!el.getAttribute('style')) el.removeAttribute('style');
    }
    for (const img of copy.querySelectorAll('img')) {
      img.setAttribute('src', img.getAttribute('src').replace(/^\\//,''));
      if (img.alt === 'ПроЗнания') img.setAttribute('src','логотип.jpg');
    }
    const header = copy.querySelector('header');
    const checkbox = document.createElement('input');
    checkbox.type='checkbox'; checkbox.id='mobile-menu-toggle'; checkbox.className='mobile-menu-toggle';
    header.prepend(checkbox);
    const button = header.querySelector('button');
    const label = document.createElement('label');
    label.setAttribute('for','mobile-menu-toggle'); label.setAttribute('aria-label','Меню');
    label.className = button.className + ' mobile-menu-label';
    label.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="menu-open-icon"><path d="M4 6h16M4 12h16M4 18h16"/></svg><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="menu-close-icon"><path d="m6 6 12 12M6 18 18 6"/></svg>';
    button.replaceWith(label);
    const mobileNav = header.lastElementChild;
    mobileNav.classList.add('mobile-navigation');
    for (const el of copy.querySelectorAll('[style]')) {
      el.style.removeProperty('opacity'); el.style.removeProperty('transform');
      if (!el.getAttribute('style')) el.removeAttribute('style');
    }
    for (const frame of copy.querySelectorAll('iframe')) frame.setAttribute('title','Карта: центр ПроЗнания в Краснодаре');
    return copy.outerHTML;
  })()`);
  await fs.writeFile(prefix + '-body.html', body);
  await evaluate(`document.querySelector('header button[aria-label="Меню"]').click()`);
}
const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: +width, height: +height, scale: 1 } });
await fs.writeFile(prefix + '.png', Buffer.from(screenshot.data, 'base64'));
const sections = await evaluate(`JSON.stringify([...document.querySelectorAll('header,main>section,footer,h1,h2,#teachers img')].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,text:e.matches('h1,h2')?e.textContent:'',x:r.x,y:r.y,width:r.width,height:r.height,font:getComputedStyle(e).font,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}}))`);
await fs.writeFile(prefix + '-layout.json', sections);
const teacher = await evaluate(`(()=>{const r=document.querySelector('#teachers').getBoundingClientRect();return {x:0,y:r.top+scrollY,width:innerWidth,height:Math.min(r.height,1200),scale:1}})()`);
const teacherShot = await call('Page.captureScreenshot', {format:'png',captureBeyondViewport:true,clip:teacher});
await fs.writeFile(prefix + '-teachers.png',Buffer.from(teacherShot.data,'base64'));
const metadata = await evaluate(`JSON.stringify({title:document.title,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.body.scrollHeight,images:[...document.images].map(i=>({src:i.getAttribute('src'),alt:i.alt,loaded:i.complete&&i.naturalWidth>0})),links:[...document.querySelectorAll('a')].map(a=>({text:a.innerText,href:a.getAttribute('href')})),headings:[...document.querySelectorAll('h1,h2')].map(e=>({text:e.innerText,font:getComputedStyle(e).font,size:getComputedStyle(e).fontSize})),header:document.querySelector('header')?.outerHTML})`);
await fs.writeFile(prefix + '.json', metadata);
console.log(metadata);
socket.close();
