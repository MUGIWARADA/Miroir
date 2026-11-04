import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const build = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const [{ buildApp }, { loadConfig }] = await Promise.all([
  import('./dist/app.js'),
  import('./dist/config.js'),
]);

// Schema generation only registers routes. It must never connect to a database
// or call the scoring service.
const unused = async () => {
  throw new Error('The schema generator must not execute API handlers.');
};
const db = {
  kind: 'schema-only',
  query: unused,
  transaction: unused,
  exec: unused,
  close: async () => {},
};
const scoring = { score: unused };
const config = loadConfig({
  ...process.env,
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '0',
  CORS_ORIGIN: '*',
  TRUST_PROXY: 'false',
  DATABASE_URL: '',
  MIGRATION_DATABASE_URL: '',
  PGLITE_DIR: '.data/schema-only',
  SCORING_SERVICE_URL: 'http://127.0.0.1:8001',
  SCORING_SERVICE_TOKEN: 'schema-only-token',
  SESSION_TTL_HOURS: '1',
});
const app = await buildApp({ config, db, scoring });

try {
  await app.ready();
  const document = app.swagger();
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
  let operationCount = 0;

  for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      operationCount += 1;
      const responses = operation?.responses ?? {};
      if (!Object.keys(responses).some((status) => /^[23]/.test(status))) {
        throw new Error(`${method.toUpperCase()} ${route} has no documented success response.`);
      }
      if (route.startsWith('/v1/') && !responses['400']) {
        throw new Error(`${method.toUpperCase()} ${route} is missing the shared error response schema.`);
      }
    }
  }

  if (operationCount === 0) throw new Error('No API operations were found to document.');
  await writeFile(path.join(root, 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`Generated openapi.json for ${operationCount} API operations.`);
} finally {
  await app.close();
}
