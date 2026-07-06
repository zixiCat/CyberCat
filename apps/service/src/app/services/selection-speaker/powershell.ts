import { spawn } from 'node:child_process';

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

export const runPowerShell = async (script: string): Promise<string> => {
  return PowerShell.exec(script);
};
