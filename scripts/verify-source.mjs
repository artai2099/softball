import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root=new URL("..",import.meta.url).pathname;
for(const file of ["package.json","tsconfig.json","src/app/layout.tsx","src/app/page.tsx","supabase/migrations/202609100001_initial.sql"]){
  if(!statSync(join(root,file)).isFile())throw new Error(`Missing ${file}`);
}
JSON.parse(readFileSync(join(root,"package.json"),"utf8"));
JSON.parse(readFileSync(join(root,"tsconfig.json"),"utf8"));
const files=[];
function walk(dir){for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory())walk(path);else files.push(path)}}
walk(join(root,"src"));
for(const file of files.filter(file=>/\.(ts|tsx)$/.test(file))){
  const source=readFileSync(file,"utf8");
  const imports=[...source.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)].map(match=>match[1]);
  for(const specifier of imports.filter(value=>value.startsWith("@/")||value.startsWith("."))){
    const base=specifier.startsWith("@/")?join(root,"src",specifier.slice(2)):resolve(dirname(file),specifier);
    const candidates=[base,`${base}.ts`,`${base}.tsx`,`${base}.css`,join(base,"index.ts"),join(base,"index.tsx")];
    if(!candidates.some(candidate=>{try{return statSync(candidate).isFile()}catch{return false}}))throw new Error(`Unresolved import ${specifier} in ${relative(root,file)}`);
  }
}
const clientFiles=files.filter(file=>/\.(ts|tsx)$/.test(file)&&readFileSync(file,"utf8").startsWith('"use client"'));
for(const file of clientFiles){const source=readFileSync(file,"utf8");for(const secret of ["SUPABASE_SERVICE_ROLE_KEY","LIVEKIT_API_SECRET"]){if(source.includes(secret))throw new Error(`${secret} leaked into ${relative(root,file)}`)}}
const sql=readFileSync(join(root,"supabase/migrations/202609100001_initial.sql"),"utf8");
for(const requirement of ["enable row level security","record_game_event","p_idempotency_key","for update","undo_game_event","consume_rate_limit"]){if(!sql.toLowerCase().includes(requirement))throw new Error(`Migration is missing ${requirement}`)}
console.log(`PASS: ${files.length} source files checked; local imports resolve; server secrets are absent from client modules; security and scoring primitives are present.`);
