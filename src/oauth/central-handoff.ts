import { createPublicKey, verify, type KeyObject } from "node:crypto";

export const CENTRAL_ISSUER="https://connect.papercliped.co";
export const CENTRAL_AUDIENCE="https://mcp.papercliped.co/mcp";
export const CENTRAL_AUTH_URL="https://auth.papercliped.co/mcp/authorize";
const B64=/^[A-Za-z0-9_-]+$/, ID=/^pcb_a_[A-Za-z0-9_-]{8,128}$/, RID=/^[A-Za-z0-9_-]{32}$/;

/** Dedicated Connect public key, distinct from bridge credential sealing and OAuth signing keys. */
export function centralHandoffKey(pem: string): KeyObject {
  const key=createPublicKey(pem.replace(/\\n/g,"\n"));
  if(key.asymmetricKeyType!=="ed25519")throw new Error("Central MCP handoff key must be Ed25519");
  return key;
}

/** A verified login assertion only; approval still requires the pending OAuth consent page. */
export function verifyCentralHandoff(raw: string, key: KeyObject, rid: string, nowMs=Date.now()): { accountId:string; jti:string } | null {
  if(typeof raw!=="string"||raw.length<100||raw.length>3000||!RID.test(rid)||!Number.isSafeInteger(nowMs))return null;
  const parts=raw.split(".");
  if(parts.length!==3||parts.some(p=>!B64.test(p)))return null;
  let h:any,p:any;
  try {
    h=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    p=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
  }catch{return null;}
  if(h?.alg!=="EdDSA"||h?.typ!=="PCD-MCP-HANDOFF"||h?.v!==1||typeof h.kid!=="string"||!/^[A-Za-z0-9._-]{1,64}$/.test(h.kid))return null;
  if(p?.iss!==CENTRAL_ISSUER||p?.aud!==CENTRAL_AUDIENCE||p?.rid!==rid||
    typeof p.sub!=="string"||!ID.test(p.sub)||typeof p.jti!=="string"||!RID.test(p.jti)||
    !Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.exp!==p.iat+90)return null;
  const now=Math.floor(nowMs/1000);
  if(p.iat>now+30||now>=p.exp||now<p.iat-30)return null;
  try {if(!verify(null,Buffer.from(parts[0]+"."+parts[1]),key,Buffer.from(parts[2],"base64url")))return null;}
  catch{return null;}
  return {accountId:p.sub,jti:p.jti};
}
