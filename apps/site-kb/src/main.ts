import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { loadSiteConfig } from '@soup/common';

const app = Fastify();

app.register(fastifyStatic, {
  root: join(__dirname, '../public'),
  prefix: '/',
});

app.get('/healthz', async () => ({ ok: true }));

const cfg = loadSiteConfig();
const port = cfg.SITE_KB_PORT;
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => console.log(`[site-kb] ${port}`));
