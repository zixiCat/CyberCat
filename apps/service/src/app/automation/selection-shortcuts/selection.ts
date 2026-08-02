import { runPowerShell } from './powershell';

const buildSelectionScript = (): string => `
    Add-Type -AssemblyName System.Windows.Forms

    $prev = [System.Windows.Forms.Clipboard]::GetDataObject()
    $mark = "__MARKER__"
    [System.Windows.Forms.Clipboard]::SetText($mark)

    # Sending Ctrl+C while a shortcut modifier is still down can produce a different chord.
    for ($i = 0; $i -lt 20; $i++) {
        if ([System.Windows.Forms.Control]::ModifierKeys -eq [System.Windows.Forms.Keys]::None) {
            break
        }

        Start-Sleep -Milliseconds 25
    }

    [System.Windows.Forms.SendKeys]::SendWait('^c')

    $text = $null
    # Some applications update the clipboard asynchronously.
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 50
        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            $current = [System.Windows.Forms.Clipboard]::GetText()
            if ($current -ne $mark) {
                $text = $current
                break
            }
        }
    }
    
    if ($text) { $text.Trim() }
    
    # Restore the previous clipboard content safely
    if ($prev) {
        try {
            # Use an overload with retries: SetDataObject(data, copy, retryTimes, retryDelay)
            [System.Windows.Forms.Clipboard]::SetDataObject($prev, $true, 5, 50)
        } catch {
            # Ignore errors during restoration
        }
    } else {
        try {
            [System.Windows.Forms.Clipboard]::Clear()
        } catch {}
    }
`;

export const getGlobalSelectedText = async (): Promise<string> => {
  const selectedText = await runPowerShell(buildSelectionScript());

  return selectedText.trim();
};