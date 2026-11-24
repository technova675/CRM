import {reportIdentity} from "@/lib/auth/server";
import {ownedLibrary} from "@/lib/outreachServer";
import {dbError} from "@/lib/db";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {eventWindow,publicLink} from "@/lib/domain/calendar";
import {CalendarError,eventsFor} from "@/lib/calendarServer";

/** Events from the signed-in login's own connected calendar, for one bounded window. */
export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),lib=await ownedLibrary(user.userId);
    if(lib&&!knowledgeAccess(lib,user.userId,"meetings"))return Response.json({error:"Meetings access is required."},{status:403});
    const url=new URL(req.url),win=eventWindow(url.searchParams.get("from"),url.searchParams.get("to"));
    if(!win)return Response.json({error:"Choose a valid date range."},{status:400});
    const {link,events}=await eventsFor(user.userId,win.from,win.to);
    return Response.json({link:publicLink(link??undefined),from:win.from,to:win.to,events},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof CalendarError)return Response.json({error:error.message},{status:error.status===401?409:error.status});
    return dbError(error);
  }
}
