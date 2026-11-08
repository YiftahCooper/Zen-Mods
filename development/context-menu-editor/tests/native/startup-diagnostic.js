return {checks:{browserReady:!!ctx.browser.gBrowser},
 version:ctx.Services.appinfo.version,profile:ctx.expectedProfile,
 browserURL:ctx.browser.location.href,viewport:{width:ctx.browser.innerWidth,height:ctx.browser.innerHeight}};
