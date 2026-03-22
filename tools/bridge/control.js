/**
 * control.js — Mouse + keyboard control via PowerShell (no native compilation)
 * Usage: node tools/bridge/control.js move 500 300
 *        node tools/bridge/control.js click 500 300
 *        node tools/bridge/control.js type "hello world"
 *        node tools/bridge/control.js key "{ENTER}"
 *        node tools/bridge/control.js hotkey "^c"   (Ctrl+C)
 */

const { execSync } = require('child_process');

function ps(script) {
  return execSync(
    `powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
    { encoding: 'utf8', shell: true }
  ).trim();
}

const actions = {
  move(x, y) {
    ps(`Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`);
    console.log(`Moved cursor to (${x}, ${y})`);
  },

  click(x, y, button = 'left') {
    actions.move(x, y);
    const btn = button === 'right' ? 'RightButton' : 'LeftButton';
    ps(`Add-Type -AssemblyName System.Windows.Forms
$sig = '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'
$type = Add-Type -MemberDefinition $sig -Name 'MouseControl' -Namespace Win32 -PassThru
$type::mouse_event(0x0002, 0, 0, 0, 0)
$type::mouse_event(0x0004, 0, 0, 0, 0)`);
    console.log(`Clicked ${button} at (${x}, ${y})`);
  },

  type(text) {
    ps(`Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${text.replace(/'/g, "''")}')`);
    console.log(`Typed: ${text}`);
  },

  key(keycode) {
    ps(`Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${keycode}')`);
    console.log(`Key sent: ${keycode}`);
  },

  hotkey(combo) {
    // combo examples: "^c" = Ctrl+C, "^v" = Ctrl+V, "%{F4}" = Alt+F4
    ps(`Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${combo}')`);
    console.log(`Hotkey sent: ${combo}`);
  },

  pos() {
    const out = ps(`Add-Type -AssemblyName System.Windows.Forms
$pos = [System.Windows.Forms.Cursor]::Position
"$($pos.X),$($pos.Y)"`);
    console.log(`Cursor position: ${out}`);
    return out;
  }
};

// CLI usage
if (require.main === module) {
  const [,, action, ...args] = process.argv;
  if (!action || !actions[action]) {
    console.log('Usage: node control.js <action> [args]');
    console.log('Actions: move <x> <y> | click <x> <y> [left|right] | type <text> | key <code> | hotkey <combo> | pos');
    process.exit(1);
  }
  actions[action](...args);
}

module.exports = actions;
