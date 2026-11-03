let handler:(()=>Promise<void>)|undefined;
export function registerCRMFlush(next:()=>Promise<void>){handler=next;return()=>{if(handler===next)handler=undefined;};}
export async function flushCRMChanges(){await handler?.();}
let refreshHandler:(()=>Promise<void>)|undefined;
export function registerCRMRefresh(next:()=>Promise<void>){refreshHandler=next;return()=>{if(refreshHandler===next)refreshHandler=undefined;};}
export async function refreshCRMChanges(){await flushCRMChanges();await refreshHandler?.();}
