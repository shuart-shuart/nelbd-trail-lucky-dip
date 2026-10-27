import type { PrizeWithInventory, SiteInventory } from '../firebase/types';
import type { Setting } from '../firebase/types';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/admin'+path,{
    ...init,credentials:'same-origin',
    headers:{'Content-Type':'application/json',...init?.headers},
  });
  if(!response.ok) {
    const error=await response.json().catch(()=>({error:'Request failed'}));
    throw new Error(error.error||'Request failed');
  }
  return response.json() as Promise<T>;
}
export async function postgresAdminLogin(email:string,password:string) {
  return json<{id:string;email:string;role:string;siteAccess:string}>('/login',{
    method:'POST',body:JSON.stringify({email,password}),
  });
}
export async function postgresAdminMe() {
  return json<{id:string;email:string;role:string;siteAccess:string}>('/me');
}
export async function postgresAdminLogout() {
  return json<{ok:boolean}>('/logout',{method:'POST'});
}
export async function getPostgresSettings(): Promise<Setting> {
  const row=await json<any>('/settings');
  return {festivalName:row.festival_name,kioskActive:row.kiosk_active,activeSite:row.active_site,
    welcomeMessage:row.welcome_message,termsSummary:row.terms_summary,
    maxDrawsPerParticipant:row.max_draws_per_participant,updatedAt:row.updated_at};
}
export async function savePostgresSettings(settings:Setting):Promise<Setting> {
  const row=await json<any>('/settings',{method:'PUT',body:JSON.stringify({...settings,maxDrawsPerParticipant:1})});
  return {festivalName:row.festival_name,kioskActive:row.kiosk_active,activeSite:row.active_site,
    welcomeMessage:row.welcome_message,termsSummary:row.terms_summary,
    maxDrawsPerParticipant:row.max_draws_per_participant,updatedAt:row.updated_at};
}
export async function getPostgresInventory() {
  return json<any[]>('/inventory');
}
export async function getPostgresDrawHistory(limit=50,offset=0) {
  return json<any[]>('/draws?limit='+Math.max(1,Math.min(500,limit))+'&offset='+Math.max(0,offset));
}
export async function getAllPostgresDrawHistory() {
  const all:any[]=[];
  for(let offset=0;offset<1000000;offset+=500) {
    const page=await getPostgresDrawHistory(500,offset);
    all.push(...page);
    if(page.length<500)return all;
  }
  throw new Error('History export exceeded safety limit');
}
export async function updatePostgresRemaining(prizeId:string,site:'PDD'|'PS',remainingQuantity:number) {
  return json<any>('/inventory/'+encodeURIComponent(prizeId)+'/'+site+'/quantity',{
    method:'POST',body:JSON.stringify({remainingQuantity}),
  });
}

export async function getPostgresPrizesWithInventory(): Promise<PrizeWithInventory[]> {
  const rows=await getPostgresInventory();
  const grouped=new Map<string,any>();
  for(const row of rows) {
    const prize=grouped.get(row.id)||{
      id:row.id,name:row.name,description:row.description,tier:row.tier,
      icon:row.icon,imageUrl:row.imageUrl,isActive:row.isActive,
      createdAt:'',updatedAt:''
    };
    const inv:SiteInventory={
      id:row.id+'_'+row.site,prizeId:row.id,site:row.site,
      allocatedQuantity:row.allocatedQuantity,remainingQuantity:row.remainingQuantity,
      claimedQuantity:row.claimedQuantity,updatedAt:''
    };
    if(row.site==='PDD') prize.pddInventory=inv;
    else prize.psInventory=inv;
    grouped.set(row.id,prize);
  }
  return Array.from(grouped.values()).filter(p=>p.pddInventory&&p.psInventory).map(p=>({
    ...p,totalAllocated:p.pddInventory.allocatedQuantity+p.psInventory.allocatedQuantity,
    totalRemaining:p.pddInventory.remainingQuantity+p.psInventory.remainingQuantity,
    totalClaimed:p.pddInventory.claimedQuantity+p.psInventory.claimedQuantity,
  }));
}
export async function getPostgresDashboardStats():Promise<{totalDraws:number;totalParticipants:number;todayDraws:any[]}> {
  return json('/dashboard-stats');
}

export async function getPostgresParticipants(limit=500,offset=0):Promise<import('../firebase/types').Participant[]> {
  return json('/participants?limit='+Math.min(1000,Math.max(1,limit))+'&offset='+Math.max(0,offset));
}
export async function getAllPostgresParticipants() {
  const all:import('../firebase/types').Participant[]=[];
  for(let offset=0;offset<1000000;offset+=1000) {
    const page=await getPostgresParticipants(1000,offset);
    all.push(...page);
    if(page.length<1000)return all;
  }
  throw new Error('Participant export exceeded safety limit');
}
export async function getPostgresInventoryAdjustments():Promise<import('../firebase/types').InventoryAdjustment[]> {
  return json('/inventory-adjustments');
}
