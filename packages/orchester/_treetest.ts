import { ensureDaemon } from './src/client'
import { execSync } from 'node:child_process'
const procs = () => { try { return execSync("pgrep -f 'platforms/server/src/index.ts' | wc -l").toString().trim() } catch { return '0' } }
const on3001 = () => { try { execSync('lsof -nP -iTCP:3001 -sTCP:LISTEN', {stdio:['ignore','pipe','ignore']}); return true } catch { return false } }
const sleep = (ms:number) => new Promise(r=>setTimeout(r,ms))
async function main() {
  const c = await ensureDaemon()
  await c.start('core'); await sleep(4000)
  console.log('after start  -> 3001:', on3001(), 'server procs:', procs())
  let st = (await c.restart('core'), await c.status()).find(s=>s.id==='core')
  await sleep(4000); st = (await c.status()).find(s=>s.id==='core')
  console.log('after restart-> status:', st?.status, '3001:', on3001(), 'server procs:', procs())
  await c.stop('core'); await sleep(2000)
  console.log('after stop   -> 3001:', on3001(), 'server procs:', procs())
  c.close(); process.exit(0)
}
main().catch(e=>{console.error('FAIL',e);process.exit(1)})
