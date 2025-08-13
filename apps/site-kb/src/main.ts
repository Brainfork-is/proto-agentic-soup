import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join } from 'path';

const app = Fastify();

app.register(fastifyStatic, {
  root: join(__dirname, '../public'),
  prefix: '/',
});

app.get('/healthz', async () => ({ ok: true }));

const port = Number(process.env.PORT || 3200);
app
  .listen(port, '0.0.0.0')
  .then(() => console.log(`[site-kb] ${port}`));
