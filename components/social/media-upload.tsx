"use client";
import {useState} from "react";
import {Upload} from "lucide-react";

/** Uploads images or a video straight to the media bucket and hands back each public link. */
export function MediaUpload({clientId,onUploaded}:{clientId:string;onUploaded:(url:string)=>void}){
  const [busy,setBusy]=useState(""),[error,setError]=useState("");
  const upload=async(files:FileList)=>{
    setError("");
    for(const file of Array.from(files)){
      setBusy(file.name);
      try{
        const r=await fetch("/api/social/media",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clientId,contentType:file.type,size:file.size})});
        const target=await r.json().catch(()=>({}));if(!r.ok)throw new Error(target.error??"Upload could not start.");
        const put=await fetch(target.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type},body:file});
        if(!put.ok)throw new Error(`Storage refused the file (HTTP ${put.status}). Check the bucket's CORS settings.`);
        onUploaded(target.publicUrl);
      }catch(e){setError(`${file.name}: ${e instanceof Error?e.message:"upload failed"}`);break;}
    }
    setBusy("");
  };
  return <div className="space-y-1">
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm hover:border-accent">
      <Upload className="size-4"/>{busy?`Uploading ${busy}…`:"Upload images or a video"}
      <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" className="sr-only" disabled={!!busy} onChange={e=>{const f=e.target.files;if(f?.length)void upload(f);e.target.value="";}}/>
    </label>
    <p className="text-xs text-fg-3">Images up to 20 MB, videos (MP4 or MOV) up to 500 MB. Files go to your media storage and get a public link the networks can fetch.</p>
    {error&&<p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
