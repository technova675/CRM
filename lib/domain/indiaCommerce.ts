export const MARKETPLACES=["Blinkit","Zepto","Instamart","Amazon","Flipkart","Other"] as const;
export type Marketplace=typeof MARKETPLACES[number];
export type MarketObservation={id:string;clientId:string;platform:Marketplace;product:string;observedOn:string;source:string;shareOfSearch:number|null;available:boolean;priceInr:number|null;buyBox:boolean|null;promotion:string};
export type Consent={id:string;clientId:string;phone:string;status:"opted_in"|"opted_out";source:string;recordedAt:string};
export type MessageTemplate={id:string;clientId:string;name:string;language:string;body:string;providerStatus:"draft"|"submitted"|"approved"|"rejected";reviewedBy:string};
export type LanguageDraft={id:string;clientId:string;language:string;copy:string;reviewer:string;status:"draft"|"reviewed";createdAt:string};
export type SeasonalPlan={id:string;clientId:string;occasion:string;startDate:string;endDate:string;budgetInr:number;creativePlan:string;channels:string};
export type TaxWorksheet={id:string;clientId:string;invoiceId:string;gstin:string;customerGstin:string;placeOfSupply:string;sac:string;taxableInr:number;cgstRate:number;sgstRate:number;igstRate:number;tdsInr:number;paymentMethod:"UPI"|"Razorpay"|"Other";paymentReference:string};
export type IndiaCommerceState={observations:MarketObservation[];consents:Consent[];templates:MessageTemplate[];drafts:LanguageDraft[];plans:SeasonalPlan[];taxWorksheets:TaxWorksheet[]};
export const emptyIndiaCommerce=():IndiaCommerceState=>({observations:[],consents:[],templates:[],drafts:[],plans:[],taxWorksheets:[]});
export function indiaMoney(value:number){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(value);}
export function indiaCompact(value:number){return Math.abs(value)>=1e7?`₹${(value/1e7).toFixed(2)} cr`:Math.abs(value)>=1e5?`₹${(value/1e5).toFixed(2)} lakh`:indiaMoney(value);}
export function taxTotals(row:TaxWorksheet){const gst=row.taxableInr*(row.cgstRate+row.sgstRate+row.igstRate)/100;return {gst,gross:row.taxableInr+gst,receivable:row.taxableInr+gst-row.tdsInr};}
