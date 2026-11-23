import {PDFDocument,rgb,type PDFFont,type PDFPage} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import type {Client,Invoice} from "./types";
import type {TaxProfile} from "./domain/tenant";
import {gstBreakdown,partyState,rupeesInWords} from "./domain/gst";
import {invoiceTds,receipts} from "./domain/billing";

type Agency={name:string;email:string;tax:TaxProfile};

/**
 * A4 invoice in the layout Indian clients expect: supplier and recipient with GSTIN and state, SAC, taxable value,
 * CGST+SGST for the same state or IGST across states, the total in words, payments and TDS received, and the balance due.
 * Invoices created before GST support print as plain invoices with no tax lines.
 */
export async function invoicePDF(invoice:Invoice,client:Client,agency:Agency){
 const document=await PDFDocument.create();document.registerFontkit(fontkit);
 const [regularBytes,boldBytes]=await Promise.all([readFile(join(process.cwd(),"public/fonts/NotoSans-Regular.ttf")),readFile(join(process.cwd(),"public/fonts/NotoSans-Bold.ttf"))]);
 const regular=await document.embedFont(regularBytes,{subset:true}),bold=await document.embedFont(boldBytes,{subset:true});
 const glyphs=new Set(regular.getCharacterSet());
 // Characters outside the font would print as blanks; replace them rather than produce a misleading document.
 const safe=(text:string)=>[...text].map(char=>/[\n\r\t]/.test(char)||glyphs.has(char.codePointAt(0)!)?char:"?").join("");
 const rupee=glyphs.has(0x20b9)?"₹":"INR ";
 const day=(iso:string)=>new Date(iso).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Kolkata"});
 const money=(n:number)=>rupee+n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

 const taxable=invoice.taxable??invoice.amount,rate=invoice.taxable===undefined?0:invoice.gstRate??0;
 const supplierState=partyState(agency.tax.gstin,agency.tax.state),buyerState=partyState(client.gstin,client.billingState);
 const tax=gstBreakdown(taxable,rate,supplierState,buyerState);
 const taxInvoice=rate>0&&!!agency.tax.gstin;
 const cash=receipts(invoice).reduce((sum,item)=>sum+item.amount,0),tds=invoiceTds(invoice);
 const due=Math.max(0,Math.round((invoice.amount-invoice.paid)*100)/100);

 const width=595.28,height=841.89,margin=44,ink=rgb(.13,.15,.2),muted=rgb(.42,.44,.5),accent=rgb(.37,.2,.78),line=rgb(.84,.84,.88);
 const page:PDFPage=document.addPage([width,height]);let y=height-margin;
 const text=(value:string,x:number,top:number,size=9.5,font:PDFFont=regular,color=ink)=>page.drawText(safe(value),{x,y:top,size,font,color});
 const right=(value:string,xRight:number,top:number,size=9.5,font:PDFFont=regular,color=ink)=>{const v=safe(value);page.drawText(v,{x:xRight-font.widthOfTextAtSize(v,size),y:top,size,font,color});};
 /** Wraps within a column and returns the new baseline below the last line. */
 const wrap=(value:string,x:number,top:number,maxWidth:number,size=9.5,font:PDFFont=regular,color=ink)=>{
  let cursor=top;
  for(const raw of safe(value).split(/\r?\n/)){let current="";for(const word of raw.split(/\s+/).filter(Boolean)){const next=current?`${current} ${word}`:word;if(font.widthOfTextAtSize(next,size)>maxWidth&&current){page.drawText(current,{x,y:cursor,size,font,color});cursor-=size*1.45;current=word;}else current=next;}
   page.drawText(current,{x,y:cursor,size,font,color});cursor-=size*1.45;}
  return cursor;
 };

 // Header: supplier on the left, document title and numbers on the right.
 const legal=agency.tax.legalName||agency.name;
 let left=wrap(legal,margin,y,300,15,bold);
 if(agency.tax.address)left=wrap(agency.tax.address,margin,left,300,9,regular,muted);
 for(const row of [agency.tax.gstin&&`GSTIN: ${agency.tax.gstin}`,agency.tax.pan&&`PAN: ${agency.tax.pan}`,supplierState&&`State: ${supplierState}`,agency.email].filter(Boolean) as string[])left=wrap(row,margin,left,300,9,regular,muted);
 right(taxInvoice?"TAX INVOICE":"INVOICE",width-margin,y,16,bold,accent);
 let top=y-22;
 for(const [label,value] of [["Invoice no.",invoice.number],["Invoice date",day(invoice.issuedAt)],["Due date",day(invoice.dueDate)],...(taxInvoice?[["Place of supply",buyerState||"Not recorded"]]:[])] as [string,string][]){right(`${label}: ${value}`,width-margin,top,9.5,regular);top-=14;}
 y=Math.min(left,top)-10;
 page.drawLine({start:{x:margin,y},end:{x:width-margin,y},thickness:.7,color:line});y-=18;

 // Recipient.
 text("BILL TO",margin,y,8.5,bold,muted);y-=14;
 y=wrap(client.company,margin,y,330,11,bold);
 if(client.billingAddress)y=wrap(client.billingAddress,margin,y,330,9,regular,muted);
 for(const row of [client.gstin&&`GSTIN: ${client.gstin}`,buyerState&&`State: ${buyerState}`].filter(Boolean) as string[])y=wrap(row,margin,y,330,9,regular,muted);
 y-=10;

 // Line item table.
 const cols={no:margin+6,desc:margin+28,sac:width-margin-210,amount:width-margin-6};
 page.drawRectangle({x:margin,y:y-6,width:width-margin*2,height:20,color:rgb(.95,.94,.98)});
 text("#",cols.no,y,8.5,bold,muted);text("Description",cols.desc,y,8.5,bold,muted);if(taxInvoice)text("SAC",cols.sac,y,8.5,bold,muted);right("Taxable value",cols.amount,y,8.5,bold,muted);
 y-=22;
 text("1",cols.no,y);const after=wrap(invoice.description||"Professional services",cols.desc,y,(taxInvoice?cols.sac:cols.amount-110)-cols.desc-12);
 if(taxInvoice)text(invoice.sac??"",cols.sac,y);right(money(tax.taxable),cols.amount,y);
 y=after-6;page.drawLine({start:{x:margin,y},end:{x:width-margin,y},thickness:.5,color:line});y-=16;

 // Totals.
 const label=width-margin-220;
 const total=(name:string,value:string,strong=false)=>{text(name,label,y,strong?10.5:9.5,strong?bold:regular,strong?ink:muted);right(value,cols.amount,y,strong?10.5:9.5,strong?bold:regular);y-=strong?18:15;};
 total("Taxable value",money(tax.taxable));
 if(rate>0){if(tax.intra){total(`CGST @ ${rate/2}%`,money(tax.cgst));total(`SGST @ ${rate/2}%`,money(tax.sgst));}else total(`IGST @ ${rate}%`,money(tax.igst));}
 page.drawLine({start:{x:label,y:y+9},end:{x:width-margin,y:y+9},thickness:.5,color:line});
 total("Invoice total",money(invoice.amount),true);
 y=wrap(`Amount in words: ${rupeesInWords(invoice.amount)}`,margin,y-2,width-margin*2,9,regular,muted)-4;
 if(rate>0&&!agency.tax.gstin)y=wrap("GST is shown at the selected rate but the supplier GSTIN is not set. Add it in Settings → Plan & usage before sending.",margin,y,width-margin*2,8.5,bold,rgb(.66,.33,.07))-4;
 if(rate>0&&!buyerState)y=wrap("The client's state is not recorded, so IGST is applied. Add the client GSTIN or billing state for CGST+SGST.",margin,y,width-margin*2,8.5,regular,muted)-4;

 // Settlement.
 if(invoice.paid>0){y-=6;total("Received",money(cash));if(tds>0)total("TDS deducted by client",money(tds));total("Balance due",money(due),true);}
 else{y-=6;total("Balance due",money(due),true);}

 // Payment instructions and sign-off.
 if(agency.tax.paymentInstructions){y-=6;text("PAYMENT DETAILS",margin,y,8.5,bold,muted);y=wrap(agency.tax.paymentInstructions,margin,y-14,width-margin*2,9.5);}
 const base=70;
 right(`For ${legal}`,width-margin,base+36,9.5,bold);
 right("Authorised signatory",width-margin,base,8.5,regular,muted);
 page.drawLine({start:{x:margin,y:base-14},end:{x:width-margin,y:base-14},thickness:.5,color:line});
 text("This is a computer-generated invoice.",margin,base-28,8,regular,muted);
 if(y<base+60)throw new Error("The invoice text is too long for one page. Shorten the description or payment details.");
 return document.save();
}
