import { chromium } from '@playwright/test'
import path from 'node:path'
const [,, route, theme, w, name] = process.argv
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport:{width:Number(w),height:900}, deviceScaleFactor:2, locale:'ar-EG', reducedMotion:'reduce' })
  await ctx.addInitScript((t)=>{try{localStorage.setItem('nasbot-theme',t as string)}catch{}}, theme)
  const p = await ctx.newPage()
  const errs:string[]=[]
  p.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,220)) })
  p.on('pageerror', e=>errs.push('PAGEERROR: '+e.message.slice(0,220)))
  await p.goto('http://localhost:3000'+route, { waitUntil:'networkidle' })
  await p.waitForTimeout(2500)
  const of = await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
  console.log(`overflow=${of}  errors=${errs.length}`)
  errs.slice(0,6).forEach(e=>console.log('  ! '+e))
  await p.screenshot({ path: path.join(process.cwd(),'shots',`${name}.png`), fullPage:true })
  await b.close()
})()
