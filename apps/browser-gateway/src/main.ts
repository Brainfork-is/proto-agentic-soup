import Fastify from 'fastify'; import cors from '@fastify/cors'; import { chromium, Browser } from 'playwright';
const app=Fastify(); app.register(cors,{origin:'*'});
const ALLOWED=(process.env.ALLOWED_HOSTS||'localhost,127.0.0.1').split(',').map((s: string)=>s.trim());
let browser:Browser|null=null;
app.get('/healthz',async()=>({ok:true}));
app.post('/run',async(req,reply)=>{ const b:any=req.body||{}; const url:string=b.url; const steps:any[]=b.steps||[];
 try{ const u=new URL(url); if(!ALLOWED.includes(u.hostname)) return reply.status(400).send({error:'host_not_allowed'});
  if(!browser) browser=await chromium.launch({headless:true}); const ctx=await browser.newContext(); const page=await ctx.newPage();
  await page.goto(url,{waitUntil:'load'}); let lastText=''; let stepsUsed=0;
  for(const s of steps){ if(s.type==='click'&&s.selector){await page.click(s.selector);stepsUsed++;}
   if(s.type==='type'&&s.selector&&typeof s.text==='string'){await page.fill(s.selector,s.text);stepsUsed++;}
   if(s.type==='wait'&&s.ms){await page.waitForTimeout(s.ms);stepsUsed++;}
   if(s.type==='extract'&&s.selector){const t=await page.textContent(s.selector);lastText=(t||'').trim();stepsUsed++;}}
  const content=await page.content(); await ctx.close(); return {ok:true,lastText,contentLength:content.length,stepsUsed}; }
 catch(e:any){ return reply.status(500).send({error:e?.message||'browser_error'});} });
const port=Number(process.env.PORT||3100); app.listen(port,'0.0.0.0').then(()=>console.log(`[browser-gateway] ${port}`));
