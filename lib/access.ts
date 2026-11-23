export type SchoolRole='admin'|'viewer'|'denied';
export function roleFor(email:string|undefined,adminEmail:string|undefined,members:any[]):SchoolRole{if(!email)return 'denied';const key=email.trim().toLowerCase();if(adminEmail&&key===adminEmail.trim().toLowerCase())return 'admin';return members.some(m=>m.email===key&&m.active===true)?'viewer':'denied';}
export function canWrite(role:SchoolRole){return role==='admin';}
