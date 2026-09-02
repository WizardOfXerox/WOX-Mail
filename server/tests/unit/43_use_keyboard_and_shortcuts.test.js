/**
 * Test Suite 43: Keyboard Shortcut Engine & Modifier Isolation Tests
 * Verifies that Ctrl+C / Cmd+C copy operations are decoupled from single-character shortcuts.
 */

import assert from 'assert';

console.log('[TEST] Running Suite 43: Keyboard Shortcut Engine & Modifier Isolation...');

// Mock simulator for useKeyboard event dispatcher
function simulateKeydown(event, shortcuts, selectedText = '') {
  let executedAction = null;

  // 1. Guard against IME composition
  if (event.isComposing || event.keyCode === 229) return null;

  // 2. Guard against inputs
  if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
    if (event.key === 'Escape' && shortcuts['Escape']) {
      return shortcuts['Escape']();
    }
    return null;
  }

  const hasCtrlOrCmd = event.ctrlKey || event.metaKey;
  const hasAlt = event.altKey;
  const hasShift = event.shiftKey;

  // 3. Modifier combination check
  if (hasCtrlOrCmd || hasAlt) {
    const keyParts = [];
    if (hasCtrlOrCmd) keyParts.push('Ctrl+');
    if (hasShift) keyParts.push('Shift+');
    if (hasAlt) keyParts.push('Alt+');
    keyParts.push(event.key);

    const combinedKey = keyParts.join('');
    const lowerCombinedKey = keyParts.slice(0, -1).join('') + event.key.toLowerCase();

    if (shortcuts[combinedKey]) {
      executedAction = shortcuts[combinedKey]();
    } else if (shortcuts[lowerCombinedKey]) {
      executedAction = shortcuts[lowerCombinedKey]();
    }
    // Strict isolation: Never fall through to naked single characters
    return executedAction;
  }

  // 4. Naked single key shortcuts
  if (selectedText && selectedText.length > 0 && event.key.length === 1 && !['j', 'k', 'Escape'].includes(event.key)) {
    return null; // Preserve selection
  }

  if (shortcuts[event.key]) {
    executedAction = shortcuts[event.key]();
  } else if (shortcuts[event.key.toLowerCase()]) {
    executedAction = shortcuts[event.key.toLowerCase()]();
  }

  return executedAction;
}

// Test 1: Single key 'c' opens compose
const shortcuts = {
  c: () => 'OPEN_COMPOSE',
  'Ctrl+k': () => 'OPEN_PALETTE',
  'Ctrl+.': () => 'TOGGLE_DOCK',
  j: () => 'NEXT_EMAIL',
  k: () => 'PREV_EMAIL',
};

const resultSingleC = simulateKeydown({ key: 'c', ctrlKey: false, metaKey: false }, shortcuts);
assert.strictEqual(resultSingleC, 'OPEN_COMPOSE', 'Single key c should trigger compose');

// Test 2: Ctrl+C does NOT open compose and passes safely
const resultCtrlC = simulateKeydown({ key: 'c', ctrlKey: true, metaKey: false }, shortcuts);
assert.strictEqual(resultCtrlC, null, 'Ctrl+C should NOT trigger single key c compose handler');

// Test 3: Cmd+C on macOS does NOT open compose
const resultCmdC = simulateKeydown({ key: 'c', ctrlKey: false, metaKey: true }, shortcuts);
assert.strictEqual(resultCmdC, null, 'Cmd+C should NOT trigger single key c compose handler');

// Test 4: Compound Ctrl+k opens Command Palette
const resultCtrlK = simulateKeydown({ key: 'k', ctrlKey: true, metaKey: false }, shortcuts);
assert.strictEqual(resultCtrlK, 'OPEN_PALETTE', 'Ctrl+k should trigger Command Palette');

// Test 5: Compound Ctrl+. toggles Dock
const resultCtrlDot = simulateKeydown({ key: '.', ctrlKey: true, metaKey: false }, shortcuts);
assert.strictEqual(resultCtrlDot, 'TOGGLE_DOCK', 'Ctrl+. should toggle Dock');

// Test 6: Text selection protects typing 'c' from triggering compose
const resultSelectedC = simulateKeydown({ key: 'c', ctrlKey: false, metaKey: false }, shortcuts, 'highlighted text');
assert.strictEqual(resultSelectedC, null, 'Active text selection should prevent naked c from opening compose');

console.log('✓ Suite 43: All keyboard shortcut isolation tests passed (6/6)');
