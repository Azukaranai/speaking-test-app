const fs = require('fs');
const { CONFIG_PATH, requireEnv } = require('./tts-lib');

async function listVoices(locale) {
  const { key, region } = requireEnv();
  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
    {
      headers: {
        'Ocp-Apim-Subscription-Key': key,
      },
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`voices/list failed: ${response.status} ${detail}`);
  }

  const voices = await response.json();
  return Array.isArray(voices)
    ? voices.filter((voice) => String(voice.Locale || voice.locale) === locale)
    : [];
}

function pickVoice(voices, gender) {
  const match = voices
    .filter(
      (voice) => String(voice.Gender || voice.gender).toLowerCase() === gender.toLowerCase()
    )
    .sort((a, b) => {
      const nameA = a.ShortName || a.shortName || a.Name || a.name || '';
      const nameB = b.ShortName || b.shortName || b.Name || b.name || '';
      return nameA.localeCompare(nameB);
    })[0];
  return match || null;
}

async function main() {
  const voicesZh = await listVoices('zh-CN');
  const voicesJa = await listVoices('ja-JP');
  const neuralZh = voicesZh.filter(
    (voice) => String(voice.VoiceType || voice.voiceType).toLowerCase() === 'neural'
  );
  const neuralJa = voicesJa.filter(
    (voice) => String(voice.VoiceType || voice.voiceType).toLowerCase() === 'neural'
  );

  const zhFemale = pickVoice(neuralZh, 'female');
  const zhMale = pickVoice(neuralZh, 'male');
  const jaFemale = pickVoice(neuralJa, 'female');
  const jaMale = pickVoice(neuralJa, 'male');

  if (!zhFemale || !zhMale) {
    throw new Error('Unable to find both female and male zh-CN Neural voices.');
  }

  if (!jaFemale || !jaMale) {
    throw new Error('Unable to find both female and male ja-JP Neural voices.');
  }

  const config = {
    locale: 'zh-CN',
    localeJa: 'ja-JP',
    outputFormat: 'Audio24Khz48KBitRateMonoMp3',
    voices: {
      female: zhFemale.ShortName || zhFemale.shortName || zhFemale.Name || zhFemale.name,
      male: zhMale.ShortName || zhMale.shortName || zhMale.Name || zhMale.name,
    },
    voicesJa: {
      female: jaFemale.ShortName || jaFemale.shortName || jaFemale.Name || jaFemale.name,
      male: jaMale.ShortName || jaMale.shortName || jaMale.Name || jaMale.name,
    },
    rates: {
      '085': 0.85,
      '100': 1.0,
    },
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('Saved tts.config.json');
  console.log(`ZH Female: ${config.voices.female}`);
  console.log(`ZH Male: ${config.voices.male}`);
  console.log(`JA Female: ${config.voicesJa.female}`);
  console.log(`JA Male: ${config.voicesJa.male}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
