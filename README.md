# Spell CLI

A minimalist, high-performance terminal app designed to improve your spelling, typing speed, and vocabulary through spaced repetition.

![Spell CLI Demo](https://storage.googleapis.com/gemini-marc-misc-shared/2024-05-16_spell-cli-demo.gif)

## Features

-   🧠 **Active Recall:** The word disappears as you start typing, forcing you to recall it from memory.
-   📚 **Built-in Dictionary:** Fetches and displays definitions for words you're practicing.
-   🔁 **Repetition Control:** Configure how many times you must correctly type a word before moving on.
-   ✨ **Minimalist UI:** A clean, centered, distraction-free interface with instant visual feedback.
-   ⌨️ **Keyboard-First:** Designed for touch-typists. No mouse required.

## Installation

This project is built to run with [Bun](https://bun.sh/), a fast, all-in-one JavaScript runtime.

1.  **Link the package for global use:**
    From inside the project directory, run:
    ```bash
    bun link --name @rolandnsharp/spell
    ```
    This will make the `spell` command available globally on your system.

2.  **Install dependencies:**
    ```bash
    bun install
    ```

You're all set!

## Usage

### Start a Practice Session

To begin a spelling session with your word list, simply run:
```bash
spell
```

### Add a New Word

To add a new word to your spelling list:
```bash
spell <word>

# Example:
spell conscientious
```

### Set Repetition Count

To specify how many times you must correctly spell each word before it's considered "mastered" for the session, use the `-r` or `--repeat` flag:
```bash
# Practice each word 3 times
spell -r 3
```

### In-Session Controls

-   `Ctrl+D` - **Delete Current Word:** If you've mastered a word and want to remove it from your list permanently, press `Ctrl+D`.
-   `Ctrl+C` - **Exit:** Exit the practice session at any time.

## How It Works

The application maintains a simple text file of your words at `~/.spell/spellingList.txt`. This keeps your personal word list separate from the application's source code, allowing you to update the app without losing your data.

## Future Enhancements

Here are some recommendations to take this program to the next level:

### Core Tooling Choices

*   `readline`: This is the built-in, official Node.js module for handling user input from the terminal. It's the perfect, lightweight tool for capturing raw keypresses.
*   `chalk`: The industry-standard library for terminal text styling. While Bun has `Bun.style`, `chalk` is a robust and widely used choice.

### Feature & UX Enhancements

*   **Display Definitions:** Integrate the already-fetched word definitions into the display during practice sessions for enhanced learning.
*   **Add a Help Screen:** Implement a dedicated help screen (e.g., triggered by `spell --help`) to guide users on commands like adding/deleting words and setting repetition counts.
*   **More Word Management Commands:**
    *   `spell --list`: Display all words in the spelling list.
    *   `spell --clear`: Clear the entire spelling list (with user confirmation).

### Implement Spaced Repetition

*   Transition the current linear word quizzing to a spaced repetition algorithm. This involves showing words you struggle with more frequently, optimizing the learning process.

### Evolve Your Data Storage

*   **Switch to JSON:** Migrate from `spellingList.txt` to `spellingList.json` to store richer data per word, such as:
    ```json
    [
      {
        "word": "conscientious",
        "correct": 5,
        "incorrect": 1,
        "lastPracticed": "2026-02-03T10:00:00.000Z"
      },
      {
        "word": "ubiquitous",
        "correct": 2,
        "incorrect": 3,
        "lastPracticed": "2026-02-03T09:00:00.000Z"
      }
    ]
    ```
    This richer data structure is essential for implementing spaced repetition and other advanced features.
