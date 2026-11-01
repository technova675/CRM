import assert from "node:assert/strict";
import { createTestAccount,TestBrowser } from "./reportAuthFixture.mjs";
let account;
try {
  account=await createTestAccount();
  for(const port of [3011,3012]) {
    const browser=new TestBrowser(`http://localhost:${port}`);
    const start=Date.now(); await browser.signIn(account);
    assert.equal((await browser.request("/api/auth")).status,200);
    const library=await browser.request("/api/reports/uploads");
    assert.equal(library.status,200,JSON.stringify(await library.clone().json()));
    assert.deepEqual((await library.json()).files,[]);
    const response=await browser.request("/reports"); assert.equal(response.status,200);
    console.log(`PASS: port ${port} verified sign-in, session validation, account-scoped report listing and dashboard access (${Date.now()-start} ms).`);
    const origin=`https://0s2dbn2j-${port}.inc1.devtunnels.ms`;
    const tunnelBrowser=new TestBrowser(`http://localhost:${port}`);
    const signIn=await tunnelBrowser.request("/api/auth",{method:"POST",headers:{"content-type":"application/json",origin,"x-forwarded-host":new URL(origin).host,"x-forwarded-proto":"https"},body:JSON.stringify({action:"signin",email:account.email,password:account.password})});
    assert.equal(signIn.status,200,JSON.stringify(await signIn.clone().json()));
    assert.ok(tunnelBrowser.lastSetCookies.some(cookie=>/secure/i.test(cookie)&&/httponly/i.test(cookie)),"Tunnel sessions require secure, HttpOnly cookies");
    const protectedPage=await tunnelBrowser.request("/reports",{headers:{"x-forwarded-host":new URL(origin).host,"x-forwarded-proto":"https"}});
    assert.equal(protectedPage.status,200);
    console.log(`PASS: port ${port} forwarded HTTPS origin, secure session cookies and protected dashboard.`);
  }
} finally {if(account) await account.remove();}
