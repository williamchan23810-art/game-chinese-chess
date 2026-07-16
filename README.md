# 🌌 game-chinese-chess

[![Netlify Status](https://api.netlify.com/api/v1/badges/e82b7db3-6625-4560-b6df-204ef8347f75/deploy-status)](https://game-chinese-chess.netlify.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

A highly responsive, digital two-player mobile and desktop game application based on traditional Chinese Chess (Xiangqi), featuring real-time peer-to-peer (P2P) networking, match timers, and an intuitive move-validation engine.

---

## 🚀 Live Demo

[![Play on Netlify](https://img.shields.io/badge/Netlify-Play%20Now-00AD9F?style=for-the-badge&logo=netlify&logoColor=white)](https://game-chinese-chess.netlify.app/)

👉 **[Click here to play the game live on Netlify!](https://game-chinese-chess.netlify.app/)**

---

## ✨ Core Features & Gameplay Logic

*   **Traditional Rules:** Built with strict validation covering all piece interactions—including Chariot pathing, Horse leg blocking (hobbling), Cannon jumping restrictions, and Flying General constraints.
*   **Multiplayer Modes:** 
    *   *P2P Local Mode:* Play side-by-side on a single device with automated board-flipping or persistent orientations.
    *   *Online Invite:* Generate instant P2P invite links and 4-digit security passcodes to play with friends remotely.
*   **Safe-Tap Mechanism:** A dedicated **three-tap confirmation system** prevents accidental touch input on smaller mobile displays. Highlights destination markers and requires a final tap of the `✓ Confirm Move` button to lock in your strategy.
*   **Competitive Turn Timers:** 
    *   Each player starts with a dynamic countdown clock.
    *   **Yellow Card Penalty:** If your timer hits `0:00`, you receive a single 1-minute emergency extension.
    *   **Red Card Forfeit:** Expiring the clock twice results in an automatic system forfeit.
*   **King Escape & Audio Warnings:** Automated voice announcements trigger when a King is put in check. Moves that result in self-checking or leaving the King vulnerable are strictly blocked.

---

## ⚙️ System & State Architecture

The application operates as a decoupled, client-side State Engine. Because it relies on direct browser orchestration, state transitions are exceptionally fast and require zero database lag.
