import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign, randomBytes } from "node:crypto";
import { centralHandoffKey, verifyCentralHandoff, CENTRAL_AUTH_URL, CENTRAL_AUDIENCE } from "../src/oauth/central-handoff.js";
import { readOAuthConfig } from "../src/config.js";

const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const pub=publicKey.export({type:"spki",format:"pem"}).toString();
const rid="x".repeat(32),accountId="pcb_a_testoldaccount";
const nowMs=1_900_000_000_000, iat=Math.floor(nowMs/1000);
const b64=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString("base64url");
const claims=()=>({iss:"https://connect.papercliped.co",aud:CENTRAL_AUDIENCE,sub:accountId,rid,
  iat,exp:iat+90,jti:randomBytes(24).toString("base64url")});
function make(p=claims(),h={alg:"EdDSA",typ:"PCD-MCP-HANDOFF",v:1,kid:"pcd-mcp-1"}) {
  const signed=b64(h)+"."+b64(p);
  return signed+"."+sign(null,Buffer.from(signed),privateKey).toString("base64url");
}
describe("hosted MCP central authorization handoff",()=>{
  it("checks exact issuer, audience, account, pending rid and five boundary conditions",()=>{
    const k=centralHandoffKey(pub);
    const t=make();
    expect(verifyCentralHandoff(t,k,rid,nowMs)?.accountId).toBe(accountId);
    expect(verifyCentralHandoff(t,k,rid,nowMs+90000)).toBeNull();
    expect(verifyCentralHandoff(t,k,"y".repeat(32),nowMs)).toBeNull();
    expect(verifyCentralHandoff(t.slice(0,-3)+"AAA",k,rid,nowMs)).toBeNull();
    expect(verifyCentralHandoff(make({...claims(),sub:"victim"}),k,rid,nowMs)).toBeNull();
    expect(verifyCentralHandoff(make({...claims(),aud:"https://evil.example/mcp"}),k,rid,nowMs)).toBeNull();
    expect(verifyCentralHandoff(make({...claims(),iss:"https://evil.example"}),k,rid,nowMs)).toBeNull();
    expect(verifyCentralHandoff(make({...claims(),exp:iat+900}),k,rid,nowMs)).toBeNull();
    expect(verifyCentralHandoff(make(claims(),{alg:"HS256",typ:"PCD-MCP-HANDOFF",v:1,kid:"key"}),k,rid,nowMs)).toBeNull();
  });
  it("fails closed on invalid signer config; never enabled on single-tenant bridge",()=>{
    expect(()=>centralHandoffKey("bad key")).toThrow();
    expect(()=>readOAuthConfig({BRIDGE_OAUTH:"true",BRIDGE_PUBLIC_URL:"https://mcp.papercliped.co",
      BRIDGE_MODE:"multi",BRIDGE_SECRET:"s".repeat(40),BRIDGE_CENTRAL_AUTH:"true"} as any,
      "https://mcp.papercliped.co",null)).toThrow();
    expect(CENTRAL_AUTH_URL).toBe("https://auth.papercliped.co/mcp/authorize");
  });
});
