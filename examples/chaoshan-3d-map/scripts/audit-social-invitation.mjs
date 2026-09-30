import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='RECON/social-invitation';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5242/scripts/social-fixture.html');await page.waitForFunction(()=>window.socialAudit);
 const tick=(t,roll=0)=>page.evaluate(([t,roll])=>window.socialAudit.tick(t,roll),[t,roll]);
 assert.equal((await tick(30)).encounter,'invite');const invite=page.locator('.community-invite');await invite.waitFor({state:'visible'});
 await tick(31.5);const overlap=await page.locator('.community-bubbles').evaluate(e=>{const a=[...e.querySelectorAll('span:not([hidden])')].map(n=>n.getBoundingClientRect());return a.length===2&&a[0].right>a[1].left&&a[0].left<a[1].right&&a[0].bottom>a[1].top&&a[0].top<a[1].bottom;});assert.equal(overlap,false);
 await invite.focus();const bounds=await invite.boundingBox();await page.evaluate(()=>window.socialAudit.move(.15));await tick(44);assert.deepEqual(await invite.boundingBox(),bounds,'focused invitation must not move or lose focus');assert.equal(await invite.evaluate(e=>document.activeElement===e),true);
 await page.screenshot({path:out+'/invitation.png'});await page.keyboard.press('Enter');await page.locator('.community-game').waitFor({state:'visible'});
 await page.locator('.reaction-signal').click();await page.locator('.reaction-signal').click();assert.equal((await page.evaluate(()=>window.socialAudit.state())).lastResult,'early');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement===document.querySelector('.community-open'));
 assert.equal((await tick(60)).encounter,'review');assert.match(await page.locator('.community-bubbles span').first().textContent(),/抢先|绿灯|按早/);
 assert.equal((await tick(68)).encounter,null,'same pair must respect the encounter cooldown');
 assert.equal((await tick(85)).encounter,'invite');await page.evaluate(()=>window.socialAudit.hide());assert.equal((await tick(86)).invitationVisible,false);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.socialAudit.reset();window.socialAudit.move(0);});assert.equal((await tick(140)).invitationVisible,true);
 const mobile=await invite.boundingBox();assert.ok(mobile.x>=0&&mobile.x+mobile.width<=390&&mobile.y+mobile.height<=844);await invite.click();await page.screenshot({path:out+'/mobile-game.png'});await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement===document.querySelector('.community-open'));
 assert.equal((await tick(200)).invitationVisible,true);await page.evaluate(()=>window.socialAudit.separate());assert.equal((await tick(201)).invitationVisible,false,'walking apart must cancel the invitation');
 assert.equal(errors.length,0);console.log('PASS invitation, keyboard focus, nonoverlapping replies, actual outcome review, distance/visibility cancellation and mobile acceptance');
}finally{await browser.close();}
