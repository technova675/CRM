// Imports a creators CSV exported from the earlier influencer site into the talent pool of one CRM account.
// Usage: node --env-file=.env.local scripts/import-creators.mjs <owner-user-id> <path-to-creators_rows.csv> [--dry-run]
// Re-running is safe: rows keep their original IDs and are updated in place.
import {readFile} from 'node:fs/promises';
import Papa from 'papaparse';
import {supabaseRequest} from '../lib/db.ts';
import {creatorFromCsv} from '../lib/domain/creators.ts';

const [owner,file,flag]=process.argv.slice(2);
if(!/^[0-9a-f-]{36}$/i.test(owner??'')||!file){console.error('Usage: import-creators.mjs <owner-user-id> <csv> [--dry-run]');process.exit(1);}
const parsed=Papa.parse((await readFile(file,'utf8')).replace(/^﻿/,''),{header:true,skipEmptyLines:true});
if(parsed.errors.length){console.error('CSV could not be read:',parsed.errors[0].message);process.exit(1);}

const rows=[],problems=[];
parsed.data.forEach((raw,i)=>{
  try{
    const row=creatorFromCsv(raw,owner);
    if(!/^[0-9a-f-]{36}$/i.test(row.id))throw new Error('missing id');
    if(row.full_name.length<2)throw new Error('name too short');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))throw new Error('invalid email');
    if(row.bio&&row.bio.length>800)row.bio=row.bio.slice(0,800);
    rows.push(row);
  }catch(e){problems.push(`Row ${i+2}: ${e.message}`);}
});
const emails=new Map();for(const r of rows){const k=r.email.toLowerCase();if(emails.has(k))problems.push(`Duplicate email in file (rows for ${r.id} and ${emails.get(k)}) — the later one is skipped`);else emails.set(k,r.id);}
const unique=rows.filter(r=>emails.get(r.email.toLowerCase())===r.id);

// Never take over a row that belongs to another account.
const existing=await supabaseRequest('creators',{query:{select:'id,owner_id',id:`in.(${unique.map(r=>r.id).join(',')})`}});
const foreign=existing.filter(r=>r.owner_id!==owner);
if(foreign.length){console.error(`${foreign.length} row(s) already belong to another account. Nothing imported.`);process.exit(1);}

console.log(`Read ${parsed.data.length} rows · ready ${unique.length} · already present ${existing.length} · problems ${problems.length}`);
for(const p of problems)console.log('  -',p);
if(flag==='--dry-run'){console.log('Dry run: nothing written.');process.exit(0);}
for(let i=0;i<unique.length;i+=200)
  await supabaseRequest('creators',{method:'POST',query:{on_conflict:'id'},prefer:'resolution=merge-duplicates,return=minimal',body:unique.slice(i,i+200),timeoutMs:30000});
const [{count}]=await supabaseRequest('creators',{query:{select:'count',owner_id:`eq.${owner}`}});
console.log(`Imported. The talent pool for this account now has ${count} creator(s).`);
