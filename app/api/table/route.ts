
import { env } from 'cloudflare:workers';
import {fresh,player,deal,act,view,restart,kick,setPremove,settlePremoves, type Room} from '../../../lib/poker';
export async function POST(req:Request){try{const b=await req.json() as {token:string,room:string,action:string,name:string,amount:number,hand:number,version:number,target?:number,kind?:string};const id=b.token;if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('Please reload to reconnect.');const db=env.DB!;let room=b.room;
if(b.action==='create'){room=crypto.randomUUID();const r=fresh(id,String(b.name||'Player').trim().slice(0,20)||'Player');await db.prepare('INSERT INTO rooms (id,state,version) VALUES (?,?,0)').bind(room,JSON.stringify(r)).run();return Response.json({room,state:view(r,id)})}
if(typeof room!=='string'||room.length>50)throw Error('Invalid invite link.');
for(let attempt=0;attempt<5;attempt++){const row=await db.prepare('SELECT state,version FROM rooms WHERE id=?').bind(room).first<{state:string,version:number}>();if(!row)throw Error('Table not found. Check your invite link.');const r:Room=JSON.parse(row.state);let p=r.players.find(p=>p.id===id);let changed=false;
if(b.action==='join'&&!p){if(r.players.length>=6)throw Error('This table is full (6 seats).');p=player(id,String(b.name||'Player').trim().slice(0,20)||'Player');r.players.push(p);changed=true}
if(!p)throw Error('Your seat was removed. You can rejoin with the invite link.');
if(r.turn>=0&&r.deadline>Date.now()+30000){r.deadline=Date.now()+30000;changed=true}
if(r.turn>=0&&Date.now()>r.deadline){const current=r.players[r.turn];act(r,current.id,current.bet===r.current?'call':'fold');changed=true;if(['fold','call','raise'].includes(b.action))b.action='poll'}
if(b.action==='restart'||b.action==='kick'){if(id!==r.host)throw Error('Only the host can manage the table.');if(b.action==='restart')restart(r);else kick(r,Number(b.target));changed=true}
if(b.action==='grant'){if(id!==r.host)throw Error('Only the host can add chips.');const target=Number(b.target),amount=Number(b.amount);if(!Number.isInteger(target)||target<0||target>=r.players.length||!Number.isInteger(amount)||amount<1||amount>100000)throw Error('Choose a player and enter 1–100,000 chips.');if(r.players[target].chips+amount>1000000000)throw Error('That stack is too large.');r.players[target].chips+=amount;changed=true}
if(b.action==='pre'){if(b.version!==row.version||b.hand!==r.hand)throw Error('The table changed. Choose your advance move again.');setPremove(r,id,String(b.kind||'none'));changed=true}
if(b.action==='deal'){if(id!==r.host)throw Error('Only the host can deal.');deal(r);changed=true}
if(['fold','call','raise'].includes(b.action)){if(b.hand!==r.hand||b.version!==row.version)throw Error('Table changed. Try your action again.');act(r,id,b.action,b.amount);changed=true}
if(b.action==='rebuy'){if(!['lobby','showdown'].includes(r.street)||p.chips>0)throw Error('You can refill an empty stack between hands.');p.chips=1000;changed=true}
if(settlePremoves(r))changed=true;
if(changed){const res=await db.prepare('UPDATE rooms SET state=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(r),room,row.version).run();if(!res.meta.changes)continue}
return Response.json({room,version:row.version+(changed?1:0),state:view(r,id)},{headers:{'Cache-Control':'no-store'}})}throw Error('Table is busy. Try again.');}catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to connect.'},{status:400})}}
