import { simulate, stats } from './analysis/ah039_1h_volatility_squeeze_breakout.mjs';
let p=0,f=0;const ok=(x,n)=>{if(x){p++;console.log(`PASS ${n}`)}else{f++;console.log(`FAIL ${n}`)}};
const b=[{o:100,h:101,l:99,c:100},{o:100,h:102,l:99.1,c:101},{o:101,h:106,l:100,c:105}];
const x=simulate(b,{i:0,s:{high:101,low:99,a:1}},'LONG');ok(x?.reason==='TARGET'&&x.entryIndex===1,'next-open long target');
const y=simulate([{o:100,h:101,l:99,c:100},{o:100,h:120,l:80,c:100}],{i:0,s:{high:101,low:99,a:1}},'LONG');ok(y?.reason==='AMBIGUOUS_ADVERSE','adverse same-bar ordering');
const s=stats([{bps:30,symbol:'A',day:'d',reason:'TARGET'},{bps:-20,symbol:'B',day:'e',reason:'STOP'}]);ok(s.n===2&&s.net_mean_bps===-6&&s.exits.TARGET===1,'costed statistics');
console.log(`TEST AH039: ${p} passed, ${f} failed`);process.exitCode=f?1:0;
