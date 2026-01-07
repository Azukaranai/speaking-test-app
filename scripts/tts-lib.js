const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, 'data', 'dialogues.json');
const CONFIG_PATH = path.join(ROOT, 'tts.config.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readDialogues() {
  const data = readJson(DATA_PATH);
  if (!data || !Array.isArray(data.dialogues)) {
    throw new Error('data/dialogues.json is missing or invalid.');
  }
  return data;
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('tts.config.json not found. Run npm run tts:pick-voices first.');
  }
  return readJson(CONFIG_PATH);
}

function requireEnv() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION are required in .env');
  }
  return { key, region };
}

function getSpeechConfig() {
  const sdk = require('microsoft-cognitiveservices-speech-sdk');
  const { key, region } = requireEnv();
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisOutputFormat =
    sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
  return speechConfig;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(voiceName, text, rate, locale = 'zh-CN') {
  const ratePercent = Math.round(rate * 100);
  return `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xml:lang="${locale}" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="${voiceName}">
    <prosody rate="${ratePercent}%">${escapeXml(text)}</prosody>
  </voice>
</speak>`;
}

async function synthesizeToFile({ key, region, ssml, outputPath, outputFormat }) {
  const restOutputFormat = normalizeOutputFormat(outputFormat);
  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': restOutputFormat,
        'User-Agent': 'speaking-test-app',
      },
      body: ssml,
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`TTS request failed: ${response.status} ${detail}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
}

function normalizeOutputFormat(format) {
  const mapping = {
    Audio24Khz48KBitRateMonoMp3: 'audio-24khz-48kbitrate-mono-mp3',
  };
  return mapping[format] || format;
}

module.exports = {
  ROOT,
  DATA_PATH,
  CONFIG_PATH,
  readDialogues,
  readConfig,
  requireEnv,
  getSpeechConfig,
  ensureDir,
  pad3,
  buildSsml,
  synthesizeToFile,
  normalizeOutputFormat,
};
