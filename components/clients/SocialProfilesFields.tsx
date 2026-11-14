"use client";

import {useId} from "react";
import {Button,Field,Input} from "@/components/ui";
import type {Client} from "@/lib/types";

type Profiles=NonNullable<Client["socialProfiles"]>;
const examples=["LinkedIn","X / Twitter","Instagram","Facebook","YouTube","Threads","Pinterest","TikTok","Snapchat"];

export function SocialProfilesFields({value,onChange}:{value:Profiles;onChange:(profiles:Profiles)=>void}){
  const listId=useId();
  return <fieldset className="space-y-2">
    <legend className="text-sm font-semibold">Social profiles <span className="font-normal text-fg-3">(optional)</span></legend>
    <p className="text-xs text-fg-3">Add a profile URL or @handle. Use any platform name for other networks.</p>
    <datalist id={listId}>{examples.map(name=><option key={name} value={name}/>)}</datalist>
    {value.map((profile,index)=><div key={index} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
      <Field label={`Platform ${index+1}`}><Input list={listId} maxLength={100} value={profile.platform} placeholder="Instagram" onChange={event=>onChange(value.map((item,i)=>i===index?{...item,platform:event.target.value}:item))}/></Field>
      <Field label={`Profile URL or handle ${index+1}`}><Input maxLength={500} value={profile.handle} placeholder="https://instagram.com/company" onChange={event=>onChange(value.map((item,i)=>i===index?{...item,handle:event.target.value}:item))}/></Field>
      <Button className="min-h-11" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Remove</Button>
    </div>)}
    <Button className="min-h-11" disabled={value.length>=20} onClick={()=>onChange([...value,{platform:"",handle:""}])}>Add social profile</Button>
  </fieldset>;
}

export function completeSocialProfiles(value:Profiles){
  return value.every(profile=>!!profile.platform.trim()&&!!profile.handle.trim());
}
