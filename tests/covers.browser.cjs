// Live smoke check of a small visible sample only; not a cover crawler.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium:playwright}=require(process.env.ATLAS_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const {default:chromium}=await import(process.env.ATLAS_CHROMIUM_PATH||'@sparticuz/chromium');
 const browser=await playwright.launch({args:chromium.args,executablePath:process.env.ATLAS_BROWSER_EXECUTABLE||await chromium.executablePath(),headless:true,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('https://fonts.**/*',r=>r.abort());
  if(process.env.ATLAS_COVER_FIXTURE)await page.route('https://covers.openlibrary.org/**',r=>r.request().url().includes('/5330273-')?r.fulfill({path:process.env.ATLAS_COVER_FIXTURE,contentType:'image/jpeg'}):r.abort());
  await page.goto('file://'+path.resolve(__dirname,'../dist/classics-atlas.html'),{waitUntil:'domcontentloaded'});
  await page.fill('#searchInput','Middlemarch');await page.click('#searchForm button');
  await page.waitForFunction(()=>[...document.querySelectorAll('#bookList .edition-cover')].some(i=>i.complete&&i.naturalWidth>1),{},{timeout:45000});
  assert((await page.locator('#bookList .edition-cover').count())>=1);
  await page.locator('#bookList [data-detail]').first().click();assert(await page.locator('.source-notes').isVisible());
  if(process.env.ATLAS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR,'atlas-sourced-cover.png')});
  // Exercise a real broken-image response and confirm the readable fallback.
  await page.route('https://covers.openlibrary.org/**',r=>r.abort());
  await page.evaluate(()=>{const image=document.querySelector('#detailContent .edition-cover');image.src='https://covers.openlibrary.org/b/id/0-M.jpg?default=false';});
  await page.waitForFunction(()=>!document.querySelector('#detailContent .edition-cover'));
  assert((await page.locator('#detailContent .cover').innerText()).includes('COVER UNAVAILABLE'));
  console.log((process.env.ATLAS_COVER_FIXTURE?'Downloaded source-cover fixture rendered':'Live cover loaded')+'; edition attribution, source details, and broken-image fallback passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
