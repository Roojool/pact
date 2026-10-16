const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.PACT_BASE_URL||'http://127.0.0.1:3101';
const out=path.resolve(__dirname,'../output/business-setup');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const page=await context.newPage(); const errors=[];let providerRequests=0;
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/api/{setup-draft,analyze,memory}',async route=>{
  const req=route.request();
  if(req.url().endsWith('/setup-draft')){providerRequests++;throw new Error('This browser check must not call a provider.');}
  assert.equal(req.postDataJSON().live,false);await route.continue();
 });
 try{
  await page.goto(base,{waitUntil:'networkidle'});await page.getByTestId('business-setup').waitFor();
  assert(await page.getByTestId('generate-setup').isDisabled(),'No key: clearly disabled live generation');
  await page.getByTestId('business-note').fill('My draft must survive a reload.');
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByTestId('business-note').inputValue(),'My draft must survive a reload.');
  await page.screenshot({path:path.join(out,'welcome-desktop.png'),fullPage:true});
  await page.getByTestId('manual-setup').click();assert(await page.getByTestId('create-business').isDisabled());
  await page.getByRole('button',{name:'Back to description'}).click();
  await page.getByTestId('example-setup').click();
  await page.getByTestId('setup-company').fill('Sunroom Demo');
  for(let i=1;i<3;i++)await page.getByTestId(`setup-permission-1-${i}`).selectOption('denied');
  assert.match(await page.getByTestId('setup-unknown-permissions').innerText(),/1 permissions still unknown/);
  await page.getByTestId('setup-owner').fill('Asha Rao');
  await page.reload({waitUntil:'networkidle'});await page.getByTestId('setup-company').waitFor();assert.equal(await page.getByTestId('setup-company').inputValue(),'Sunroom Demo');
  await page.screenshot({path:path.join(out,'review-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'review-mobile.png'),fullPage:true});
  await page.getByTestId('confirm-setup').check();
  await context.route('**/api/setup',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Test save failure — your draft is preserved.'})}),{times:1});
  await page.getByTestId('create-business').click();await page.getByRole('alert').getByText('Test save failure',{exact:false}).waitFor();assert.equal(await page.getByTestId('setup-company').inputValue(),'Sunroom Demo');
  const [created]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/setup')&&r.status()===200),page.getByTestId('create-business').click()]);
  const saved=(await created.json()).workspace;assert.equal(saved.agency,'Sunroom Demo');assert.equal(saved.decisions.length,0);assert.equal(saved.creators.length,0);assert.equal(saved.commitments.length,3);
  await page.getByTestId('dashboard-view').waitFor();assert.equal(await page.getByTestId('dashboard-status').innerText(),'Not checked');
  await page.reload({waitUntil:'networkidle'});await page.getByTestId('dashboard-view').waitFor();assert.equal(await page.locator('.masthead-company').textContent(),'Sunroom Demo');assert(await page.locator('.masthead-company').isVisible());
  await page.getByTestId('nav-overview').click();
  await page.locator('table tr:has-text("Rohan")').getByRole('button',{name:'Record denial'}).click();
  await page.locator('table tr:has-text("Rohan")').getByRole('button',{name:'Record denial'}).waitFor({state:'detached'});
  await page.getByTestId('nav-dashboard').click();
  await page.getByTestId('check-plan').click();await page.getByTestId('dashboard-status').getByText('Needs a change',{exact:true}).waitFor();
  await page.getByTestId('nav-repairs').click();await page.getByRole('button',{name:'Approve this option'}).click();await page.getByTestId('receipts-view').waitFor();
  await page.getByTestId('nav-dashboard').click();assert.equal(await page.getByTestId('dashboard-status').innerText(),'Booked');
  await page.getByTestId('dashboard-edit-job').click();await page.fill('#commitment-hours-input','5');await page.getByRole('button',{name:'Save job'}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  assert.equal(await page.getByTestId('dashboard-status').innerText(),'Not checked');
  await page.getByTestId('check-plan').click();await page.getByTestId('dashboard-status').getByText('Needs a change',{exact:true}).waitFor();
  await page.getByTestId('open-sources').click();await page.getByTestId('source-drawer').waitFor();assert((await page.getByTestId('source-drawer').innerText()).includes('confirmed working hours'));await page.keyboard.press('Escape');
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(out,'company-dashboard-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'company-dashboard-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const other=await browser.newContext();
  const response=await other.request.get(base+'/api/workspace');assert.equal((await response.json()).workspace,null,'A second visitor must not see this company');
  const noConfirmation=await other.request.post(base+'/api/setup',{data:{confirmation:false}});assert.equal(noConfirmation.status(),400);
  const longPage=await other.newPage();await longPage.goto(base,{waitUntil:'networkidle'});await longPage.getByTestId('example-setup').click();
  await longPage.getByTestId('setup-company').fill('S'.repeat(100));await longPage.getByTestId('setup-job-0').fill('J'.repeat(100));await longPage.getByLabel('Client, department or work area',{exact:true}).first().fill('C'.repeat(100));
  await longPage.getByTestId('confirm-setup').check();await longPage.getByTestId('create-business').click();await longPage.getByTestId('dashboard-view').waitFor();
  for(const width of [1280,390]){await longPage.setViewportSize({width,height:900});assert(await longPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Long names must not cause page overflow');}
  await other.close();
  assert.deepEqual(errors,[]);assert.equal(providerRequests,0);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,base,checkedAt:new Date().toISOString(),providerCalls:0,aiExtraction:'Contract tested separately with injected provider responses; no live model run',mode:'Example draft explicitly labelled; real local API and FalkorDB for all workspace operations',checks:['note/draft reload','manual validation','example review','unknown permissions recorded later','confirmation','save failure recovery','custom graph persistence','cookie isolation','check/repair/approve','edit invalidation','source drawer','390px overflow'],pageErrors:errors},null,2));
  console.log('Business setup real-browser journey passed with zero provider calls.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
