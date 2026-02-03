#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';

// --- Configuration & Setup ---

/**
 * Application state.
 * @property {{word: string, definition: string}[]} wordList - The list of word objects to practice.
 * @property {number} currentIndex - The index of the current word in the list.
 * @property {string} userInput - The user's current typed input.
 * @property {boolean} hasStartedTyping - Whether the user has started typing the current word.
 * @property {'typing'|'success'|'error'} mode - The current state of the typing game.
 * @property {number} correctStreak - The number of consecutive correct spellings for the current word.
 * @property {number} repeatCount - The number of times a word must be spelled correctly to advance.
 * @property {string} jsonFilepath - The absolute path to the spelling list JSON file.
 */
const state = {
  wordList: [],
  currentIndex: 0,
  userInput: '',
  hasStartedTyping: false,
  mode: 'typing',
  correctStreak: 0,
  repeatCount: 1,
  jsonFilepath: ''
};

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
 * @param {string} txtFilepath - The path to the old txt file.
 * @param {string} jsonFilepath - The path to the new json file.
 */
async function migrateTxtToJson(txtFilepath, jsonFilepath) {
  console.log(chalk.yellow('Old `spellingList.txt` found. Migrating to new JSON format...'));
  const oldWords = fs.readFileSync(txtFilepath, 'utf8')
    .split('\n')
    .map(w => w.trim())
    .filter(w => w.length > 0);

  const newWordList = [];
  for (const word of oldWords) {
    process.stdout.write(`Fetching definition for "${word}"... `);
    const definition = await getDefinition(word);
    newWordList.push({ word, definition });
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

  // Handle migration if new file doesn't exist but old one does
  if (!fs.existsSync(state.jsonFilepath) && fs.existsSync(oldTxtFilepath)) {
    await migrateTxtToJson(oldTxtFilepath, state.jsonFilepath);
  } else if (fs.existsSync(state.jsonFilepath)) {
    const fileContent = fs.readFileSync(state.jsonFilepath, 'utf8');
    state.wordList = fileContent ? JSON.parse(fileContent) : [];
  } else {
    // Create an empty JSON file if nothing exists
    fs.writeFileSync(state.jsonFilepath, '[]');
  }

  if (wordToAdd) {
    console.log(`Adding "${wordToAdd}" to the list...`);
    const definition = await getDefinition(wordToAdd);
    state.wordList.push({ word: wordToAdd, definition });
    fs.writeFileSync(state.jsonFilepath, JSON.stringify(state.wordList, null, 2));
    console.log(chalk.green('Done.'));
    process.exit(0);
  }
}

/**
 * Centers a string of text in the terminal.
 * @param {string} text - The text to center.
 * @returns {string} The centered text.
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
 * Replaces the word and its simple plural/derived forms with asterisks.
 * @param {string} word - The word to censor.
 * @param {string} definition - The definition string.
 * @returns {string} The censored definition.
 */
function censorWordInDefinition(word, definition) {
  let root = word;
  // Heuristic for common word variations
  if (word.length > 4 && word.endsWith('y')) {
    root = word.slice(0, -1); // e.g., 'family' -> 'famil'
  } else if (word.length > 4 && word.endsWith('e')) {
    root = word.slice(0, -1); // e.g., 'accommodate' -> 'accommodat'
  }
  // Add more heuristics as needed

  // Regex to find any whole word starting with the root, case-insensitive
  // \b ensures we match whole words, \w* allows for suffixes like 'ies', 'ing', 'tion', etc.
  const regex = new RegExp(`\\b${root}\\w*\\b`, 'gi');
  
  return definition.replace(regex, match => '*'.repeat(match.length));
}


/**
 * Clears the screen and re-renders the UI based on the current state.
 * @param {string} [wordOverride=null] - A specific string to display instead of the default.
 * @param {function} [colorFn=chalk.white] - A chalk function to color the output.
 */
function render(wordOverride = null, colorFn = chalk.white) {
  const currentWord = state.wordList[state.currentIndex];
  if (!currentWord) return; // Don't render if list is empty

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

  process.stdout.write('\x1Bc'); // Clears the terminal screen
  hideCursor();
  console.log('\n\n');
  console.log(center(chalk.dim(censoredDefinition)));
  console.log('\n\n');
  console.log(center(colorFn(displayWord)));
}

/**
 * Briefly flashes the word in a specific color.
 * @param {function} colorFn - A chalk function to color the word.
 */
function flash(colorFn) {
  const word = state.wordList[state.currentIndex].word;
  render(word, colorFn);
}


// --- Event Handlers ---

async function handleCorrectGuess() {
  const currentWord = state.wordList[state.currentIndex];

  if (state.userInput === currentWord.word) {
    state.mode = 'success';
    state.correctStreak++;
    flash(chalk.green);

    state.userInput = '';
    state.hasStartedTyping = false;

    if (state.correctStreak >= state.repeatCount) {
      state.currentIndex++;
      state.correctStreak = 0;
    }

    if (state.currentIndex >= state.wordList.length) {
      setTimeout(() => {
        process.stdout.write('\x1Bc');
        console.log(center(chalk.bold.yellow('✨ You completed the list! ✨')));
        showCursor();
        process.exit();
      }, 700);
      return;
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
  state.mode = 'error';
  flash(chalk.red);
  setTimeout(() => {
    state.userInput = '';
    state.hasStartedTyping = false;
    state.mode = 'typing';
    state.correctStreak = 0;
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
    state.wordList.splice(state.currentIndex, 1);
    fs.writeFileSync(state.jsonFilepath, JSON.stringify(state.wordList, null, 2));

    if (state.currentIndex >= state.wordList.length) state.currentIndex = 0;
    if (state.wordList.length === 0) {
      process.stdout.write('\x1Bc');
      console.log(center(chalk.yellow('Spelling list is now empty.')));
      showCursor();
      process.exit();
    }

    state.userInput = '';
    state.hasStartedTyping = false;
    state.mode = 'typing';
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