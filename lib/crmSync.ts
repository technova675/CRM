let handler:(()=>Promise<void>)|undefined;
export function registerCRMFlush(next:()=>Promise<void>){handler=next;return()=>{if(handler===next)handler=undefined;};}
export async function flushCRMChanges(){await handler?.();}
