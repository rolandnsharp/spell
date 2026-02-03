#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';

// --- Configuration & Setup ---

/**
 * @typedef {object} WordData
 * @property {string} word - The spelling word.
 * @property {string} definition - The cached definition of the word.
 * @property {number} level - The Spaced Repetition System (SRS) level of the word (0 = new, higher = better known).
 * @property {string} lastPracticed - ISO date string of the last time the word was practiced.
 * @property {string} nextReviewDate - ISO date string of the next scheduled review for the word.
 */

/**
 * Application state.
 * @property {WordData[]} wordList - The list of word objects to practice.
 * @property {number} currentIndex - The index of the current word in the list.
 * @property {string} userInput - The user's current typed input.
 * @property {boolean} hasStartedTyping - Whether the user has started typing the current word.
 * @property {'typing'|'success'|'error'|'manage'} mode - The current state of the application.
 * @property {number} currentWordStreak - The number of consecutive correct spellings for the *current* word in a drill session.
 * @property {number} repeatCount - The number of times a word must be spelled correctly in a row to advance its SRS level.
 * @property {string} jsonFilepath - The absolute path to the spelling list JSON file.
 * @property {boolean} showSuccessIndicator - A flag to show a non-blocking success message.
 */
const state = {
  wordList: [],
  currentIndex: 0,
  userInput: '',
  hasStartedTyping: false,
  mode: 'typing',
  currentWordStreak: 0,
  repeatCount: 1,
  jsonFilepath: '',
  showSuccessIndicator: false,
};

// --- Terminal Helpers ---

function hideCursor() { process.stdout.write('\x1B[?25l'); }
function showCursor() { process.stdout.write('\x1B?25h'); }
function clearScreen() { process.stdout.write('\x1Bc'); }

// --- Help Screen ---

function displayHelp() {
  clearScreen();
  console.log(chalk.bold.yellow('\nSpell: A Science-Based Spelling Trainer'));
  console.log(chalk.gray('----------------------------------------'));
  console.log('\n' + chalk.bold('Usage:'));
  console.log(`  ${chalk.cyan('spell')}                           - Start a practice session.`);
  console.log(`  ${chalk.cyan('spell <word>')}                    - Add a new word or reset an existing one.`);
  console.log(`  ${chalk.cyan('spell --import <file>')}          - Bulk import words from a text file.`);
  console.log(`  ${chalk.cyan('spell --manage or -m')}            - Enter interactive word management mode.`);
  console.log(`  ${chalk.cyan('spell --clear')}                   - Interactively delete all words.`);
  console.log(`  ${chalk.cyan('spell -r <number>')}               - Set drill count for practice sessions (e.g., -r 3).`);
  console.log(`  ${chalk.cyan('spell --help or -h')}              - Show this help screen.`);
  console.log('\n' + chalk.bold('In-Session Controls (Practice Mode):'));
  console.log(`  ${chalk.cyan('Ctrl+D')}                          - Delete the current word from your list.`);
  console.log(`  ${chalk.cyan('Ctrl+C')}                          - Exit the session at any time.`);
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
  
  if (args.includes('--clear')) {
    await clearList();
  }

  const importIndex = args.findIndex(arg => arg === '--import');
  if (importIndex !== -1 && args[importIndex + 1]) {
    await importList(args[importIndex + 1]);
  }

  if (args.includes('--manage') || args.includes('-m')) state.mode = 'manage';

  const repeatIndex = args.findIndex(arg => arg === '-r' || arg === '--repeat');
  state.repeatCount = (repeatIndex !== -1 && args[repeatIndex + 1]) ? parseInt(args[repeatIndex + 1], 10) : 1;
  
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
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(chalk.bold.red('This will permanently delete all words from your spelling list.'));
  return new Promise(resolve => {
    rl.question('Are you sure? (y/N) ', answer => {
      if (answer.toLowerCase() === 'y') {
        state.wordList = [];
        saveWordList();
        console.log(chalk.green('Spelling list has been cleared.'));
      } else {
        console.log(chalk.yellow('Operation cancelled.'));
      }
      rl.close();
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

function center(text) { const width = process.stdout.columns || 80; return text.split('\n').map(line => ' '.repeat(Math.max(0, Math.floor((width - line.length) / 2))) + line).join('\n'); }
function censorWordInDefinition(word, definition) { let root = word; if (word.length > 4 && word.endsWith('y')) root = word.slice(0, -1); else if (word.length > 4 && word.endsWith('e')) root = word.slice(0, -1); const regex = new RegExp(`\\b${root}\\w*\\b`, 'gi'); return definition.replace(regex, match => '*'.repeat(match.length)); }
function render(wordOverride = null, colorFn = chalk.white) { 
  const currentWord = state.wordList[state.currentIndex];
  if (!currentWord) return;

  let displayWord;
  if (wordOverride !== null) displayWord = wordOverride;
  else if (!state.hasStartedTyping) displayWord = currentWord.word;
  else { const blanks = ' '.repeat(currentWord.word.length - state.userInput.length); displayWord = state.userInput + blanks; }

  const censoredDefinition = censorWordInDefinition(currentWord.word, currentWord.definition);
  clearScreen();
  hideCursor();
  
  if (state.showSuccessIndicator) {
    console.log(chalk.green('✔ Correct!'));
    state.showSuccessIndicator = false;
  } else {
    console.log('\n');
  }

  console.log('\n');
  console.log(center(chalk.dim(censoredDefinition)));
  console.log('\n\n');
  console.log(center(colorFn(displayWord)));
}
function flash(colorFn) { const word = state.wordList[state.currentIndex].word; render(word, colorFn); }

function renderManageScreen(rl, message = '') { clearScreen(); console.log(chalk.bold.yellow('\n-- Interactive Word Manager --')); console.log(chalk.gray('------------------------------')); if (state.wordList.length === 0) { console.log(center(chalk.yellow('Your spelling list is empty.'))); } else { state.wordList.forEach((wordData, index) => { const nextReview = new Date(wordData.nextReviewDate); const now = new Date(); let status = ''; if (wordData.level === 0) status = chalk.blue('(New)'); else if (nextReview <= now) status = chalk.red('(Due NOW!)'); else { const diffDays = Math.ceil(Math.abs(nextReview - now) / (1000 * 60 * 60 * 24)); status = chalk.green(`(Level ${wordData.level}, in ${diffDays} days)`); } console.log(`  ${index + 1}. ${wordData.word} ${status}`); }); } console.log('\n' + chalk.bold('Actions:')); console.log('  (d)elete <number>    - Delete a word (e.g., d 2)'); console.log('  (r)eset <number>     - Reset a word\'s progress (e.g., r 3)'); console.log('  (q)uit               - Exit management mode'); console.log('\n' + chalk.dim(message)); rl.prompt(); }
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
        console.log(center(chalk.bold.yellow('✨ You completed all due words! ✨')));
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
  flash(chalk.red);
  
  // THE FIX: Only reset the session state, not the long-term SRS data.
  // This forces the user to re-try the same word immediately.
  state.userInput = '';
  state.hasStartedTyping = false;
  state.currentWordStreak = 0; // Reset drill progress for this word.

  // After the penalty, re-render the same word.
  setTimeout(() => {
    state.mode = 'typing';
    render();
  }, 700);
}

function onKeyPress(str, key) { if (key.sequence === '\u0003') { showCursor(); process.exit(); } if (!state.hasStartedTyping) state.hasStartedTyping = true; if (state.mode === 'typing') { const word = state.wordList[state.currentIndex].word; state.userInput += str; if (word.startsWith(state.userInput)) handleCorrectGuess(); else handleIncorrectGuess(); } }
async function onData(chunk) { if (chunk.length === 1 && chunk[0] === 4) { state.wordList.splice(state.currentIndex, 1); saveWordList(); if (state.wordList.length === 0) { clearScreen(); console.log(center(chalk.yellow('Spelling list is now empty.'))); showCursor(); process.exit(); return; } state.currentIndex = 0; state.userInput = ''; state.hasStartedTyping = false; state.mode = 'typing'; state.currentWordStreak = 0; render(); } }

// --- Main Application Logic ---

async function main() {
  await initialize();

  if (state.mode === 'manage') {
    await manageWords();
    return;
  }

  if (state.wordList.length === 0) {
    console.log(center(chalk.yellow('Your spelling list is empty.\nAdd a word with `spell <word>`')));
    process.exit(0);
  }

  if (!findNextWordToReview()) {
    console.log(center(chalk.bold.yellow('✨ No words due for review right now! Come back later. ✨')));
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
  console.error('\nAn unexpected error occurred:', err);
  process.exit(1);
});
