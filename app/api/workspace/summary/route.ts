import {readWorkspaceKey} from "@/lib/workspaceKeys";
import {tenantUsage} from "@/lib/domain/tenant";
import {accountWorkspace} from "@/lib/auth/identity";
import {dbError} from "@/lib/db";
const headers={"Cache-Control":"private, no-store"};
export async function GET(req:Request){
  try{
    const auth=await readWorkspaceKey(req.headers.get("authorization"));
    if(!auth)return Response.json({error:"A valid workspace API key is required."},{status:401,headers});
    const usage=tenantUsage(auth.data);
    return Response.json({workspace:accountWorkspace(auth.owner),usage},{headers});
  }catch(error){return dbError(error);}
}
