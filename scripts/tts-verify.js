const fs = require('fs');
const path = require('path');
const { readDialogues, readConfig, pad3 } = require('./tts-lib');

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'audio');

function main() {
  const config = readConfig();
  const data = readDialogues();

  const rateKeys = Object.keys(config.rates || {});
  const voices = ['f', 'm'];
  const jaVoiceConfig = config.voices?.ja || config.voicesJa;
  const hasJaLines = data.dialogues.some((dialogue) =>
    dialogue.lines.some((line) => Boolean(line.ja))
  );
  const hasJaVoices = Boolean(jaVoiceConfig?.female && jaVoiceConfig?.male);

  if (hasJaLines && !hasJaVoices) {
    throw new Error('tts.config.json is missing ja voices. Run npm run tts:pick-voices first.');
  }

  let expected = 0;
  const missing = [];

  for (const dialogue of data.dialogues) {
    for (const line of dialogue.lines) {
      const lineNo = pad3(line.i);
      for (const voice of voices) {
        for (const rate of rateKeys) {
          expected += 1;
          const fileName = `${lineNo}__${voice}__r${rate}.mp3`;
          const filePath = path.join(OUTPUT_DIR, dialogue.dialogueId, fileName);
          if (!fs.existsSync(filePath)) {
            missing.push(path.relative(process.cwd(), filePath));
          }
        }
      }

      if (line.ja && hasJaVoices) {
        for (const voice of voices) {
          for (const rate of rateKeys) {
            expected += 1;
            const fileName = `${lineNo}__${voice}__r${rate}__ja.mp3`;
            const filePath = path.join(OUTPUT_DIR, dialogue.dialogueId, fileName);
            if (!fs.existsSync(filePath)) {
              missing.push(path.relative(process.cwd(), filePath));
            }
          }
        }
      }
    }
  }

  if (missing.length > 0) {
    console.error(`Missing ${missing.length} files (expected ${expected}).`);
    missing.slice(0, 20).forEach((file) => console.error(`- ${file}`));
    if (missing.length > 20) {
      console.error(`...and ${missing.length - 20} more`);
    }
    process.exit(1);
  }

  console.log(`All good. ${expected} files verified.`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
