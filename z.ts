import { spawn } from 'node:child_process';

/**
 * Manages a persistent PowerShell process to avoid process startup overhead.
 */
class PowerShell {
  private static instance: PowerShell;
  private process = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', '-']);
  private queue: Array<{ resolve: (s: string) => void }> = [];
  private marker = `__DONE__`;
  private buffer = '';

  private constructor() {
    this.process.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      if (this.buffer.includes(this.marker)) {
        const [result, ...rest] = this.buffer.split(this.marker);
        this.buffer = rest.join(this.marker);
        this.queue.shift()?.resolve(result.trim());
      }
    });
  }

  static exec(script: string): Promise<string> {
    this.instance ??= new PowerShell();
    return new Promise((resolve) => {
      this.instance.queue.push({ resolve });
      const b64 = Buffer.from(script, 'utf16le').toString('base64');
      const command = `$s=[System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String("${b64}")); . ([scriptblock]::Create($s)); echo "${this.instance.marker}"\n`;
      this.instance.process.stdin.write(command);
    });
  }
}

/**
 * Gets the currently selected text via clipboard.
 */
export async function getSelectedText(): Promise<string> {
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    $prev = [System.Windows.Forms.Clipboard]::GetDataObject()
    $mark = "__MARKER__"
    [System.Windows.Forms.Clipboard]::SetText($mark)
    
    [System.Windows.Forms.SendKeys]::SendWait('^c')
    
    $text = if ([System.Windows.Forms.Clipboard]::ContainsText()) { [System.Windows.Forms.Clipboard]::GetText() }
    if ($text -and $text -ne $mark) { $text.Trim() }
    
    if ($prev) { [System.Windows.Forms.Clipboard]::SetDataObject($prev, $true) } else { [System.Windows.Forms.Clipboard]::Clear() }
  `;
  return PowerShell.exec(script);
}

// --- Quick Test ---
(async () => {
  console.log('Focus a window with text in 2s...');
  await new Promise((r) => setTimeout(r, 2000));
  
  for (let i = 1; i <= 3; i++) {
    console.time(`Run ${i}`);
    const text = await getSelectedText();
    console.log(`Run ${i} Result: "${text}"`);
    console.timeEnd(`Run ${i}`);
  }
  process.exit(0);
})();
