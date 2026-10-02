import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const footer = `
function doGet(e){return UMDSC.doGet(e)}
function doPost(e){return UMDSC.doPost(e)}
function initSecrets(){return UMDSC.initSecrets()}
function authorizeOnce(){return UMDSC.authorizeOnce()}
function warmDancerCaches(){return UMDSC.warmDancerCaches()}
function installWarmTrigger(){return UMDSC.installWarmTrigger()}
`;

fs.mkdirSync('dist', { recursive: true });

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/Code.js',
  format: 'iife',
  globalName: 'UMDSC',
  target: 'es2019',
  footer: {
    js: footer
  }
});

fs.copyFileSync('appsscript.json', 'dist/appsscript.json');
console.log('Build complete: dist/Code.js and dist/appsscript.json');
