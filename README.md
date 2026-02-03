# Spell

A minimalist, high-performance terminal app for mastering spelling, typing, and vocabulary using a science-based learning approach.

Unlike traditional spaced repetition systems like Anki, **Spell focuses on building muscle memory for touch-typing words correctly.** It drills you on actively typing the word, not just passively recognizing it. This targeted approach significantly enhances typing fluency and spelling accuracy, making it ideal for those who want to internalize words through physical repetition.

**[Read the introductory blog post: "Introducing Spell, a CLI Spelling Trainer Using Touch-Typing"](https://rolandnsharp.github.io/posts/introducing-spell-a-cli-spelling-trainer-using-touch-typing/)**

![Spell Demo](https-i-imgur-com-21i5j1t-gif)

## Features

-   🧠 **Science-Based Learning:** Uses a **Spaced Repetition System (SRS)** to schedule words for review at the perfect time to build robust long-term memory.
-   💪 **Drill Mode:** Integrates "massed practice" by allowing you to drill words a set number of times (`-r` flag, defaults to 3) to build muscle memory before a word's SRS level is advanced.
-   📚 **Built-in Dictionary:** Automatically fetches and caches definitions for every word you add.
-   **Smart Definition Censoring:** Prevents spoilers during practice by intelligently censoring the spelling word and its common variations (e.g., `family` and `families`) within the definition.
-   ✨ **Full Word Management Suite:**
    -   Add new words individually.
    -   Bulk import words from a text file (`--import`).
    -   Interactively list, delete, and reset word progress (`--manage`).
    -   Safely clear your entire word list (`--clear`).
-   ⌨️ **Keyboard-First & Minimalist UI:** A clean, centered, distraction-free interface designed for touch-typists.

## Installation

This project is built to run with [Bun](https-bun-sh), a fast, all-in-one JavaScript runtime.

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

To begin a spelling session, simply run:
```bash
spell
```
The app will automatically select the words most urgently in need of review based on the Spaced Repetition algorithm and will use a default drill count of 3.

### Managing Your Word List

**Add a New Word (or Reset an Existing One):**
If the word is new, it will be added. If it already exists, its learning progress will be reset.
```bash
spell conscientious
```

**Bulk Import Words from a File:**
Create a simple text file with one word per line and import it.
```bash
spell --import ~/path/to/my-words.txt
```

**Interactive Word Manager:**
For a user-friendly way to list, delete, or reset word progress, use the `--manage` or `-m` flag:
```bash
spell --manage
```
This mode provides a numbered list and simple commands (`d <number>`, `r <number>`, `q`) to manage your words.

**Clear Your Entire List:**
To permanently delete all words (with a confirmation prompt), use the `--clear` or `-c` flag:
```bash
spell --clear
```

### Customizing Your Practice

**Practice with the Word Hidden (Definition-Only Mode):**
To challenge yourself by spelling the word using only its definition, use the `--hide-word` or `-d` flag. This is excellent for testing true vocabulary recall.
```bash
spell --hide-word
```

**Drill Words with the Repeat Flag:**
To drill a word multiple times before its review level increases, use the `--repeat` or `-r` flag.
```bash
# You must spell each word 5 times in a row to master it for the session
spell -r 5
```

**Power User Tip: Setting a Permanent Default**
If you prefer a different default drill count, you can create a shell alias. Add the following line to your shell's configuration file (e.g., `~/.bashrc`, `~/.zshrc`):

```bash
# Sets the default drill count to 5
alias spell='spell -r 5'
```
This is the standard and most flexible way to customize the behavior of any command-line tool.

### Help Screen

To view a full list of commands at any time:
```bash
spell --help
```

### In-Session Controls (Practice Mode)

-   `Ctrl+D` - **Delete Current Word:** Permanently removes the current word from your list.
-   `Ctrl+C` - **Exit:** Exit the practice session at any time.

## The Science of Learning

This app combines two scientifically-backed learning methods to maximize memory retention and typing fluency.

#### 1. Spaced Repetition (for Long-Term Memory)

The core of the app is a **Spaced Repetition System (SRS)**, a learning technique based on the "forgetting curve." The principle is simple: the best time to review information is right before you're about to forget it.

-   **How it's implemented:** Every word in your `spellingList.json` file has a `level` and a `nextReviewDate`. When you spell a word correctly, its level increases, and the `nextReviewDate` is pushed further into the future (from 1 day to 3, 7, 16, and so on, capped at 180 days). If you misspell a word, its level is reset to 1, and it will be scheduled for review the very next day.
-   **The Result:** You spend your time efficiently, focusing on the words you struggle with while practicing the words you know well just often enough to keep them locked in long-term memory.

#### 2. Massed Practice / Drilling (for Muscle Memory)

While SRS is for long-term retention, drilling (or "massed practice") is essential for building short-term muscle memory. The `-r` flag activates this mode.

-   **How it's implemented:** To advance a word's SRS `level`, you must first spell it correctly `n` times in a row, as specified by the `-r` flag.
-   **The Result:** This acts as a mastery gate. It ensures you have a firm, immediate grasp and the correct "feel" for typing a word before the SRS system trusts you to remember it over the long term.

## Data & Syncing

Your learning progress is stored locally at `~/.spell/spellingList.json`.

Since this is a simple file in your home directory, you can easily sync it across multiple machines using a version-controlled "dotfiles" repository. By putting your `~/.spell` directory under Git, you can keep your learning progress synchronized across all your development environments.