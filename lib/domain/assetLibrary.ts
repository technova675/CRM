import type {Asset} from "../types";

export const MAX_LIBRARY_ASSET_BYTES = 100 * 1024 * 1024;

export const hasAssetFile=(asset:Asset)=>asset.versions.some(version=>!!version.file);
export function assetVersionFingerprint(asset:Asset) {
  return JSON.stringify([asset.clientId,asset.name,asset.ext,asset.sizeKb,asset.versions.map(v=>[
    v.v,v.at,v.by,v.note,v.file?[v.file.id,v.file.name,v.file.size,v.file.sha256,v.file.knowledgeText]:null,
  ])]);
}

export function assetWriteIssue(before:Asset[],after:Asset[]) {
  const previous=new Map(before.map(asset=>[asset.id,asset])),next=new Map(after.map(asset=>[asset.id,asset]));
  for(const item of before){
    if(!hasAssetFile(item))continue;
    const saved=next.get(item.id);
    if(!saved||assetVersionFingerprint(item)!==assetVersionFingerprint(saved))return "Stored file versions can only be changed through Documents & Assets. Reload the latest library.";
  }
  for(const item of after)if(hasAssetFile(item)&&(!previous.has(item.id)||!hasAssetFile(previous.get(item.id)!)))
    return "Upload files through Documents & Assets to add a stored version.";
}
