const { spawn } = require('node:child_process');
const { uIOhook, UiohookKey } = require('uiohook-napi');

/**
 * Gets the currently selected text using Windows UI Automation (UIA).
 * This method does NOT use the clipboard, but it may not work in all applications.
 */
async function getSelectedText() {
  const psScript = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

try {
    $element = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -eq $element) { exit }

    $current = $element
    while ($null -ne $current) {
        try {
            $pattern = $current.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
            if ($null -ne $pattern) {
                $selection = $pattern.GetSelection()
                if ($null -ne $selection -and $selection.Count -gt 0) {
                    $text = $selection[0].GetText(-1)
                    if ($text) {
                        Write-Output $text.Trim()
                        exit
                    }
                }
            }
        } catch {}
        $current = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($current)
    }
} catch {}
`;

  return new Promise((resolve) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-EncodedCommand',
      Buffer.from(psScript, 'utf16le').toString('base64')
    ]);

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', () => {
      resolve(output.trim());
    });
  });
}

console.log('--- Global Selection Logger (No Clipboard) ---');
console.log('Using Windows UI Automation (UIA)');
console.log('Instructions:');
console.log('1. Keep this terminal running.');
console.log('2. Go to a UIA-compatible window (Chrome, VS Code, Word, etc.).');
console.log('3. Highlight some text.');
console.log('4. Press Ctrl + Alt + S to log the selection.');
console.log('--------------------------------------------------');

uIOhook.on('keydown', async (event) => {
  if (event.ctrlKey && event.altKey && event.keycode === UiohookKey.S) {
    try {
      // No need for a large delay since we aren't waiting for a clipboard copy
      const text = await getSelectedText();
      if (text) {
        console.log(`\n[${new Date().toLocaleTimeString()}] Selected Text:`);
        console.log('--------------------------------------------------');
        console.log(text);
        console.log('--------------------------------------------------');
      } else {
        console.log('\n[!] No text captured or application does not support UI Automation selection.');
      }
    } catch (err) {
      console.error('\n[!] Error capturing selection:', err.message);
    }
  }
});

uIOhook.start();
