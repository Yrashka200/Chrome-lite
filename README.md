# Chrome-lite

Chrome-lite is a lightweight Google Chrome extension structured to enhance browser functionality with a minimal footprint.

## Project Structure

The repository contains the following core components:

*   **manifest.json**: The extension manifest file defining metadata, permissions, and architecture.
*   **background.js**: The background service worker managing lifecycle events and asynchronous tasks.
*   **popup.html / popup.js**: The user interface markup and logic for the extension's dropdown menu.
*   **perf.js / perf.css**: Performance monitoring scripts and corresponding style sheets.
*   **rules.json**: Declarative rules configuration file for handling network requests or modifications.

## Tech Stack

The project is built using native web technologies:
*   **JavaScript**: 65.6%
*   **HTML**: 21.3%
*   **CSS**: 13.1%

## Installation

To load this extension locally for development purposes:

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the root directory containing the project files.

## License

This project is licensed under the terms of the **MIT License**. For full details, see the `LICENSE` file included in this repository.
