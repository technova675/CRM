"use client";
import {StrategyWorkspace} from "./StrategyWorkspace";
export function ConceptsTab({initialClientId,initialCount,writable,onOpenCreative}:{initialClientId?:string;initialCount?:number;autoRun?:boolean;writable:boolean;onOpenCreative:(id:string)=>void}){return <StrategyWorkspace mode="concepts" initialClientId={initialClientId} initialCount={initialCount} writable={writable} onOpenCreative={onOpenCreative}/>;}
