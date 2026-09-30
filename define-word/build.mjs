import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {posix} from 'node:path';
const root=new URL('./',import.meta.url);
// Resolve only our relative modules: no ancestor-directory/package discovery.
const sourceFiles={name:'project-sources',setup(builder){
  builder.onResolve({filter:/.*/},args=>{
    const path=posix.normalize(posix.join(args.importer?posix.dirname(args.importer):'',args.path));
    if(!path.startsWith('src/') || !/\.(?:mjs|js)$/.test(path))throw new Error('Unexpected bundle import: '+args.path);
    return {path,namespace:'project'};
  });
  builder.onLoad({filter:/.*/,namespace:'project'},async args=>({contents:await readFile(new URL(args.path,root),'utf8'),loader:'js'}));
}};
const result=await build({entryPoints:['src/entry.js'],absWorkingDir:fileURLToPath(root),plugins:[sourceFiles],tsconfigRaw:{compilerOptions:{}},bundle:true,format:'iife',platform:'browser',target:'firefox128',write:false,charset:'utf8',banner:{js:'// Define Word 0.1.2 â€” generated from src/entry.js; run node build.mjs.\n// Local candidate; native Zen verification required.'}});
const content=result.outputFiles[0].text,path=new URL('define-word.uc.js',root);
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==content)throw new Error('Generated entry is stale');console.log('Generated entry matches source.');}
else{await writeFile(path,content);console.log('Built define-word.uc.js');}
