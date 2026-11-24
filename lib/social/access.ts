import "server-only";
import {ownedLibrary} from "../outreachServer";
import {knowledgeAccess} from "../domain/clientKnowledge";

export class AccessError extends Error{readonly status:number;constructor(message:string,status=403){super(message);this.status=status;}}
/** Social access for this login; when a client is named it must belong to the account. */
export async function socialAccess(userId:string,clientId?:string,write=true){
  const library=await ownedLibrary(userId);
  if(!library)throw new AccessError("Open the CRM and add a client first.",404);
  if(!knowledgeAccess(library,userId,"social",write))throw new AccessError(write?"Social edit access is required.":"Social access is required.");
  if(clientId&&!library.clients.some(c=>c.id===clientId))throw new AccessError("Client not found in this account.",404);
  return library;
}
