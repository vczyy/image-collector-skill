# Image Collector Skill

This is a custom skill for the OpenCode ecosystem that helps you collect images and articles from the web efficiently.

## Features

*   **Scraping**: Uses Puppeteer to render pages (handles React/SPA sites).
*   **Article Extraction**: Uses Mozilla's Readability library to save clean, reader-view HTML.
*   **Smart Images**:
    *   Automatically picks the highest resolution from `srcset`.
    *   Hashes image content to prevent downloading duplicates.
    *   Organizes files by `Domain/Date/`.
*   **Interactive**: Lets you choose which links to scrape from a list.

## Installation

1.  Navigate to the skill directory:
    ```bash
    cd "E:\OpenCode\skill image-collector"
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

## Usage via OpenCode

Since you've installed this as a skill, you can trigger it naturally in the chat:

> "Run image-collector on https://example.com"
> "Help me scrape images from this site"

## Usage via CLI

You can also run the script directly for testing:

```bash
node scripts/collect.js https://example.com
```

## Structure

*   `SKILL.md`: Skill definition for the AI agent.
*   `scripts/collect.js`: Main logic script (Node.js ES Module).
*   `downloads/`: Where scraped content is saved.
