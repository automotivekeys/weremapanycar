// Builds one real HTML page per route into ./site, then prerenders each with Playwright.
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const DOMAIN='https://weremapanycar.com';
const t=fs.readFileSync('src/template.html','utf8');
const cut=t.indexOf('</style>')+8;
let head=t.slice(0,cut).replace(/<title>.*?<\/title>\n/,'').replace(/<meta name="claude:[^>]*>\n/,'').replace(/<meta name="description"[^>]*>\n/,'');
const body=t.slice(cut);
// get data out of the template's script
const vm=require('vm');const scr=body.slice(body.indexOf('<script>')+8,body.lastIndexOf('</script>'));
const ctx={};vm.createContext(ctx);
vm.runInContext("const slug=s=>s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');"+scr.slice(scr.indexOf('/* ---------- services'),scr.indexOf('/* ---------- vehicles'))+';this.S=SERVICES;this.T=TOWNS;',ctx);
const S=ctx.S,T=ctx.T;
const routes=[
 ['home','',"We Remap Any Car | Mobile ECU Remapping in Blackburn & the North West","Mobile ECU remapping, tuning, speed limiters, gearbox tuning and DPF/EGR diagnostics for cars, vans, pickups and tractors. We come to you within 20 miles of Blackburn."],
 ['services','services/',"Remapping & Tuning Services | We Remap Any Car","Stage 1 and 2 remaps, economy tuning, speed limiters, DPF, EGR and AdBlue diagnostics, gearbox tuning and ECU repair. Mobile across the North West."],
 ['areas','areas/',"Areas We Cover | Mobile Remapping Within 20 Miles of Blackburn",`Mobile remapping and tuning in ${T.length} towns across Lancashire and Greater Manchester, including Preston, Burnley, Bolton, Chorley, Bury and Clitheroe.`],
 ['insight','how-remapping-works/',"How Remapping Works, Explained Simply | We Remap Any Car","What an ECU remap changes, what happens on the day, and the kit we bring. Plain-English guide from a mobile remapping specialist."],
 ['contact','contact/',"Get a Remap Quote | We Remap Any Car","Send your registration and town for a fixed-price remap quote. Mobile within 20 miles of Blackburn."],
 ...S.map(s=>['service-'+s.id,'services/'+s.id+'/',`${s.name} | Mobile in Lancashire | We Remap Any Car`,s.short+' Mobile service within 20 miles of Blackburn.']),
 ...T.map(x=>['area-'+x.slug,'areas/'+x.slug+'/',`Car & Van Remapping in ${x.name} | We Remap Any Car`,`Mobile ECU remapping, tuning, speed limiters and DPF diagnostics in ${x.name}. We come to your home or work, ${x.mi?'about '+x.mi+' miles from':'based in'} Blackburn.`])
];
fs.rmSync('docs',{recursive:true,force:true});
const esc=s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
for(const [r,p,title,desc] of routes){
  const depth=p.split('/').filter(Boolean).length,root='../'.repeat(depth);
  const html=`<!DOCTYPE html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${esc(title)}</title>\n<meta name="description" content="${esc(desc)}">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:description" content="${esc(desc)}">\n<meta property="og:type" content="website">\n<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">\n${head}\n<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n${body.replace('<main id="app">',`<main id="app" data-route="${r}" data-root="${root}">`)}\n</body>\n</html>\n`;
  fs.mkdirSync(path.join('docs',p),{recursive:true});fs.writeFileSync(path.join('docs',p,'index.html'),html);
}
fs.cpSync('src/img','docs/img',{recursive:true});
fs.writeFileSync('docs/favicon.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#0E1511"/><path d="M8 30 A17 17 0 1 1 40 30" fill="none" stroke="#A8E03A" stroke-width="4" stroke-linecap="round"/><path d="M24 26 L35 14" stroke="#E3ECEE" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="26" r="3.5" fill="#E3ECEE"/></svg>`);
fs.writeFileSync('docs/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(r=>`  <url><loc>${DOMAIN}/${r[1]}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync('docs/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${DOMAIN}/sitemap.xml\n`);
fs.writeFileSync('docs/.nojekyll','');
(async()=>{ // prerender so search engines see the full text without running scripts
  const b=await chromium.launch();const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  for(const [r,p] of routes){const f=path.resolve('docs',p,'index.html');await pg.goto('file://'+f);
    const main=await pg.$eval('#app',el=>el.innerHTML);const ft=await pg.$eval('.site-foot',el=>el.innerHTML);
    let h=fs.readFileSync(f,'utf8');
    h=h.replace(/(<main id="app"[^>]*>)<\/main>/,(m,a)=>a+main+'</main>');
    h=h.replace(/(<footer class="site-foot">)[\s\S]*?(<\/footer>)/,(m,a,z)=>a+ft+z);
    fs.writeFileSync(f,h);}
  console.log('pages',routes.length,'errors',errs);await b.close();
})();
