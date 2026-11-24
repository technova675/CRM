// Lets node --test load server modules written for Next.js: "server-only" becomes an empty module and
// extensionless relative imports resolve to their .ts file, as the Next.js bundler does.
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export async function resolve(spec,ctx,next){
  if(spec==='server-only')return {url:'data:text/javascript,export{}',shortCircuit:true};
  if((spec.startsWith('./')||spec.startsWith('../'))&&!/\.[cm]?[jt]sx?$/.test(spec)&&ctx.parentURL?.startsWith('file:')){
    for(const ext of ['.ts','.tsx','/index.ts']){const u=new URL(spec+ext,ctx.parentURL);if(existsSync(fileURLToPath(u)))return next(u.href,ctx);}
  }
  return next(spec,ctx);
}`));
