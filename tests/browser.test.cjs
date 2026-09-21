// Optional real-browser QA. Install playwright and @sparticuz/chromium, or
// provide ATLAS_PLAYWRIGHT_PATH / ATLAS_CHROMIUM_PATH for an existing runtime.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium:playwright}=require(process.env.ATLAS_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const {default:chromium}=await import(process.env.ATLAS_CHROMIUM_PATH||'@sparticuz/chromium');
 const browser=await playwright.launch({args:chromium.args,executablePath:process.env.ATLAS_BROWSER_EXECUTABLE||await chromium.executablePath(),headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // Keep the validation deterministic and independent of remote font services.
 await page.route('https://**/*',r=>r.abort());
 await page.goto('file://'+path.resolve(__dirname,'../dist/classics-atlas.html'));
 await page.waitForFunction(()=>!!window.ClassicsAtlas);
 const box=selector=>page.locator(selector).boundingBox();
 const checkDesktop=async()=>{const m=await box('#mapCanvas'),r=await box('#results'),t=await box('.time-dock'),s=await box('.search-area');assert(m.width>700,'map keeps substantial width');assert(m.x+m.width<=r.x+1,'results do not cover map');assert(s.y+s.height<=m.y+1,'search does not cover map');assert(m.y+m.height<=t.y+1,'timeline does not cover map');};
 assert.equal(await page.locator('.map-caption').count(),0);assert(await page.locator('#filters').isHidden());
 await checkDesktop();
 if(process.env.ATLAS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR,'atlas-desktop-light.png')});
 await page.click('#closeResults');const full=await box('#mapCanvas');assert(full.width>1400,'map expands with results closed');
 await page.click('#mobileFilters');assert(await page.locator('#filters').isVisible());const narrow=await box('#mapCanvas'),f=await box('#filters');assert(narrow.x>=f.x+f.width-1,'filters push map rather than cover it');
 await page.click('#openResults');await checkDesktop();await page.click('#collapseFilters');
await page.fill('#searchInput','Greek poetry before the 4th century BC');await page.click('#searchForm button');assert((await page.evaluate(()=>ClassicsAtlas.getResults().length))>=2);await page.click('#dismissReply');
 await page.click('#themeBtn');await page.click('#globeBtn');
 if(process.env.ATLAS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR,'atlas-desktop-dark.png')});
 await page.click('.brand');await page.selectOption('#bookList [data-status]:first-of-type','read');
 await page.locator('#bookList [data-rating="4"]').first().click();await page.click('#shelfBtn');assert.equal(await page.evaluate(()=>ClassicsAtlas.getResults().length),1);
 await page.click('#closeResults');await page.click('#timeExpand');assert(await page.locator('#timelineList').isVisible());await page.locator('[data-view="map"]').first().click();
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));await mobile.route('https://**/*',r=>r.abort());await mobile.goto('file://'+path.resolve(__dirname,'../dist/classics-atlas.html'));
 await mobile.waitForFunction(()=>!!window.ClassicsAtlas);assert(await mobile.locator('#results').isHidden());assert((await mobile.locator('#mapCanvas').boundingBox()).height>500,'map dominates initial mobile viewport');
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
 if(process.env.ATLAS_SCREENSHOT_DIR)await mobile.screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR,'atlas-mobile.png')});
 await mobile.click('#mobileFilters');assert(await mobile.locator('#filters').isVisible());await mobile.selectOption('#countrySelect','GRC');await mobile.click('#collapseFilters');await mobile.click('#openResults');
 const mm=await mobile.locator('#mapCanvas').boundingBox(),mr=await mobile.locator('#results').boundingBox();assert(mm.y+mm.height<=mr.y+1,'mobile results dock below the map');assert(mm.height>200);
 if(process.env.ATLAS_SCREENSHOT_DIR)await mobile.screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR,'atlas-mobile-results.png')});
 await mobile.click('#closeResults');assert((await mobile.locator('#mapCanvas').boundingBox()).height>500);await mobile.locator('.mobile-views [data-view="books"]').click();assert(await mobile.locator('#results').isVisible());
 assert.equal(errors.length,0,errors.join('\n'));await browser.close();console.log('Real Chromium checks passed: desktop/mobile panel separation, adaptive map size, no mobile overflow, filters, Greek poetry search, themes/globe, shelf/ratings, timeline, and view switching.');
})().catch(e=>{console.error(e);process.exit(1);});
