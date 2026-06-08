#!/usr/bin/env node
/**
 * start-ios.js — reliably launch Expo on an iPhone simulator.
 *
 * Expo reads com.apple.iphonesimulator CurrentDeviceUDID (a macOS system
 * preference) to decide which simulator to use. If that preference points to
 * a deleted device (e.g. after an Xcode upgrade), expo start --ios fails with
 * "Invalid device". This script pre-boots a valid iPhone simulator so Expo's
 * "use the already-booted device" path runs instead, bypassing the stale pref.
 */
const { execSync, spawn } = require('child_process');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

// Check if any iPhone simulator is already booted.
let booted = null;
try {
  const raw = run('xcrun simctl list devices booted --json');
  const data = JSON.parse(raw);
  for (const devices of Object.values(data.devices)) {
    const iphone = devices.find((d) => d.name.includes('iPhone') && d.state === 'Booted');
    if (iphone) { booted = iphone.udid; break; }
  }
} catch { /* simctl not available — let expo handle it */ }

if (!booted) {
  // Nothing booted — find and boot the best available iPhone simulator.
  try {
    const raw = run('xcrun simctl list devices available --json');
    const data = JSON.parse(raw);
    let best = null;
    for (const devices of Object.values(data.devices)) {
      for (const d of devices) {
        if (d.name.includes('iPhone') && d.isAvailable !== false) {
          best = d.udid; // last one wins — typically newest runtime
        }
      }
    }
    if (best) {
      console.log(`Booting simulator ${best}…`);
      try { run(`xcrun simctl boot ${best}`); } catch { /* already booted is fine */ }
    }
  } catch { /* fall through to expo which will report the error clearly */ }
}

// Hand off to expo — inherit stdio so Metro output flows through normally.
const expo = spawn('npx', ['expo', 'start', '--ios'], { stdio: 'inherit', shell: true });
expo.on('exit', (code) => process.exit(code ?? 0));
