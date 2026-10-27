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
  const row=await json<any>('/settings',{method:'PUT',body:JSON.stringify(settings)});
  return {festivalName:row.festival_name,kioskActive:row.kiosk_active,activeSite:row.active_site,
    welcomeMessage:row.welcome_message,termsSummary:row.terms_summary,
    maxDrawsPerParticipant:row.max_draws_per_participant,updatedAt:row.updated_at};
}
export async function getPostgresInventory() {
  return json<any[]>('/inventory');
}
export async function getPostgresDrawHistory(limit=50) {
  return json<any[]>('/draws?limit='+Math.max(1,Math.min(200,limit)));
}
export async function updatePostgresRemaining(prizeId:string,site:'PDD'|'PS',remainingQuantity:number) {
  return json<any>('/inventory/'+encodeURIComponent(prizeId)+'/'+site+'/quantity',{
    method:'POST',body:JSON.stringify({remainingQuantity}),
  });
}
