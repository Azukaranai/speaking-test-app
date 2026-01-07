const fs = require('fs');
const path = require('path');
const {
  readDialogues,
  readConfig,
  requireEnv,
  ensureDir,
  pad3,
  buildSsml,
  synthesizeToFile,
} = require('./tts-lib');

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'audio');
const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public', 'data');
const PUBLIC_DATA_PATH = path.join(PUBLIC_DATA_DIR, 'dialogues.json');
const SOURCE_DATA_PATH = path.join(process.cwd(), 'data', 'dialogues.json');
const SKIP_EXISTING = process.argv.includes('--skip-existing');

async function main() {
  const config = readConfig();
  const data = readDialogues();
  const { key, region } = requireEnv();
  const outputFormat = config.outputFormat || 'Audio24Khz48KBitRateMonoMp3';
  const zhLocale = config.locale || 'zh-CN';
  const jaLocale = config.localeJa || 'ja-JP';
  ensureDir(PUBLIC_DATA_DIR);
  fs.copyFileSync(SOURCE_DATA_PATH, PUBLIC_DATA_PATH);

  const rateEntries = Object.entries(config.rates || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const zhVoiceConfig = config.voices?.zh || config.voices;
  const jaVoiceConfig = config.voices?.ja || config.voicesJa;
  const zhVoiceEntries = [
    { key: 'f', name: zhVoiceConfig?.female },
    { key: 'm', name: zhVoiceConfig?.male },
  ];
  const jaVoiceEntries = jaVoiceConfig
    ? [
        { key: 'f', name: jaVoiceConfig?.female },
        { key: 'm', name: jaVoiceConfig?.male },
      ]
    : null;

  if (!zhVoiceEntries[0].name || !zhVoiceEntries[1].name) {
    throw new Error('tts.config.json is missing zh voices. Run npm run tts:pick-voices first.');
  }

  const needsJapanese = data.dialogues.some((dialogue) =>
    dialogue.lines.some((line) => Boolean(line.ja))
  );
  if (needsJapanese) {
    if (!jaVoiceEntries || !jaVoiceEntries[0].name || !jaVoiceEntries[1].name) {
      throw new Error('tts.config.json is missing ja voices. Run npm run tts:pick-voices first.');
    }
  }

  for (const dialogue of data.dialogues) {
    const dialogueDir = path.join(OUTPUT_DIR, dialogue.dialogueId);
    ensureDir(dialogueDir);

    for (const line of dialogue.lines) {
      if (!line.zh || !line.i) {
        throw new Error(`Missing zh or i in line: ${JSON.stringify(line)}`);
      }

      const lineNo = pad3(line.i);

      for (const voice of zhVoiceEntries) {
        for (const [rateKey, rateValue] of rateEntries) {
          const fileName = `${lineNo}__${voice.key}__r${rateKey}.mp3`;
          const outputPath = path.join(dialogueDir, fileName);

          if (SKIP_EXISTING && fs.existsSync(outputPath)) {
            continue;
          }

          const ssml = buildSsml(voice.name, line.zh, rateValue, zhLocale);
          const relPath = path.relative(process.cwd(), outputPath);
          console.log(`Generating ${relPath}`);
          await synthesizeToFile({ key, region, ssml, outputPath, outputFormat });
        }
      }

      if (line.ja && jaVoiceEntries) {
        for (const voice of jaVoiceEntries) {
          for (const [rateKey, rateValue] of rateEntries) {
            const fileName = `${lineNo}__${voice.key}__r${rateKey}__ja.mp3`;
            const outputPath = path.join(dialogueDir, fileName);

            if (SKIP_EXISTING && fs.existsSync(outputPath)) {
              continue;
            }

            const ssml = buildSsml(voice.name, line.ja, rateValue, jaLocale);
            const relPath = path.relative(process.cwd(), outputPath);
            console.log(`Generating ${relPath}`);
            await synthesizeToFile({ key, region, ssml, outputPath, outputFormat });
          }
        }
      }
    }
  }

  console.log('TTS generation completed.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
