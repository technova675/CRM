import { strToU8, zipSync } from "fflate";
import { reportSections, type ClientReport } from "./domain/clientReporting";

const xml = (s: unknown) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P = "http://schemas.openxmlformats.org/package/2006";
const M = "application/vnd.openxmlformats-officedocument.";
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PP = "http://schemas.openxmlformats.org/presentationml/2006/main";
const relations = (items: [string,string][]) => '<Relationships xmlns="'+P+'/relationships">'+items.map(([type,target],i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+R+'/'+type+'" Target="'+target+'"/>').join("")+'</Relationships>';
const content = (parts: [string,string][]) => '<Types xmlns="'+P+'/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+parts.map(([path,type])=>'<Override PartName="/'+path+'" ContentType="'+M+type+'+xml"/>').join("")+'</Types>';
const zip = (parts: Record<string,string>) => zipSync(Object.fromEntries(Object.entries(parts).map(([name,value])=>[name,strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+value)])));
const status = (report:ClientReport) => report.approved ? "Approved" : "Draft · Internal review";
const period = (report:ClientReport) => report.facts.window.start + " to " + report.facts.window.end;

export function reportSpreadsheet(report: ClientReport) {
  const sections: {title:string;rows:(string|number|null|undefined)[][]}[] = reportSections(report);
  sections.unshift({title:"Overview",rows:[[report.facts.company], [report.frequency+" report"], [period(report)], [status(report)], [report.facts.source]]});
  for (const section of sections) {
    if (section.title === "Metrics") section.rows = [
      ["Metric","Current","Previous","Measured rows","Total rows","Currency"],
      ...report.facts.stats.map(s=>[s.label,s.current,s.previous,s.measured,report.facts.rowCount,["spend","cpa","revenue"].includes(s.key)?report.facts.currency:null]),
      ["Blank values are unavailable. Reach is the value of a single source row."],
    ];
    if (section.title === "Campaign performance" || section.title === "Creative performance") {
      const items = section.title === "Campaign performance" ? report.facts.campaigns : report.facts.creatives;
      if (items.length) section.rows = [["Name","Spend","Leads","Conversions","CPA","ROAS","Revenue","Currency"],
        ...items.map(item=>[item.name,item.spend,item.leads,item.conversions,item.cpa,item.roas,item.revenue,report.facts.currency])];
    }
  }
  const parts: Record<string,string> = {
    "_rels/.rels":relations([["officeDocument","xl/workbook.xml"]]),
    "xl/workbook.xml":'<workbook xmlns="'+S+'" xmlns:r="'+R+'"><sheets>'+sections.map((s,i)=>'<sheet name="'+xml(s.title.slice(0,31))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>',
    "xl/_rels/workbook.xml.rels":relations(sections.map((_,i)=>["worksheet","worksheets/sheet"+(i+1)+".xml"])),
    "[Content_Types].xml":content([["xl/workbook.xml","spreadsheetml.sheet.main"],...sections.map((_,i):[string,string]=>["xl/worksheets/sheet"+(i+1)+".xml","spreadsheetml.worksheet"])]),
  };
  sections.forEach((section,i)=>{
    const width = Math.max(...section.rows.map(row=>row.length));
    const rows = section.rows.map((row,index)=>'<row r="'+(index+1)+'">'+row.map((value,col)=>{
      if (value==null) return "";
      const ref = String.fromCharCode(65+col)+(index+1);
      return typeof value==="number" ? '<c r="'+ref+'"><v>'+value+'</v></c>' : '<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
    }).join("")+'</row>').join("");
    parts["xl/worksheets/sheet"+(i+1)+".xml"]='<worksheet xmlns="'+S+'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="'+(width===1?100:44)+'" customWidth="1"/>'+(width>1?'<col min="2" max="'+width+'" width="26" customWidth="1"/>':'')+'</cols><sheetData>'+rows+'</sheetData></worksheet>';
  });
  return zip(parts);
}

const group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const space = ' xmlns:a="'+A+'" xmlns:r="'+R+'" xmlns:p="'+PP+'"';
const shape = (id:number, lines:string[], y:number, height:number, size:number, color:string, bold=false) =>
  '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="Report text '+id+'"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="530000" y="'+y+'"/><a:ext cx="10950000" cy="'+height+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>'+
  lines.map(line=>'<a:p><a:pPr><a:spcAft><a:spcPts val="800"/></a:spcAft></a:pPr><a:r><a:rPr lang="en-IN" sz="'+size+'" b="'+(bold?1:0)+'"><a:solidFill><a:srgbClr val="'+color+'"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr><a:t>'+xml(line)+'</a:t></a:r></a:p>').join("")+'</p:txBody></p:sp>';
const colorMap = '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
const inherit = '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>';
const slide = (background:string, shapes:string) => '<p:sld'+space+'><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="'+background+'"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>'+group+shapes+'</p:spTree></p:cSld>'+inherit+'</p:sld>';
const colorNames = ["dk1","lt1","dk2","lt2","accent1","accent2","accent3","accent4","accent5","accent6","hlink","folHlink"];
const colors = ["211641","FFFFFF","232438","F3F1F8","562EB0","08766A","3756A6","AA5B12","854A93","598041","324FA3","854A93"];
const themeFill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
const fonts = (name:string) => '<a:'+name+'><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:'+name+'>';
const theme = '<a:theme xmlns:a="'+A+'" name="Adbibe"><a:themeElements><a:clrScheme name="Adbibe">'+colorNames.map((name,i)=>'<a:'+name+'><a:srgbClr val="'+colors[i]+'"/></a:'+name+'>').join("")+'</a:clrScheme><a:fontScheme name="Aptos">'+fonts("majorFont")+fonts("minorFont")+'</a:fontScheme><a:fmtScheme name="Report"><a:fillStyleLst>'+themeFill.repeat(3)+'</a:fillStyleLst><a:lnStyleLst>'+('<a:ln w="9525">'+themeFill+'<a:prstDash val="solid"/></a:ln>').repeat(3)+'</a:lnStyleLst><a:effectStyleLst>'+('<a:effectStyle><a:effectLst/></a:effectStyle>').repeat(3)+'</a:effectStyleLst><a:bgFillStyleLst>'+themeFill.repeat(3)+'</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
function wrap(text:string, max:number) {
  const lines:string[]=[];
  let line="";
  for (const word of text.split(/\s+/)) {
    if (line && line.length+word.length+1>max) { lines.push(line);line=""; }
    let token=word;
    while(token.length>max){ lines.push(token.slice(0,max));token=token.slice(max); }
    line=line ? line+" "+token : token;
  }
  if(line)lines.push(line);
  return lines;
}
export function reportPresentation(report: ClientReport) {
  const slides = [slide("211641",shape(2,["ADBIBE  /  CLIENT REPORT"],800000,600000,1700,"D0BFFF",true)
    +shape(3,[report.facts.company,report.frequency+" performance"],1550000,2300000,3600,"FFFFFF",true)
    +shape(4,[period(report),status(report),report.facts.source],4200000,1800000,1700,"EDE6FF"))];
  for(const section of reportSections(report)){
    const lines=section.rows.flatMap(row=>wrap(row.join("  |  "),102));
    for(let i=0;i<lines.length;i+=10){
      slides.push(slide("F8F7FB",shape(2,[section.title+(i?" (continued)":"")],380000,700000,2700,"562EB0",true)
        +shape(3,lines.slice(i,i+10),1280000,4950000,1700,"232438")
        +shape(4,[period(report)+"  ·  "+status(report)],6370000,360000,1050,"505067")));
    }
  }
  const parts:Record<string,string>={
    "_rels/.rels":relations([["officeDocument","ppt/presentation.xml"]]),
    "[Content_Types].xml":content([["ppt/presentation.xml","presentationml.presentation.main"],["ppt/slideMasters/slideMaster1.xml","presentationml.slideMaster"],["ppt/slideLayouts/slideLayout1.xml","presentationml.slideLayout"],["ppt/theme/theme1.xml","theme"],...slides.map((_,i):[string,string]=>["ppt/slides/slide"+(i+1)+".xml","presentationml.slide"])]),
    "ppt/presentation.xml":'<p:presentation'+space+'><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'+slides.map((_,i)=>'<p:sldId id="'+(256+i)+'" r:id="rId'+(i+2)+'"/>').join("")+'</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
    "ppt/_rels/presentation.xml.rels":relations([["slideMaster","slideMasters/slideMaster1.xml"],...slides.map((_,i):[string,string]=>["slide","slides/slide"+(i+1)+".xml"])]),
    "ppt/slideMasters/slideMaster1.xml":'<p:sldMaster'+space+'><p:cSld><p:spTree>'+group+'</p:spTree></p:cSld>'+colorMap+'<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>',
    "ppt/slideMasters/_rels/slideMaster1.xml.rels":relations([["slideLayout","../slideLayouts/slideLayout1.xml"],["theme","../theme/theme1.xml"]]),
    "ppt/slideLayouts/slideLayout1.xml":'<p:sldLayout'+space+' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>'+group+'</p:spTree></p:cSld>'+inherit+'</p:sldLayout>',
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels":relations([["slideMaster","../slideMasters/slideMaster1.xml"]]),
    "ppt/theme/theme1.xml":theme,
  };
  slides.forEach((value,i)=>{
    const name="slide"+(i+1)+".xml";
    parts["ppt/slides/"+name]=value;
    parts["ppt/slides/_rels/"+name+".rels"]=relations([["slideLayout","../slideLayouts/slideLayout1.xml"]]);
  });
  return zip(parts);
}
