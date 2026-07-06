import { runPowerShell } from './powershell';

const buildSelectionScript = (copyDelayMs: number): string => `
Add-Type -AssemblyName System.Windows.Forms

$previousClipboard = $null
$selectedText = ''

try {
    try {
        $previousClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
    } catch {}

    $marker = '__CYBERCAT_SELECTION_SPEAKER__' + [Guid]::NewGuid().ToString('N')
    [System.Windows.Forms.Clipboard]::SetText($marker)

    Start-Sleep -Milliseconds ${copyDelayMs}
    [System.Windows.Forms.SendKeys]::SendWait('^c')
    Start-Sleep -Milliseconds ${copyDelayMs}

    if ([System.Windows.Forms.Clipboard]::ContainsText()) {
        $clipboardText = [System.Windows.Forms.Clipboard]::GetText()
        if ($clipboardText -and $clipboardText -ne $marker) {
            $selectedText = $clipboardText.Trim()
        }
    }
} catch {}

if (-not $selectedText) {
    try {
        Add-Type -AssemblyName UIAutomationClient
        Add-Type -AssemblyName UIAutomationTypes

        $element = [System.Windows.Automation.AutomationElement]::FocusedElement
        $current = $element

        while ($null -ne $current) {
            try {
                $pattern = $current.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
                if ($null -ne $pattern) {
                    $selection = $pattern.GetSelection()
                    if ($null -ne $selection -and $selection.Count -gt 0) {
                        $uiaText = $selection[0].GetText(-1)
                        if ($uiaText) {
                            $selectedText = $uiaText.Trim()
                            break
                        }
                    }
                }
            } catch {}

            $current = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($current)
        }
    } catch {}
}

try {
    if ($null -ne $previousClipboard) {
        [System.Windows.Forms.Clipboard]::SetDataObject($previousClipboard, $true)
    } else {
        [System.Windows.Forms.Clipboard]::Clear()
    }
} catch {}

if ($selectedText) {
    Write-Output $selectedText
}
`;

export const getGlobalSelectedText = async (copyDelayMs: number): Promise<string> => { 
  const selectedText = await runPowerShell(buildSelectionScript(copyDelayMs), { sta: true });

  return selectedText.trim();
};