import { describe, expect, it } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpServer } from "../src/server.js";
import { issueOperatorRecoveryEvidence, parseRecoverySigner, recoverySignerFromEnv } from "../src/accounts/operator-recovery.js";

const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const signer=parseRecoverySigner(privateKey.export({type:"pkcs8",format:"pem"}).toString(),"test-key-1");
const now=1_900_000_000_000;
const aid="pcb_a_legacy123",gid="g_legacygrant12";
const existing=()=>({id:gid,accountId:aid,clientId:"claude",clientName:"Claude",scopes:["paperclip:read"],createdAt:now-3*86_400_000,revoked:false});
const store=(g=existing(),disabled=false)=>({getGrant:async()=>g,getAccount:async()=>({id:aid,disabled}),hit:async()=>true});
const decode=(token:string)=>{const [h,p,s]=token.split(".");return {header:JSON.parse(Buffer.from(h,"base64url").toString()),payload:JSON.parse(Buffer.from(p,"base64url").toString()),signed:h+"."+p,sig:Buffer.from(s,"base64url")};};

describe("opt-in operator recovery evidence",()=>{
 it("off by default; bad key rejected",()=>{
   expect(recoverySignerFromEnv({})).toBeNull();
   expect(()=>parseRecoverySigner("not a key","kid")).toThrow();
   expect(()=>parseRecoverySigner(privateKey.export({type:"pkcs8",format:"pem"}).toString(),"bad id")).toThrow();
 });
 it("signed, narrow, 5-minute proof of existing grant possession, not a login token",async()=>{
   const t=await issueOperatorRecoveryEvidence(store() as any,gid,signer,now);
   const x=decode(t);
   expect(x.header).toMatchObject({alg:"EdDSA",typ:"PCD-RECOVERY-EVIDENCE",v:1,kid:"test-key-1"});
   expect(x.payload).toMatchObject({aid,gid,iss:"https://mcp.papercliped.co",aud:"papercliped-operator-recovery-review",exp:Math.floor(now/1000)+300});
   expect(verify(null,Buffer.from(x.signed),publicKey,x.sig)).toBe(true);
   expect(t).not.toContain("pcs_");
   expect(t).not.toContain("access_token");
   expect(x.payload).not.toHaveProperty("email");
 });
 it("refuses revoked, anonymous/no account, plugin, recent grant, disabled account and ratelimited evidence",async()=>{
   for(const change of [{revoked:true},{accountId:null},{clientId:"paperclip-plugin"},{createdAt:now-10_000},{scopes:[]}]){
     await expect(issueOperatorRecoveryEvidence(store({...existing(),...change}) as any,gid,signer,now)).rejects.toThrow();
   }
   await expect(issueOperatorRecoveryEvidence(store(existing(),true) as any,gid,signer,now)).rejects.toThrow();
   await expect(issueOperatorRecoveryEvidence({...store(),hit:async()=>false} as any,gid,signer,now)).rejects.toThrow();
 });
});


describe("MCP recovery-only fallback when the old Paperclip is gone", () => {
 it("allows only one evidence tool, with no normal MCP or HTTP action access", async () => {
   const g = existing();
   const storeFake = {getGrant:async()=>g,getAccount:async()=>({id:aid,disabled:false}),hit:async()=>true};
   const oauthFake = {
     authenticate:async (token:string)=>token==="pcb_at_oldauthorized" ? g : null,
     resolveClient:async()=>{throw new Error("historical upstream is permanently offline");},
     handle:async()=>false,
     challengeHeader:()=> "Bearer",
     store:storeFake,
   };
   const cfg = {apiUrl:"https://retired-paperclip.invalid/api",apiKey:null,companyId:null,readOnly:false,timeoutMs:1000};
   const http = {host:"127.0.0.1",port:0,bridgeToken:null,publicUrl:null,oauth:null};
   const server=createHttpServer(cfg as any,http as any,{oauth:oauthFake as any,recoverySigner:signer,audit:()=>{}});
   let client:Client | undefined;
   try {
     await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
     const origin="http://127.0.0.1:"+(server.address() as AddressInfo).port;
     const headers={Authorization:"Bearer pcb_at_oldauthorized"};
     client=new Client({name:"recovery-test",version:"0.0.0"});
     await client.connect(new StreamableHTTPClientTransport(new URL(origin+"/mcp"),{requestInit:{headers}}));
     const names=(await client.listTools()).tools.map(t=>t.name);
     expect(names).toEqual(["paperclip_operator_recovery_evidence"]);
     const reply:any=await client.callTool({name:"paperclip_operator_recovery_evidence",arguments:{}});
     const token=reply.content[0]?.text?.split("\n").at(-1);
     const signed=decode(token);
     expect(verify(null,Buffer.from(signed.signed),publicKey,signed.sig)).toBe(true);
     expect(signed.payload.aid).toBe(aid);
     const forbidden=await fetch(origin+"/actions/paperclip_list_agents",{method:"POST",headers,body:"{}"});
     expect(forbidden.status).toBe(401);
   } finally {
     if(client)await client.close();
     await new Promise<void>(resolve=>server.close(()=>resolve()));
   }
 });
});
