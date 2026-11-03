"use client";
import {StrategyWorkspace} from "./StrategyWorkspace";
export function IntelligenceTab({writable,onGenerateFor}:{writable:boolean;onGenerateFor:(clientId:string)=>void}){return <StrategyWorkspace mode="intelligence" writable={writable} onGenerateFor={onGenerateFor}/>;}
