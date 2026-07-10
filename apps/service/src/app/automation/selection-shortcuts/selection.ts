import { runPowerShell } from './powershell';

const buildSelectionScript = (): string => `
    Add-Type -AssemblyName System.Windows.Forms

    $prev = [System.Windows.Forms.Clipboard]::GetDataObject()
    $mark = "__MARKER__"
    [System.Windows.Forms.Clipboard]::SetText($mark)
    
    # Small delay to allow any physically pressed modifier keys (from the hotkey) to be released
    # or to not interfere with the sent keystroke.
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait('^c')
    
    $text = $null
    # Retry waiting for the clipboard to update for up to 500ms
    for ($i = 0; $i -lt 10; $i++) {
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

  console.log('Selected text:', selectedText);

  return selectedText.trim();
};