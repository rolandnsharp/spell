#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import stripAnsi from 'strip-ansi';

// --- Configuration & Setup ---

/**
 * @typedef {object} WordData
 * @property {string} word - The spelling word.
 * @property {string} definition - The cached definition of the word.
 * @property {number} level - The Spaced Repetition System (SRS) level of the word (0 = new, higher = better known).
 * @property {string} lastPracticed - ISO date string of the last time the word was practiced.
 * @property {string} nextReviewDate - ISO date string of the next scheduled review for the word.
 */

const state = {
  wordList: [],
  currentIndex: 0,
  userInput: '',
  hasStartedTyping: false,
  mode: 'typing',
  currentWordStreak: 0,
  repeatCount: 3,
  jsonFilepath: '',
  showSuccessIndicator: false,
  showErrorIndicator: false,
  hideWord: false,
};

// --- Terminal Helpers ---

function hideCursor() { process.stdout.write('\x1B[?25l'); }
function showCursor() { process.stdout.write('\x1B[?25h'); }
function clearScreen() { process.stdout.write('\x1Bc'); }

const HORIZONTAL_MARGIN = 4; // General padding on each side for most content
const DEFINITION_INNER_PADDING = 4; // Additional padding *within* the definition's content area

/**
 * Centers a string of text within a given width, with optional horizontal margins.
 * @param {string} text - The text to center.
 * @param {number} [outerMargin=0] - The horizontal margin to apply on both sides *outside* the content.
 * @returns {string} The padded and centered text.
 */
function centerWithMargin(text, outerMargin = 0) {
  const totalTerminalWidth = process.stdout.columns || 80;
  const availableContentWidth = totalTerminalWidth - (outerMargin * 2);
  
  return text.split('\n').map(line => {
    const strippedLineLength = stripAnsi(line).length;
    const pad = Math.floor((availableContentWidth - strippedLineLength) / 2);
    return ' '.repeat(outerMargin + Math.max(0, pad)) + line;
  }).join('\n');
}

/**
 * Word-wraps text to fit within a given width.
 * @param {string} text - The raw text to wrap.
 * @param {number} width - The maximum width for each line.
 * @returns {string} The wrapped text.
 */
function wrapText(text, width) {
    let wrappedLines = [];
    let currentLine = '';
    const words = text.split(/(\s+)/); // Split by whitespace, keeping delimiters

    for (const word of words) {
        const wordLength = stripAnsi(word).length;
        if (stripAnsi(currentLine + word).length > width && stripAnsi(currentLine).length > 0) {
            wrappedLines.push(currentLine.trim());
            currentLine = word.trim();
        } else {
            currentLine += word;
        }
    }
    if (stripAnsi(currentLine).length > 0) wrappedLines.push(currentLine.trim());

    return wrappedLines.join('\n');
}


// --- Help Screen ---

function displayHelp() {
  clearScreen();
  console.log(centerWithMargin(chalk.bold.yellow('\nSpell: A Science-Based Spelling Trainer'), HORIZONTAL_MARGIN));
  console.log(centerWithMargin(chalk.gray('----------------------------------------'), HORIZONTAL_MARGIN));
  console.log(centerWithMargin('\n' + chalk.bold('Usage:'), HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('spell')}                           - Start a practice session.`, HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('spell <word>')}                    - Add a new word or reset an existing one.`, HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('spell --import <file>')}          - Bulk import words from a text file.`, HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('spell --manage or -m')}            - Enter interactive word management mode.`, HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('spell --clear or -c')}             - Interactively delete all words.`, HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('spell --repeat <n> or -r <n>')} - Set drill count for practice sessions (e.g., -r 3).`, HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('spell --hide-word or -d')}         - Practice with the word hidden (definition-only).`, HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('spell --help or -h')}              - Show this help screen.`, HORIZONTAL_MARGIN));
  console.log(centerWithMargin('\n' + chalk.bold('In-Session Controls (Practice Mode):'), HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('Ctrl+D')}                          - Delete the current word from your list.`, HORIZONTAL_MARGIN));
  console.log(centerWithMargin(`  ${chalk.cyan('Ctrl+C')}                          - Exit the session at any time.`, HORIZONTAL_MARGIN));
  process.exit(0);
}


// --- Utility Functions ---

function getReviewInterval(level) {
  if (level <= 0) return 0;
  const intervals = [1, 3, 7, 16, 35, 70, 140];
  const calculatedInterval = intervals[level - 1] || 180;
  return Math.min(calculatedInterval, 180);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function saveWordList() {
  fs.writeFileSync(state.jsonFilepath, JSON.stringify(state.wordList, null, 2));
}

function findNextWordToReview() {
  const now = new Date();
  const dueWords = state.wordList
    .map((word, index) => ({ ...word, originalIndex: index }))
    .filter(word => new Date(word.nextReviewDate) <= now);

  if (dueWords.length === 0) return false;

  dueWords.sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));
  state.currentIndex = dueWords[0].originalIndex;
  return true;
}

// --- API & External Data ---

async function getDefinition(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    if (!res.ok) return '(no definition found)';
    const data = await res.json();
    return data[0]?.meanings[0]?.definitions[0]?.definition || '(no definition found)';
  } catch (error) {
    return '(could not fetch definition)';
  }
}

// --- Core Logic Functions ---

async function addOrResetWord(word) {
  const existingWordIndex = state.wordList.findIndex(w => w.word.toLowerCase() === word.toLowerCase());
  const now = new Date().toISOString();

  if (existingWordIndex !== -1) {
    state.wordList[existingWordIndex].level = 0;
    state.wordList[existingWordIndex].lastPracticed = now;
    state.wordList[existingWordIndex].nextReviewDate = now;
    return `"${word}" already exists. Progress has been reset.`;
  } else {
    process.stdout.write(`Fetching definition for new word "${word}"... `);
    const definition = await getDefinition(word);
    state.wordList.push({ word, definition, level: 0, lastPracticed: now, nextReviewDate: now });
    return `Added new word: "${word}".`;
  }
}

async function migrateTxtToJson(txtFilepath, jsonFilepath) {
  console.log(chalk.yellow('Old `spellingList.txt` found. Migrating...'));
  const oldWords = fs.readFileSync(txtFilepath, 'utf8').split('\n').map(w => w.trim()).filter(Boolean);
  for (const word of oldWords) {
    await addOrResetWord(word);
    console.log();
  }
  saveWordList();
  fs.renameSync(txtFilepath, `${txtFilepath}.bak`);
  console.log(chalk.bold.green('Migration complete! Old file renamed to `spellingList.txt.bak`.'));
}

const globalRl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function initialize() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) displayHelp();

  const appDir = path.join(os.homedir(), '.spell');
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir);
  state.jsonFilepath = path.join(appDir, 'spellingList.json');
  const oldTxtFilepath = path.join(appDir, 'spellingList.txt');

  if (!fs.existsSync(state.jsonFilepath) && fs.existsSync(oldTxtFilepath)) {
    await migrateTxtToJson(oldTxtFilepath, state.jsonFilepath);
  } else if (fs.existsSync(state.jsonFilepath)) {
    const fileContent = fs.readFileSync(state.jsonFilepath, 'utf8');
    state.wordList = fileContent ? JSON.parse(fileContent) : [];
    let updated = false;
    state.wordList.forEach(w => { if (w.level === undefined) { w.level = 0; w.lastPracticed = new Date().toISOString(); w.nextReviewDate = new Date().toISOString(); updated = true; } });
    if (updated) saveWordList();
  } else {
    fs.writeFileSync(state.jsonFilepath, '[]');
  }
  
  if (args.includes('--clear') || args.includes('-c')) {
    await clearList();
  }

  const importIndex = args.findIndex(arg => arg === '--import');
  if (importIndex !== -1 && args[importIndex + 1]) {
    await importList(args[importIndex + 1]);
  }

  if (args.includes('--manage') || args.includes('-m')) state.mode = 'manage';
  if (args.includes('--hide-word') || args.includes('-d')) state.hideWord = true;

  const repeatIndex = args.findIndex(arg => arg === '-r' || arg === '--repeat');
  state.repeatCount = (repeatIndex !== -1 && args[repeatIndex + 1]) ? parseInt(args[repeatIndex + 1], 10) : 3;
  
  const wordToAdd = args.find(arg => !arg.startsWith('-') && isNaN(arg) && !fs.existsSync(path.resolve(arg)));
  if (wordToAdd) {
    const result = await addOrResetWord(wordToAdd);
    saveWordList();
    console.log(chalk.green(result));
    process.exit(0);
  }
}

// --- Main Modes ---

async function clearList() {
  console.log(chalk.bold.red('This will permanently delete all words from your spelling list.'));
  return new Promise(resolve => {
    globalRl.question('Are you sure? (y/N) ', answer => {
      if (answer.toLowerCase() === 'y') {
        state.wordList = [];
        saveWordList();
        console.log(chalk.green('Spelling list has been cleared.'));
      } else {
        console.log(chalk.yellow('Operation cancelled.'));
      }
      globalRl.close();
      resolve();
      process.exit(0);
    });
  });
}

async function importList(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`Error: File not found at "${filePath}"`));
    process.exit(1);
  }
  const words = fs.readFileSync(filePath, 'utf8').split('\n').map(w => w.trim()).filter(Boolean);
  let newCount = 0;
  for (const word of words) {
    const originalLength = state.wordList.length;
    await addOrResetWord(word);
    if (state.wordList.length > originalLength) newCount++;
    console.log();
  }
  saveWordList();
  console.log(chalk.bold.green(`Import complete. Added ${newCount} new words.`));
  process.exit(0);
}

function censorWordInDefinition(word, definition) {
  let root = word;
  if (word.length > 4 && word.endsWith('y')) root = word.slice(0, -1);
  else if (word.length > 4 && word.endsWith('e')) root = word.slice(0, -1);
  const regex = new RegExp(`\\b${root}\\w*\\b`, 'gi');
  return definition.replace(regex, match => '*'.repeat(match.length));
}

function render(wordOverride = null, colorFn = chalk.white) { 
  const currentWord = state.wordList[state.currentIndex];
  if (!currentWord) return;

  let displayWord;
  if (wordOverride !== null) {
    displayWord = wordOverride.split('').join(' ');
  } else if (!state.hasStartedTyping) {
    if (state.hideWord) {
      displayWord = '_ '.repeat(currentWord.word.length).trim();
    } else {
      displayWord = currentWord.word.split('').join(' ');
    }
  } else {
    const typed = state.userInput.split('').join(' ');
    const remaining = currentWord.word.length - state.userInput.length;
    const blanks = ' '.repeat(remaining * 2 - 1);
    displayWord = typed + (blanks.length > 0 ? ' ' + blanks : '');
  }
  
  const censoredDefinition = censorWordInDefinition(currentWord.word, currentWord.definition);

  clearScreen();
  
  // Build entire output string first
  let outputBuffer = '';

  // Persistent Header (Correct/Incorrect/Onboarding messages)
  let headerMessage = '';
  if (state.showSuccessIndicator) {
    headerMessage = chalk.green('✔ Correct!');
    state.showSuccessIndicator = false;
  } else if (state.showErrorIndicator) {
    headerMessage = chalk.red('✖ Incorrect!');
    state.showErrorIndicator = false;
  } else if (state.mode === 'typing' && !state.hasStartedTyping) {
    headerMessage = chalk.dim('Start typing the current spelling word!');
  }
  outputBuffer += centerWithMargin(headerMessage, HORIZONTAL_MARGIN) + '\n';
  outputBuffer += '\n'; // Spacer line (Row 2)

  // Dashboard - Boxed Word Display
  const wordColorFn = (state.mode === 'error') ? chalk.red : colorFn;
  const wordLine = `${chalk.bold(wordColorFn(displayWord))}`;
  const levelLine = `${chalk.dim('Level:')}  ${currentWord.level}`;
  const streakLine = `${chalk.dim('Streak:')} ${state.currentWordStreak} / ${state.repeatCount}`;
  // Determine the widest line for box drawing (stripping ANSI codes for accurate length)
  // The box will only be around the word line.
  const boxInnerContentWidth = stripAnsi(wordLine).length + 1 + 2; // +1 for padding, +2 for internal padding
  
  // Build the un-centered box string for the word only
  let boxedWordContent = '';
  boxedWordContent += chalk.gray('╔') + chalk.gray('═'.repeat(boxInnerContentWidth)) + chalk.gray('╗\n');
  const paddingNeeded = boxInnerContentWidth - stripAnsi(wordLine).length - 1; // Subtract 1 for the new padding space
  boxedWordContent += chalk.gray('║ ') + wordLine + ' '.repeat(paddingNeeded) + chalk.gray('║\n');
  boxedWordContent += chalk.gray('╚') + chalk.gray('═'.repeat(boxInnerContentWidth)) + chalk.gray('╝');
  
  outputBuffer += centerWithMargin(boxedWordContent, HORIZONTAL_MARGIN) + '\n';

  // Render Level and Streak lines separately, outside the box
  outputBuffer += centerWithMargin(levelLine, HORIZONTAL_MARGIN) + '\n';
  outputBuffer += centerWithMargin(streakLine, HORIZONTAL_MARGIN) + '\n';

  // Definition
  outputBuffer += '\n'; // Spacer (after box)
  outputBuffer += centerWithMargin(chalk.dim('Definition:'), HORIZONTAL_MARGIN) + '\n';
  
  const totalTerminalWidth = process.stdout.columns || 80;
  const definitionContentWidth = totalTerminalWidth - (HORIZONTAL_MARGIN * 2) - (DEFINITION_INNER_PADDING * 2);
  const wrappedDefinition = wrapText(censoredDefinition, definitionContentWidth);

  const paddedDefinitionBlock = wrappedDefinition.split('\n').map(line => {
    const strippedLength = stripAnsi(line).length;
    const paddingLeft = ' '.repeat(DEFINITION_INNER_PADDING + Math.floor((definitionContentWidth - strippedLength) / 2));
    const paddingRight = ' '.repeat(DEFINITION_INNER_PADDING + Math.ceil((definitionContentWidth - strippedLength) / 2));
    return paddingLeft + line + paddingRight;
  }).join('\n');

  outputBuffer += chalk.dim(paddedDefinitionBlock);

  // Finally, write the entire buffer to stdout
  process.stdout.write(outputBuffer);

  // Cursor logic (centralized and robust)
  if (state.mode === 'typing') {
    const totalTerminalWidth = process.stdout.columns || 80;
    const boxVisualWidth = stripAnsi(boxedWordContent.split('\n')[0]).length; // Get width of top box border
    // Calculate the left edge of the box on the screen, relative to the terminal's left edge.
    const boxLeftEdgeOnScreen = Math.floor((totalTerminalWidth - boxVisualWidth) / 2);
    
    // The 'Word:' line is the second line (index 1) of the `linesContent` array used to build `boxedContent`.
    const wordTextVisualOffset = 2; // 1 for the left box border '║' + 1 for padding

    // Cursor row: Header message (1 line) + Spacer (1 line) + Box top border (1 line) = 3 lines before the wordLine. So row 4.
    const cursorRow = 4;

    let cursorColumn;
    if (!state.hasStartedTyping) {
        // Position over the first letter of the word. Column is 1-based.
        cursorColumn = boxLeftEdgeOnScreen + wordTextVisualOffset + 1; 
    } else {
        // Position for the *next* character to be typed, after the spaced input
        const charsTyped = state.userInput.length;
        cursorColumn = boxLeftEdgeOnScreen + wordTextVisualOffset + (charsTyped * 2) + 1;
    }

    process.stdout.write(`\x1B[${cursorRow};${cursorColumn}H`); // Move cursor
    
    if (!state.hasStartedTyping) {
      process.stdout.write('\x1B[?12h'); // Start blinking
      showCursor(); 
    } else {
      process.stdout.write('\x1B[?12l'); // Stop blinking
      showCursor(); 
    }
  } else {
    hideCursor(); 
  }
}

function flash(colorFn) {
  render(state.wordList[state.currentIndex].word, colorFn);
}

function renderManageScreen(rl, message = '') { 
  clearScreen(); 
  process.stdout.write(centerWithMargin(chalk.bold.yellow('\n-- Interactive Word Manager --'), HORIZONTAL_MARGIN) + '\n'); 
  process.stdout.write(centerWithMargin(chalk.gray('------------------------------'), HORIZONTAL_MARGIN) + '\n'); 
  if (state.wordList.length === 0) {
    process.stdout.write(centerWithMargin(chalk.yellow('Your spelling list is empty.'), HORIZONTAL_MARGIN) + '\n'); 
  } else {
    state.wordList.forEach((wordData, index) => {
      const nextReview = new Date(wordData.nextReviewDate);
      const now = new Date();
      let status = '';
      if (wordData.level === 0) status = chalk.blue('(New)');
      else if (nextReview <= now) status = chalk.red('(Due NOW!)');
      else {
        const diffDays = Math.ceil(Math.abs(nextReview - now) / (1000 * 60 * 60 * 24));
        status = chalk.green(`(Level ${wordData.level}, in ${diffDays} days)`);
      }
      process.stdout.write(centerWithMargin(`  ${index + 1}. ${wordData.word} ${status}`, HORIZONTAL_MARGIN) + '\n'); 
    }); 
  }
  process.stdout.write(centerWithMargin('\n' + chalk.bold('Actions:'), HORIZONTAL_MARGIN) + '\n'); 
  process.stdout.write(centerWithMargin('  (d)elete <number>    - Delete a word (e.g., d 2)', HORIZONTAL_MARGIN) + '\n'); 
  process.stdout.write(centerWithMargin('  (r)eset <number>     - Reset a word\'s progress (e.g., r 3)', HORIZONTAL_MARGIN) + '\n'); 
  process.stdout.write(centerWithMargin('  (q)uit               - Exit management mode', HORIZONTAL_MARGIN) + '\n'); 
  process.stdout.write(centerWithMargin('\n' + chalk.dim(message), HORIZONTAL_MARGIN) + '\n'); 
  // Do not call rl.prompt here, it is called after renderManageScreen.
}

async function manageWords() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  state.mode = 'manage';
  renderManageScreen(rl);
  showCursor();
  rl.on('line', (input) => {
    const parts = input.trim().split(' ');
    const command = parts[0].toLowerCase();
    const index = parseInt(parts[1], 10) - 1;
    if (command === 'q') { rl.close(); return; }
    if (isNaN(index) || index < 0 || index >= state.wordList.length) { renderManageScreen(rl, chalk.red('Invalid command or word number.')); return; }
    let message = '';
    const wordName = state.wordList[index].word;
    switch (command) {
      case 'd': state.wordList.splice(index, 1); saveWordList(); message = chalk.green(`Deleted "${wordName}".`); break;
      case 'r': const now = new Date().toISOString(); state.wordList[index].level = 0; state.wordList[index].lastPracticed = now; state.wordList[index].nextReviewDate = now; saveWordList(); message = chalk.green(`Reset progress for "${wordName}".`); break;
      default: message = chalk.red('Unknown command.'); break;
    }
    renderManageScreen(rl, message);
  });
  rl.on('close', () => { showCursor(); process.exit(0); });
}

async function handleCorrectGuess() {
  let currentWordData = state.wordList[state.currentIndex];
  if (state.userInput === currentWordData.word) {
    state.mode = 'success';
    state.userInput = '';
    state.hasStartedTyping = false;
    state.currentWordStreak++;
    state.showSuccessIndicator = true;
    if (state.currentWordStreak >= state.repeatCount) {
      currentWordData.level++;
      currentWordData.lastPracticed = new Date().toISOString();
      const interval = getReviewInterval(currentWordData.level);
      currentWordData.nextReviewDate = addDays(new Date(), interval).toISOString();
      saveWordList();
      state.currentWordStreak = 0;
      if (!findNextWordToReview()) {
        clearScreen();
        process.stdout.write(centerWithMargin(chalk.bold.yellow('✨ You completed all due words! ✨'), HORIZONTAL_MARGIN) + '\n');
        showCursor();
        process.exit();
        return;
      }
    }
    state.mode = 'typing';
    render();
  } else {
    render();
  }
}

function handleIncorrectGuess() {
  state.mode = 'error';
  state.userInput = '';
  state.hasStartedTyping = false;
  state.currentWordStreak = 0;
  state.showErrorIndicator = true;
  flash(chalk.red);

  setTimeout(() => {
    state.mode = 'typing';
    render();
  }, 700);
}

function onKeyPress(str, key) {
  if (key.sequence === '\u0003') {
    showCursor();
    process.exit();
  }
  if (!state.hasStartedTyping) {
    if (str.match(/^[a-zA-Z]$/)) { // Only start on a letter press
      state.hasStartedTyping = true;
    } else {
      return; // Ignore non-letter keys at the start
    }
  }
  
  if (state.mode === 'typing') {
    if (key.name === 'backspace') {
      state.userInput = state.userInput.slice(0, -1);
      render();
    } else if (str && !key.ctrl && !key.meta) { // Ignore special keys
      state.userInput += str;
      if (state.wordList[state.currentIndex].word.startsWith(state.userInput)) {
        if (state.userInput === state.wordList[state.currentIndex].word) {
          handleCorrectGuess();
        } else {
          render();
        }
      } else {
        handleIncorrectGuess();
      }
    }
  }
}

async function onData(chunk) {
  if (chunk.length === 1 && chunk[0] === 4) { // Ctrl+D
    state.wordList.splice(state.currentIndex, 1);
    saveWordList();
    if (state.wordList.length === 0) {
      clearScreen();
      process.stdout.write(centerWithMargin(chalk.yellow('Spelling list is now empty.'), HORIZONTAL_MARGIN) + '\n');
      showCursor();
      process.exit();
      return;
    }
    state.currentIndex = 0;
    state.userInput = '';
    state.hasStartedTyping = false;
    state.mode = 'typing';
    state.currentWordStreak = 0;
    render();
  }
}

// --- Main Application Logic ---

async function main() {
  // This initial call to createInterface and then close it ensures process.stdin is in normal mode
  // if it's a TTY, preventing interference with raw mode later if needed.
  const initialRl = readline.createInterface({ input: process.stdin, output: process.stdout });
  initialRl.close(); 

  await initialize();

  if (state.mode === 'manage') {
    await manageWords();
    return;
  }

  if (state.wordList.length === 0) {
    process.stdout.write(centerWithMargin(chalk.yellow('Your spelling list is empty.\nAdd a word with `spell <word>`'), HORIZONTAL_MARGIN) + '\n');
    process.exit(0);
  }

  if (!findNextWordToReview()) {
    process.stdout.write(centerWithMargin(chalk.bold.yellow('✨ No words due for review right now! Come back later. ✨'), HORIZONTAL_MARGIN) + '\n');
    process.exit(0);
  }

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('keypress', onKeyPress);
  process.stdin.on('data', onData);
  process.on('exit', showCursor);

  render();
}

// --- Run Application ---
main().catch(err => {
  showCursor();
  console.error(centerWithMargin('\nAn unexpected error occurred:', HORIZONTAL_MARGIN), err) + '\n';
  process.exit(1);
});
