"use client";
import {useState} from "react";
import {FileDown} from "lucide-react";
import {Button} from "@/components/ui";
import {flushCRMChanges} from "@/lib/crmSync";
import {toast} from "@/components/shell/toast";
export function ProposalDownload({id}:{id:string}){const [busy,setBusy]=useState(false);return <Button loading={busy} size="sm" icon={<FileDown size={14}/>} onClick={async()=>{setBusy(true);try{await flushCRMChanges();const response=await fetch(`/api/proposals/${encodeURIComponent(id)}/pdf`,{cache:"no-store",signal:AbortSignal.timeout(45000)});if(!response.ok)throw new Error((await response.json()).error??"PDF export failed");const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download=`proposal-${id}.pdf`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(error){toast("PDF export failed",error instanceof Error?error.message:"Please retry","warning");}finally{setBusy(false);}}}>Download PDF</Button>;}
