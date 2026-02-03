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
 * @property {string[]} wordList - The list of words to practice.
 * @property {number} currentIndex - The index of the current word in the list.
 * @property {string} userInput - The user's current typed input.
 * @property {boolean} hasStartedTyping - Whether the user has started typing the current word.
 * @property {'typing'|'success'|'error'} mode - The current state of the typing game.
 * @property {number} correctStreak - The number of consecutive correct spellings for the current word.
 * @property {number} repeatCount - The number of times a word must be spelled correctly to advance.
 * @property {string} filepath - The absolute path to the spelling list file.
 */
const state = {
  wordList: [],
  currentIndex: 0,
  userInput: '',
  hasStartedTyping: false,
  mode: 'typing',
  correctStreak: 0,
  repeatCount: 1,
  filepath: ''
};

/**
 * Initializes the application, parses command-line arguments, and loads the word list.
 */
function initialize() {
  // --- Argument Parsing ---
  const args = process.argv.slice(2);
  const repeatIndex = args.findIndex(arg => arg === '-r' || arg === '--repeat');
  state.repeatCount = (repeatIndex !== -1 && args[repeatIndex + 1]) ? parseInt(args[repeatIndex + 1], 10) : 1;
  const inputArg = args.find(arg => !arg.startsWith('-') && isNaN(arg));
  const wordToAdd = inputArg && !inputArg.endsWith('.txt') ? inputArg : null;

  // --- File & Directory Setup ---
  const appDir = path.join(os.homedir(), '.spell');
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir);
  const filename = 'spellingList.txt';
  state.filepath = path.join(appDir, filename);

  if (!fs.existsSync(state.filepath)) fs.writeFileSync(state.filepath, '');

  // If a word is passed as an argument, add it to the list and exit.
  if (wordToAdd) {
    fs.appendFileSync(state.filepath, `\n${wordToAdd}`);
    console.log(chalk.green(`Added "${wordToAdd}" to the spelling list.`));
    process.exit(0);
  }

  // --- Load Word List ---
  state.wordList = fs.readFileSync(state.filepath, 'utf8')
    .split('\n')
    .map(w => w.trim())
    .filter(w => w.length > 0);
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
    if (!res.ok) return chalk.gray('(no definition found)');
    const data = await res.json();
    const def = data[0]?.meanings[0]?.definitions[0]?.definition;
    return def || chalk.gray('(no definition found)');
  } catch (error) {
    return chalk.red('(could not fetch definition)');
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
function showCursor() { process.stdout.write('\x1B[?25h'); }

/**
 * Clears the screen and re-renders the UI based on the current state.
 * @param {string} [wordOverride=null] - A specific string to display instead of the default.
 * @param {function} [colorFn=chalk.white] - A chalk function to color the output.
 */
function render(wordOverride = null, colorFn = chalk.white) {
  const word = state.wordList[state.currentIndex];
  let displayWord;

  if (wordOverride !== null) {
    displayWord = wordOverride;
  } else if (!state.hasStartedTyping) {
    displayWord = word;
  } else {
    const blanks = ' '.repeat(word.length - state.userInput.length);
    displayWord = state.userInput + blanks;
  }

  process.stdout.write('\x1Bc'); // Clears the terminal screen
  hideCursor();
  console.log('\n\n\n\n');
  console.log(center(colorFn(displayWord)));
}

/**
 * Briefly flashes the word in a specific color.
 * @param {function} colorFn - A chalk function to color the word.
 */
function flash(colorFn) {
  const word = state.wordList[state.currentIndex];
  render(word, colorFn);
}


// --- Event Handlers ---

/**
 * Handles a correct character press during the typing game.
 */
async function handleCorrectGuess() {
  const word = state.wordList[state.currentIndex];
  // If the full word has been typed correctly
  if (state.userInput === word) {
    state.mode = 'success';
    state.correctStreak++;
    flash(chalk.green);

    // Reset for the next round (either repeat or next word)
    state.userInput = '';
    state.hasStartedTyping = false;

    // Advance to the next word if streak is met
    if (state.correctStreak >= state.repeatCount) {
      state.currentIndex++;
      state.correctStreak = 0;
    }

    // Check for game completion
    if (state.currentIndex >= state.wordList.length) {
      setTimeout(() => {
        process.stdout.write('\x1Bc');
        console.log(center(chalk.bold.yellow('✨ You completed the list! ✨')));
        showCursor();
        process.exit();
      }, 700);
      return;
    }

    // Prepare for the next word
    setTimeout(() => {
      state.mode = 'typing';
      render();
    }, 700);
  } else {
    // If it's just a correct character, not the full word
    render();
  }
}

/**
 * Handles an incorrect character press during the typing game.
 */
function handleIncorrectGuess() {
  state.mode = 'error';
  flash(chalk.red);
  // Reset after a short delay
  setTimeout(() => {
    state.userInput = '';
    state.hasStartedTyping = false;
    state.mode = 'typing';
    state.correctStreak = 0; // Reset streak on error
    render();
  }, 700);
}

/**
 * Main handler for keyboard input.
 * @param {string} str - The character pressed.
 * @param {object} key - An object describing the key.
 */
function onKeyPress(str, key) {
  // Allow Ctrl+C to exit
  if (key.sequence === '\u0003') {
    showCursor();
    process.exit();
  }

  if (!state.hasStartedTyping) state.hasStartedTyping = true;

  // Only process input if in 'typing' mode to prevent input during delays
  if (state.mode === 'typing') {
    const word = state.wordList[state.currentIndex];
    state.userInput += str;

    if (word.startsWith(state.userInput)) {
      handleCorrectGuess();
    } else {
      handleIncorrectGuess();
    }
  }
}

/**
 * Handles Ctrl+D to delete the current word from the list.
 */
async function onData(chunk) {
  // Check for Ctrl+D sequence
  if (chunk.length === 1 && chunk[0] === 4) {
    state.wordList.splice(state.currentIndex, 1);
    fs.writeFileSync(state.filepath, state.wordList.join('\n'));

    if (state.currentIndex >= state.wordList.length) state.currentIndex = 0;
    if (state.wordList.length === 0) {
      process.stdout.write('\x1Bc');
      console.log(center(chalk.yellow('Spelling list is now empty.')));
      showCursor();
      process.exit();
    }

    // Reset state and render the new current word
    state.userInput = '';
    state.hasStartedTyping = false;
    state.mode = 'typing';
    render();
  }
}

// --- Main Application Logic ---

/**
 * Sets up listeners and starts the application.
 */
async function main() {
  initialize();

  if (state.wordList.length === 0) {
    console.log(center(chalk.yellow('Your spelling list is empty.\nAdd a word with `spell <word>`')));
    process.exit(0);
  }

  // Set up input listeners
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('keypress', onKeyPress);
  process.stdin.on('data', onData);
  process.on('exit', showCursor); // Ensure cursor is always shown on exit

  // Initial render
  render();
}

// --- Run Application ---
main().catch(err => {
  showCursor();
  console.error('\nAn unexpected error occurred:', err);
  process.exit(1);
});