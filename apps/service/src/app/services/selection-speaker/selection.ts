import { runPowerShell } from './powershell';

const buildSelectionScript = (): string => `
    Add-Type -AssemblyName System.Windows.Forms
    $prev = [System.Windows.Forms.Clipboard]::GetDataObject()
    $mark = "__MARKER__"
    [System.Windows.Forms.Clipboard]::SetText($mark)
    
    [System.Windows.Forms.SendKeys]::SendWait('^c')
    
    $text = if ([System.Windows.Forms.Clipboard]::ContainsText()) { [System.Windows.Forms.Clipboard]::GetText() }
    if ($text -and $text -ne $mark) { $text.Trim() }
    
    if ($prev) { [System.Windows.Forms.Clipboard]::SetDataObject($prev, $true) } else { [System.Windows.Forms.Clipboard]::Clear() }
`;

export const getGlobalSelectedText = async (): Promise<string> => { 
  const selectedText = await runPowerShell(buildSelectionScript());

  return selectedText.trim();
};