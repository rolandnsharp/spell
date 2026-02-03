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
 * @property {'typing'|'success'|'error'} mode - The current state of the typing game.
 * @property {number} currentWordStreak - The number of consecutive correct spellings for the *current* word in a drill session.
 * @property {number} repeatCount - The number of times a word must be spelled correctly in a row to advance its SRS level.
 * @property {string} jsonFilepath - The absolute path to the spelling list JSON file.
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
};

// --- Utility Functions ---

/**
 * Calculates the number of days until the next review based on the SRS level.
 * @param {number} level - The current SRS level of the word.
 * @returns {number} Days until next review.
 */
function getReviewInterval(level) {
  if (level <= 0) return 0; // New word, practice immediately
  const intervals = [1, 3, 7, 16, 35, 70, 140];
  const calculatedInterval = intervals[level - 1] || 180;
  return Math.min(calculatedInterval, 180); // Cap at 180 days
}

/**
 * Adds days to a given date.
 * @param {Date} date - The starting date.
 * @param {number} days - The number of days to add.
 * @returns {Date} The new date.
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Saves the current word list state to the JSON file.
 */
function saveWordList() {
  fs.writeFileSync(state.jsonFilepath, JSON.stringify(state.wordList, null, 2));
}

/**
 * Finds the next word to review based on `nextReviewDate`.
 * @returns {boolean} True if a word was found, false otherwise.
 */
function findNextWordToReview() {
  const now = new Date();
  const dueWords = state.wordList
    .map((word, index) => ({ ...word, originalIndex: index }))
    .filter(word => new Date(word.nextReviewDate) <= now);

  if (dueWords.length === 0) {
    return false;
  }

  dueWords.sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));
  state.currentIndex = dueWords[0].originalIndex;
  return true;
}

// --- API & Utilities ---

/**
 * Fetches the definition of a word from an online dictionary API.
 * @param {string} word - The word to define.
 * @returns {Promise<string>} The definition, or a 'not found' message.
 */
async function getDefinition(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    if (!res.ok) return '(no definition found)';
    const data = await res.json();
    const def = data[0]?.meanings[0]?.definitions[0]?.definition;
    return def || '(no definition found)';
  } catch (error) {
    return '(could not fetch definition)';
  }
}

/**
 * Migrates from spellingList.txt to the new JSON format.
 */
async function migrateTxtToJson(txtFilepath, jsonFilepath) {
  console.log(chalk.yellow('Old `spellingList.txt` found. Migrating to new JSON format...'));
  const oldWords = fs.readFileSync(txtFilepath, 'utf8')
    .split('\n')
    .map(w => w.trim())
    .filter(w => w.length > 0);

  const newWordList = [];
  const now = new Date().toISOString();
  for (const word of oldWords) {
    process.stdout.write(`Fetching definition for "${word}"... `);
    const definition = await getDefinition(word);
    newWordList.push({ 
      word, 
      definition, 
      level: 0,
      lastPracticed: now,
      nextReviewDate: now
    });
    console.log(chalk.green('Done.'));
  }

  fs.writeFileSync(jsonFilepath, JSON.stringify(newWordList, null, 2));
  fs.renameSync(txtFilepath, `${txtFilepath}.bak`);
  console.log(chalk.bold.green('Migration complete! The old file has been renamed to `spellingList.txt.bak`.'));
  state.wordList = newWordList;
}

/**
 * Initializes the application, parses arguments, and handles data loading/migration.
 */
async function initialize() {
  const args = process.argv.slice(2);
  const repeatIndex = args.findIndex(arg => arg === '-r' || arg === '--repeat');
  state.repeatCount = (repeatIndex !== -1 && args[repeatIndex + 1]) ? parseInt(args[repeatIndex + 1], 10) : 1;
  const wordToAdd = args.find(arg => !arg.startsWith('-') && isNaN(arg));

  const appDir = path.join(os.homedir(), '.spell');
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir);
  
  state.jsonFilepath = path.join(appDir, 'spellingList.json');
  const oldTxtFilepath = path.join(appDir, 'spellingList.txt');

  if (!fs.existsSync(state.jsonFilepath) && fs.existsSync(oldTxtFilepath)) {
    await migrateTxtToJson(oldTxtFilepath, state.jsonFilepath);
  } else if (fs.existsSync(state.jsonFilepath)) {
    const fileContent = fs.readFileSync(state.jsonFilepath, 'utf8');
    state.wordList = fileContent ? JSON.parse(fileContent) : [];
    const now = new Date().toISOString();
    let updated = false;
    state.wordList.forEach(wordData => {
      if (wordData.level === undefined) {
        wordData.level = 0;
        wordData.lastPracticed = now;
        wordData.nextReviewDate = now;
        updated = true;
      }
    });
    if (updated) saveWordList();
  } else {
    fs.writeFileSync(state.jsonFilepath, '[]');
  }

  if (wordToAdd) {
    console.log(`Adding "${wordToAdd}" to the list...`);
    const definition = await getDefinition(wordToAdd);
    const now = new Date().toISOString();
    state.wordList.push({
      word: wordToAdd,
      definition,
      level: 0,
      lastPracticed: now,
      nextReviewDate: now
    });
    saveWordList();
    console.log(chalk.green('Done.'));
    process.exit(0);
  }
}

/**
 * Centers a string of text in the terminal.
 */
function center(text) {
  const width = process.stdout.columns || 80;
  return text.split('\n').map(line => {
    const pad = Math.floor((width - line.length) / 2);
    return ' '.repeat(Math.max(pad, 0)) + line;
  }).join('\n');
}

// --- UI & Rendering ---

function hideCursor() { process.stdout.write('\x1B[?25l'); }
function showCursor() { process.stdout.write('\x1B?25h'); }

/**
 * Censors the spelling word and its variations within its definition.
 */
function censorWordInDefinition(word, definition) {
  let root = word;
  if (word.length > 4 && word.endsWith('y')) {
    root = word.slice(0, -1);
  } else if (word.length > 4 && word.endsWith('e')) {
    root = word.slice(0, -1);
  }
  const regex = new RegExp(`\\b${root}\\w*\\b`, 'gi');
  return definition.replace(regex, match => '*'.repeat(match.length));
}

/**
 * Clears the screen and re-renders the UI based on the current state.
 */
function render(wordOverride = null, colorFn = chalk.white) {
  const currentWord = state.wordList[state.currentIndex];
  if (!currentWord) return;

  let displayWord;
  if (wordOverride !== null) {
    displayWord = wordOverride;
  } else if (!state.hasStartedTyping) {
    displayWord = currentWord.word;
  } else {
    const blanks = ' '.repeat(currentWord.word.length - state.userInput.length);
    displayWord = state.userInput + blanks;
  }

  const censoredDefinition = censorWordInDefinition(currentWord.word, currentWord.definition);

  process.stdout.write('\x1Bc');
  hideCursor();
  console.log('\n\n');
  console.log(center(chalk.dim(censoredDefinition)));
  console.log('\n\n');
  console.log(center(colorFn(displayWord)));
}

/**
 * Briefly flashes the word in a specific color.
 */
function flash(colorFn) {
  const word = state.wordList[state.currentIndex].word;
  render(word, colorFn);
}

// --- Event Handlers ---

async function handleCorrectGuess() {
  let currentWordData = state.wordList[state.currentIndex];

  if (state.userInput === currentWordData.word) {
    state.mode = 'success';
    flash(chalk.green);
    state.userInput = '';
    state.hasStartedTyping = false;
    state.currentWordStreak++;

    if (state.currentWordStreak >= state.repeatCount) {
      currentWordData.level++;
      currentWordData.lastPracticed = new Date().toISOString();
      const interval = getReviewInterval(currentWordData.level);
      currentWordData.nextReviewDate = addDays(new Date(), interval).toISOString();
      saveWordList();

      state.currentWordStreak = 0;
      if (!findNextWordToReview()) {
        setTimeout(() => {
          process.stdout.write('\x1Bc');
          console.log(center(chalk.bold.yellow('✨ You completed all due words! ✨')));
          showCursor();
          process.exit();
        }, 700);
        return;
      }
    }

    setTimeout(() => {
      state.mode = 'typing';
      render();
    }, 700);
  } else {
    render();
  }
}

function handleIncorrectGuess() {
  let currentWordData = state.wordList[state.currentIndex];

  state.mode = 'error';
  flash(chalk.red);

  currentWordData.level = 1;
  currentWordData.lastPracticed = new Date().toISOString();
  currentWordData.nextReviewDate = addDays(new Date(), 1).toISOString();
  saveWordList();

  state.userInput = '';
  state.hasStartedTyping = false;
  state.currentWordStreak = 0;

  findNextWordToReview();

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
  if (!state.hasStartedTyping) state.hasStartedTyping = true;
  if (state.mode === 'typing') {
    const word = state.wordList[state.currentIndex].word;
    state.userInput += str;
    if (word.startsWith(state.userInput)) {
      handleCorrectGuess();
    } else {
      handleIncorrectGuess();
    }
  }
}

async function onData(chunk) {
  if (chunk.length === 1 && chunk[0] === 4) { // Ctrl+D
    // 1. Remove the word at the current index and save.
    state.wordList.splice(state.currentIndex, 1);
    saveWordList();

    // 2. If the list is now empty, exit gracefully.
    if (state.wordList.length === 0) {
      process.stdout.write('\x1Bc');
      console.log(center(chalk.yellow('Spelling list is now empty.')));
      showCursor();
      process.exit();
      return;
    }

    // 3. The list is not empty. Safely reset the session to the start of the list.
    // This is a robust way to handle the state change without complex logic.
    // The SRS will find the next *most urgent* word after the user answers this one.
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
  await initialize();

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