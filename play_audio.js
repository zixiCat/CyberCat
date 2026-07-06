const { exec } = require('child_process');
const path = require('path');

function playWavWindows(filePath) {
  // Convert to absolute path and fix backslashes for Windows
  const absolutePath = path.resolve(filePath).replace(/\\/g, '\\\\');

  // PowerShell command to play the WAV file synchronously
  const command = `powershell -c "(New-Object Media.SoundPlayer '${absolutePath}').PlaySync()"`;

  exec(command, (error) => {
    if (error) {
      console.error(`Playback error: ${error.message}`);
      return;
    }
    console.log('Finished playing WAV.');
  });
}

playWavWindows('./z.wav');