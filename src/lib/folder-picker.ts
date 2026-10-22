import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execute = promisify(execFile);
let picking = false;
export async function pickFolder(initialDirectory: string): Promise<string | null> {
  if (process.platform !== "win32") throw new Error("当前系统暂不支持目录选择，请手动填写绝对路径。");
  if (picking) throw new Error("目录选择窗口已打开，请先完成选择或取消。");
  picking = true;
  const script = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择文件工作目录'
$dialog.SelectedPath = $env:OFFER_PICKER_INITIAL_DIRECTORY
$dialog.ShowNewFolderButton = $true
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
try {
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write($dialog.SelectedPath)
  }
} finally { $dialog.Dispose(); $owner.Dispose() }
`;
  try {
    const { stdout } = await execute("powershell.exe", ["-NoProfile", "-STA", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      windowsHide: true, timeout: 600000, maxBuffer: 65536,
      env: { ...process.env, OFFER_PICKER_INITIAL_DIRECTORY: initialDirectory },
    });
    const directory = stdout.trim();
    if (!directory) return null;
    if (!path.isAbsolute(directory) || /[\r\n\0]/.test(directory) || directory.length > 1000) throw new Error("invalid directory");
    return directory;
  } catch { throw new Error("无法完成文件夹选择，请重试或手动填写目录。"); }
  finally { picking = false; }
}
