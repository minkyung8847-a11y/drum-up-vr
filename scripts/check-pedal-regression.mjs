import { createServer } from 'vite';
import { spawn } from 'node:child_process';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
try {
  for (const file of ['check-vr-layout.mjs', 'check-vr-hits.mjs', 'check-vr-sticks.mjs',
    'check-vr-audio-readiness.mjs', 'check-vr-free-play.mjs', 'check-vr-hardware-instances.mjs']) {
    console.log(`VR regression: ${file}`);
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`scripts/${file}`], { stdio: 'inherit',
        env: { ...process.env, VR_TEST_URL: url }, windowsHide: true });
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`${file} failed: ${code}`)));
    });
  }
} finally { await server.close(); }
