import {PDFDocument,rgb,type PDFFont} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import type {Proposal} from "./types";
import {proposalValue} from "./domain/proposal";

export async function proposalPDF(proposal:Proposal,agency="Adbibe"){
 const document=await PDFDocument.create();document.registerFontkit(fontkit);
 const [regularBytes,boldBytes]=await Promise.all([readFile(join(process.cwd(),"public/fonts/NotoSans-Regular.ttf")),readFile(join(process.cwd(),"public/fonts/NotoSans-Bold.ttf"))]);
 const regular=await document.embedFont(regularBytes,{subset:true}),bold=await document.embedFont(boldBytes,{subset:true}),characters=new Set(regular.getCharacterSet());
 const snapshot=proposal.clientSnapshot??{company:proposal.company};
 const textToPrint=[proposal.title,agency,snapshot.company,snapshot.contactName,snapshot.industry,snapshot.location,snapshot.website,proposal.strategySummary,...proposal.lines.map(l=>`${l.service} ${l.description}`),...(proposal.deliverables??[]),...(proposal.timeline??[]).flatMap(t=>[t.phase,t.weeks,t.detail]),...(proposal.terms??[])].filter(Boolean).join("\n");
 if(textToPrint.length>200000)throw new Error("Proposal is too long to export. Reduce the content and try again.");
 if([...textToPrint].some(char=>!/[\n\r\t]/.test(char)&&!characters.has(char.codePointAt(0)!)))throw new Error("This proposal contains characters unsupported by the PDF font. Use the print preview or revise those characters; no blank text PDF was generated.");
 const width=595.28,height=841.89,margin=46,contentWidth=width-margin*2;
 let page=document.addPage([width,height]),y=height-margin;
 const newPage=()=>{if(document.getPageCount()>=50)throw new Error("Proposal exceeds the 50-page PDF limit.");page=document.addPage([width,height]);y=height-margin;};
 const ensure=(space:number)=>{if(y-space<58)newPage();};
 const paragraph=(value:string,size=10,font:PDFFont=regular,color=rgb(.16,.18,.24))=>{
  for(const raw of value.replace(/\r/g,"").split("\n")){const words=raw.split(/\s+/).filter(Boolean);let line="";const lines:string[]=[];
   for(const word of words){if(font.widthOfTextAtSize(word,size)>contentWidth){if(line){lines.push(line);line="";}let chunk="";for(const char of word){if(font.widthOfTextAtSize(chunk+char,size)>contentWidth){lines.push(chunk);chunk="";}chunk+=char;}line=chunk;continue;}if(font.widthOfTextAtSize(line?`${line} ${word}`:word,size)>contentWidth){lines.push(line);line=word;}else line=line?`${line} ${word}`:word;}
   if(line)lines.push(line);if(!lines.length)lines.push("");for(const line of lines){ensure(size*1.6);page.drawText(line,{x:margin,y,size,font,color});y-=size*1.55;}
  }y-=5;
 };
 const heading=(title:string)=>{ensure(65);y-=10;paragraph(title,14,bold,rgb(.37,.20,.78));};
 paragraph(agency.toUpperCase(),11,bold,rgb(.37,.20,.78));paragraph(proposal.title,23,bold);paragraph(`Prepared for ${snapshot.company}`,12,bold);
 if(snapshot.contactName)paragraph(`Contact: ${snapshot.contactName}`);
 if(snapshot.industry||snapshot.location)paragraph([snapshot.industry,snapshot.location].filter(Boolean).join(" · "));
 if(snapshot.website)paragraph(snapshot.website);
 paragraph(`Status: ${proposal.status} · Valid until ${proposal.expiresAt.slice(0,10)} · Proposed duration: ${proposal.durationMonths??12} months`,9);
 if(proposal.approval!=="Approved"&&proposal.status!=="Accepted")paragraph("DRAFT — FOR INTERNAL REVIEW",11,bold,rgb(.66,.33,.07));
 heading("Proposal summary");paragraph(proposal.strategySummary||"Proposed engagement scope and commercial terms for review.");
 heading("Services & investment");for(const line of proposal.lines){paragraph(`${line.service} — ${line.billing}`,11,bold);paragraph(line.description);paragraph(`INR ${line.price.toLocaleString("en-IN")}${line.billing==="monthly"?" / month":" one-time"}`,11,bold);}
 paragraph(`Proposed ${proposal.durationMonths??12}-month value: INR ${proposalValue(proposal).toLocaleString("en-IN")}`,12,bold);
 heading("Deliverables");for(const item of proposal.deliverables??[])paragraph(`• ${item}`);
 heading("Proposed timeline");for(const row of proposal.timeline??[]){ensure(55);paragraph(`${row.phase} · ${row.weeks}`,11,bold);paragraph(row.detail);}
 heading("Commercial terms");for(const term of proposal.terms?.length?proposal.terms:["Commercial terms, taxes, payment schedule and exclusions must be confirmed before acceptance."])paragraph(`• ${term}`);
 paragraph("Scope and dates are proposed and depend on agreed access, approvals and delivery requirements. This document does not constitute an electronic signature.",9);
 const pages=document.getPages();pages.forEach((p,i)=>{p.drawLine({start:{x:margin,y:42},end:{x:width-margin,y:42},color:rgb(.83,.83,.88),thickness:.5});p.drawText(`${agency} · ${i+1} / ${pages.length}`,{x:margin,y:27,size:8,font:regular,color:rgb(.4,.42,.48)});});
 document.setTitle(proposal.title);document.setAuthor(agency);return document.save();
}
