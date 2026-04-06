/**
 * mouse-control.js — Real mouse/keyboard automation for Crown Media Group
 * Uses @jitsi/robotjs (pre-built, no VS Build Tools required)
 *
 * Usage:
 *   node tools/mouse-control.js move 500 300
 *   node tools/mouse-control.js click 500 300
 *   node tools/mouse-control.js type "Hello World"
 *   node tools/mouse-control.js key enter
 *   node tools/mouse-control.js pos           ← print current mouse position
 *   node tools/mouse-control.js screenshot    ← capture screen pixel info
 */

const robot = require('@jitsi/robotjs');

// Smooth mouse movement speed
robot.setMouseDelay(2);
robot.setKeyboardDelay(10);

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'move':
    robot.moveMouse(parseInt(args[0]), parseInt(args[1]));
    console.log(`Moved to (${args[0]}, ${args[1]})`);
    break;

  case 'click':
    if (args[0] && args[1]) robot.moveMouse(parseInt(args[0]), parseInt(args[1]));
    robot.mouseClick(args[2] || 'left');
    console.log(`Clicked at (${args[0] || 'current'}, ${args[1] || 'current'})`);
    break;

  case 'dblclick':
    if (args[0] && args[1]) robot.moveMouse(parseInt(args[0]), parseInt(args[1]));
    robot.mouseClick('left', true);
    console.log('Double-clicked');
    break;

  case 'type':
    robot.typeString(args.join(' '));
    console.log(`Typed: ${args.join(' ')}`);
    break;

  case 'key':
    robot.keyTap(args[0], args.slice(1)); // e.g. key ctrl c
    console.log(`Key: ${args.join('+')}`);
    break;

  case 'scroll':
    robot.scrollMouse(parseInt(args[0] || 0), parseInt(args[1] || -3));
    console.log(`Scrolled`);
    break;

  case 'pos':
    console.log(JSON.stringify(robot.getMousePos()));
    break;

  case 'screen':
    const size = robot.getScreenSize();
    console.log(JSON.stringify(size));
    break;

  default:
    console.log('Commands: move x y | click x y | dblclick x y | type "text" | key keyname | scroll x y | pos | screen');
}
