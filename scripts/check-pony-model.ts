import fs from 'fs';
import path from 'path';

function loadEnvToken(key: string): string {
  for (const envFile of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), envFile);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf-8').split('\n');
    for (const l of lines) {
      if (l.includes(key)) {
        return l.split('=')[1]?.trim().replace(/^"|"$/g, '').replace(/\\n/g, '').trim();
      }
    }
  }
  return '';
}

async function main() {
  const token = loadEnvToken('REPLICATE_API_TOKEN');
  if (!token) { console.log('No REPLICATE_API_TOKEN'); return; }
  console.log('Token found:', token.substring(0, 8) + '...');

  // 1. Pony SDXL 모델 스키마 조회
  const ponyVersion = '701612312ab4f3ecb3228ecf6e611c22850e91ea0666c9525bb96e90315d9bbe';
  const res = await fetch(
    `https://api.replicate.com/v1/models/charlesmccarthy/pony-sdxl/versions/${ponyVersion}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  const schema = data.openapi_schema?.components?.schemas?.Input?.properties || {};

  console.log('\n=== Pony SDXL Input Schema ===');
  for (const [key, val] of Object.entries(schema)) {
    const v = val as Record<string, unknown>;
    console.log(`  ${key}: type=${v.type}, default=${JSON.stringify(v.default)}, ${(v.description as string)?.substring(0, 60) || ''}`);
  }

  // 2. 테스트 Prediction 생성
  console.log('\n=== Pony SDXL Test Prediction ===');
  const predRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: ponyVersion,
      input: {
        prompt: 'score_9, score_8_up, masterpiece, best quality, 1girl, silver hair, long hair, red eyes, black coat, standing, night city, moonlight, anime illustration',
        negative_prompt: 'score_6, score_5, score_4, lowres, bad anatomy, bad hands, text, error, worst quality',
        width: 1024,
        height: 768,
        num_inference_steps: 25,
        guidance_scale: 7,
      }
    })
  });
  const pred = await predRes.json();
  console.log('  ID:', pred.id);
  console.log('  Status:', pred.status);
  if (pred.error) console.log('  Error:', pred.error);

  // 3. 결과 대기 (최대 30초)
  if (pred.id && !pred.error) {
    console.log('  Waiting for result...');
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const pollData = await pollRes.json();
      console.log(`  Poll ${i+1}: status=${pollData.status}, metrics=${JSON.stringify(pollData.metrics)}`);
      if (pollData.status === 'succeeded') {
        console.log('  Output:', pollData.output);
        break;
      }
      if (pollData.status === 'failed') {
        console.log('  Error:', pollData.error);
        break;
      }
    }
  }
}

main().catch(console.error);
