import { simulate, stats } from './analysis/ah040_1h_impulse_mean_reversion.mjs';
let p=0,f=0;const ok=(x,n)=>{if(x){p++;console.log(`PASS ${n}`)}else{f++;console.log(`FAIL ${n}`)}};
const b=[{o:105,h:106,l:104,c:105},{o:104,h:105,l:103,c:104},{o:103,h:104,l:102,c:103},{o:102,h:103,l:101,c:102},{o:101,h:102,l:100,c:101},{o:100,h:101,l:95,c:96},{o:97,h:100,l:96,c:99},{o:100,h:106,l:99,c:105}];
const x=simulate(b,{i:5,a:1},'LONG');ok(x?.reason==='TARGET'&&x.entryIndex===7,'confirmed next-open long target');
const y=simulate([...b.slice(0,7),{o:100,h:120,l:80,c:100}],{i:5,a:1},'LONG');ok(y?.reason==='AMBIGUOUS_ADVERSE','adverse same-bar ordering');
const s=stats([{bps:30,symbol:'A',day:'d',reason:'TARGET'},{bps:-20,symbol:'B',day:'e',reason:'STOP'}]);ok(s.n===2&&s.net_mean_bps===-6&&s.exits.TARGET===1,'costed statistics');
console.log(`TEST AH040: ${p} passed, ${f} failed`);process.exitCode=f?1:0;
