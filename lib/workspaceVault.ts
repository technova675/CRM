import "server-only";
import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from "node:crypto";
import {ownedLibrary} from "./outreachServer";
import {WorkspaceAccessError} from "./auth/identity";

export const VAULT_SLOTS=["media","searchConsole"] as const;
export type VaultSlot=typeof VAULT_SLOTS[number];
export type SealedCredential={nonce:string;ciphertext:string;tag:string;updatedAt:string};

export function vaultConfigured(){
  return /^[0-9a-f]{64}$/i.test(process.env.WORKSPACE_VAULT_KEY??"");
}

export function workspaceCryptoKey(owner:string,purpose:"vault"|"backup"){
  if(!vaultConfigured())throw new Error("Set WORKSPACE_VAULT_KEY to a stable 64-character hex key on the server.");
  return Buffer.from(hkdfSync("sha256",Buffer.from(process.env.WORKSPACE_VAULT_KEY!,"hex"),owner,"adbibe:"+purpose+":v1",32));
}

const context=(owner:string,slot:VaultSlot)=>Buffer.from(JSON.stringify(["adbibe-vault-v1",owner,slot]));

export function sealCredential(owner:string,slot:VaultSlot,secret:string):SealedCredential{
  const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",workspaceCryptoKey(owner,"vault"),nonce);
  cipher.setAAD(context(owner,slot));
  return {
    nonce:nonce.toString("base64url"),
    ciphertext:Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]).toString("base64url"),
    tag:cipher.getAuthTag().toString("base64url"),
    updatedAt:new Date().toISOString(),
  };
}

export async function readCredential(owner:string,slot:VaultSlot){
  const entry=(await ownedLibrary(owner))?.credentialVault?.[slot];
  if(!entry)return;
  try{
    const decipher=createDecipheriv("aes-256-gcm",workspaceCryptoKey(owner,"vault"),Buffer.from(entry.nonce,"base64url"));
    decipher.setAAD(context(owner,slot));
    decipher.setAuthTag(Buffer.from(entry.tag,"base64url"));
    return Buffer.concat([decipher.update(Buffer.from(entry.ciphertext,"base64url")),decipher.final()]).toString("utf8");
  }catch{
    throw new WorkspaceAccessError("The stored integration credential could not be unlocked. Check the workspace vault key.");
  }
}
