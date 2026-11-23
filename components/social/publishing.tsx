"use client";
import type {ReactNode} from "react";
import {useNow} from "@/components/useNow";
import type {SocialPost} from "@/lib/types";
import {SOCIAL_STAGES} from "@/lib/types";
import {Card} from "@/components/ui";

/**
 * Publishing board. Without a connected platform, publishing is done by a person on the planned date and recorded here;
 * posts past their planned time are flagged so nothing is silently missed.
 */
export function PublishingTab({posts,cards,hasScheduler}:{posts:SocialPost[];cards:(p:SocialPost[])=>ReactNode;hasScheduler:boolean}){
  const now=useNow(),day=now+864e5;
  const scheduled=posts.filter(p=>p.stage==="Scheduled"&&p.scheduledAt).sort((a,b)=>a.scheduledAt!.localeCompare(b.scheduledAt!));
  const missed=scheduled.filter(p=>Date.parse(p.scheduledAt!)<now&&!p.delivery);
  const today=scheduled.filter(p=>{const t=Date.parse(p.scheduledAt!);return t>=now&&t<day;});
  const upcoming=scheduled.filter(p=>Date.parse(p.scheduledAt!)>=day);
  const failed=posts.filter(p=>p.delivery?.status==="unknown");
  const published=posts.filter(p=>p.stage==="Published").sort((a,b)=>(b.publishedAt??"").localeCompare(a.publishedAt??""));
  const column=(title:string,list:SocialPost[],empty:string,hint?:string,tone="")=><section className="min-w-0 space-y-2"><h3 className={`text-sm font-semibold ${tone}`}>{title} · {list.length}</h3>{hint&&<p className="text-xs text-fg-2">{hint}</p>}<div className="space-y-2">{cards(list)}</div>{!list.length&&<p className="rounded-lg border border-dashed border-border p-4 text-xs text-fg-3">{empty}</p>}</section>;
  return <div className="space-y-6">
    <Card className="p-4 text-sm"><h2 className="font-semibold">How publishing works</h2><p className="mt-1 text-fg-2">{hasScheduler?"Approved posts with a planned date can be sent to your connected scheduler from the post window.":"No social platform is connected yet, so posts are not published automatically. On the planned day, publish the post in the platform app, then open it here and record the live link. Posts past their planned time appear under Missed."}</p></Card>
    <div className="grid gap-5 lg:grid-cols-3">
      {column("Missed",missed,"Nothing missed.","Planned time has passed. Publish now and record the link, or set a new date.","text-warning")}
      {column("Due in the next 24 hours",today,"Nothing due today.")}
      {column("Upcoming",upcoming,"No upcoming posts. Approve posts and give them a planned date.")}
    </div>
    {failed.length>0&&column("Scheduler outcome unknown",failed,"","The scheduler did not confirm these. Check the platform before posting again.","text-danger")}
    {column("Publishing history",published,"Nothing published yet.")}
    <details className="rounded-lg border border-border p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">All content by stage</summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{SOCIAL_STAGES.map(s=><section key={s} className="min-w-0 rounded-lg border border-border p-3"><h4 className="mb-3 text-sm font-semibold">{s} · {posts.filter(p=>p.stage===s).length}</h4><div className="space-y-2">{cards(posts.filter(p=>p.stage===s))}</div></section>)}</div></details>
  </div>;
}
