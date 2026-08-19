import { runPowerShell } from './powershell';

const buildSelectionScript = (): string => `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes

    try {
        $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
        $pattern = $focused.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
        $selectedRanges = $pattern.GetSelection()
        $selectedText = ($selectedRanges | ForEach-Object { $_.GetText(-1) }) -join ""

        if (-not [string]::IsNullOrWhiteSpace($selectedText)) {
            $selectedText.Trim()
            return
        }
    } catch {
        # Some applications do not expose their selection through UI Automation.
    }

    $prev = $null
    $previousClipboardRead = $false
    for ($i = 0; $i -lt 10; $i++) {
        try {
            $prev = [System.Windows.Forms.Clipboard]::GetDataObject()
            $previousClipboardRead = $true
            break
        } catch {
            Start-Sleep -Milliseconds 50
        }
    }

    if (-not $previousClipboardRead) {
        return
    }

    $mark = [guid]::NewGuid().ToString()
    $clipboardReady = $false
    for ($i = 0; $i -lt 10; $i++) {
        try {
            [System.Windows.Forms.Clipboard]::SetText($mark)
            $clipboardReady = $true
            break
        } catch {
            Start-Sleep -Milliseconds 50
        }
    }

    if (-not $clipboardReady) {
        return
    }

    # Sending Ctrl+C while a shortcut modifier is still down can produce a different chord.
    for ($i = 0; $i -lt 40; $i++) {
        if ([System.Windows.Forms.Control]::ModifierKeys -eq [System.Windows.Forms.Keys]::None) {
            break
        }

        Start-Sleep -Milliseconds 25
    }

    try {
        if (-not ([System.Management.Automation.PSTypeName]'CyberCat.NativeInput').Type) {
            Add-Type @'
using System;
using System.Runtime.InteropServices;

namespace CyberCat {
    public static class NativeInput {
        [DllImport("user32.dll", SetLastError = true)]
        private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

        public static void CopySelection() {
            const uint keyUp = 0x0002;
            keybd_event(0x11, 0, 0, UIntPtr.Zero);
            keybd_event(0x43, 0, 0, UIntPtr.Zero);
            keybd_event(0x43, 0, keyUp, UIntPtr.Zero);
            keybd_event(0x11, 0, keyUp, UIntPtr.Zero);
        }
    }
}
'@
        }

        [CyberCat.NativeInput]::CopySelection()

        $text = $null
        # Some applications update the clipboard asynchronously.
        for ($i = 0; $i -lt 40; $i++) {
            Start-Sleep -Milliseconds 50
            try {
                if ([System.Windows.Forms.Clipboard]::ContainsText()) {
                    $current = [System.Windows.Forms.Clipboard]::GetText()
                    if ($current -ne $mark) {
                        $text = $current
                        break
                    }
                }
            } catch {
                # Retry while another process temporarily owns the clipboard.
            }
        }

        if ($text) { $text.Trim() }
    } finally {
        # Restore the previous clipboard content even when copying fails.
        if ($prev) {
            try {
                [System.Windows.Forms.Clipboard]::SetDataObject($prev, $true, 5, 50)
            } catch {
                # Ignore errors during restoration.
            }
        } else {
            try {
                [System.Windows.Forms.Clipboard]::Clear()
            } catch {}
        }
    }
`;

export const getGlobalSelectedText = async (): Promise<string> => {
  const selectedText = await runPowerShell(buildSelectionScript());

  return selectedText.trim();
};