import type { MEDIA_PLATFORMS } from "./performance";

export type SyncPlatform = typeof MEDIA_PLATFORMS[number];
export type IntegrationRun = {
  id:string;
  retryOf?:string;
  platform:SyncPlatform;
  campaignId:string;
  campaignName:string;
  accountId:string;
  start:string;
  end:string;
  startedAt:string;
  finishedAt?:string;
  status:"Running"|"Succeeded"|"Failed";
  rows?:number;
  error?:string;
};

export function visibleSyncRun(run:IntegrationRun, now=Date.now()):IntegrationRun {
  if(run.status!=="Running" || now-Date.parse(run.startedAt)<180000)return run;
  return {...run,status:"Failed",error:"The previous sync was interrupted. Retry the same window."};
}

export const MAX_SYNC_RUNS = 150;
