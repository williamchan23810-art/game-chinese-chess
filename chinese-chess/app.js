// ChineseChessInvite Game Engine and Controller

// --- Types & Constants ---
const SIDES = { RED: 'red', BLACK: 'black' };
const PIECE_TYPES = {
    GENERAL: 'G',  // King / General
    ADVISOR: 'A',  // Advisor
    ELEPHANT: 'E', // Elephant
    HORSE: 'H',    // Horse
    CHARIOT: 'R',  // Chariot (Rook)
    CANNON: 'C',   // Cannon
    SOLDIER: 'S'   // Soldier
};

// Character lookup mapping
const PIECE_CHARS = {
    [SIDES.RED]: {
        [PIECE_TYPES.GENERAL]: '帥',
        [PIECE_TYPES.ADVISOR]: '仕',
        [PIECE_TYPES.ELEPHANT]: '相',
        [PIECE_TYPES.HORSE]: '傌',
        [PIECE_TYPES.CHARIOT]: '俥',
        [PIECE_TYPES.CANNON]: '炮',
        [PIECE_TYPES.SOLDIER]: '兵'
    },
    [SIDES.BLACK]: {
        [PIECE_TYPES.GENERAL]: '將',
        [PIECE_TYPES.ADVISOR]: '士',
        [PIECE_TYPES.ELEPHANT]: '象',
        [PIECE_TYPES.HORSE]: '馬',
        [PIECE_TYPES.CHARIOT]: '車',
        [PIECE_TYPES.CANNON]: '砲',
        [PIECE_TYPES.SOLDIER]: '卒'
    }
};

// --- Game State ---
const gameState = {
    board: Array(10).fill(null).map(() => Array(9).fill(null)),
    turn: SIDES.RED, // Red starts first!
    selected: null,  // { r, c } - Tap 1 Select
    target: null,    // { r, c } - Tap 2 Target
    validMoves: [],  // Array of { r, c }
    timers: {
        [SIDES.RED]: 15,   // Initial allowed time for Step 1
        [SIDES.BLACK]: 15
    },
    yellowCards: {
        [SIDES.RED]: false,
        [SIDES.BLACK]: false
    },
    timerId: null,
    history: [],      // Undo log of boards: Array of boardState string
    moveLogs: [],     // Array of move items for undoing
    isGameOver: false,
    repHistory: [],   // Store position hashes to check for Threefold Repetition
    stepCount: 0,     // Total moves played in the current game
    
    // P2P Multiplayer Networking State
    peer: null,
    playerConn: null,
    spectatorConns: [],
    role: null,       // red (Guest), black (Host), or spectator
    peerId: null,
    mode: null,       // 'one-player', 'local', or 'p2p'
    inviteTimeoutId: null,
    passcode: null,
    enteredPasscode: null,
    spectatorsAllowed: true
};

// Audio Engine (Web Audio API Synthesizer)
let audioCtx = null;
function playSound(type) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const now = audioCtx.currentTime;
        if (type === 'select') {
            // High click tone
            osc.frequency.setValueAtTime(600, now);
            gainNode.gain.setValueAtTime(0.08, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'confirm') {
            // Satisfying double confirm chime
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
            gainNode.gain.setValueAtTime(0.12, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'capture') {
            // Slide sweep down sound
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.25);
            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    } catch (e) {
        console.warn('Web Audio synthesis not supported or blocked', e);
    }
}

// Voice synthesizer using SpeechSynthesis API (offline-friendly)
function speakAlert(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Cancel any existing speech
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.2; // Playful voice pitch
        
        // Try to select a female voice if available
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(voice => 
            voice.name.toLowerCase().includes('female') || 
            voice.name.toLowerCase().includes('google us english') ||
            voice.name.toLowerCase().includes('zira') ||
            voice.name.toLowerCase().includes('samantha')
        );
        if (femaleVoice) {
            utterance.voice = femaleVoice;
        }
        window.speechSynthesis.speak(utterance);
    }
}

// Helper to determine allowed time based on step count
function getAllowedTime(stepCount) {
    const currentStep = stepCount + 1;
    if (currentStep <= 6) {
        return 15;
    } else if (currentStep <= 12) {
        return 30;
    } else if (currentStep <= 20) {
        return 60;
    } else {
        return 90;
    }
}

// --- Initialize Game Board ---
function initBoardLocal() {
    gameState.board = Array(10).fill(null).map(() => Array(9).fill(null));

    // Helper to insert a piece
    const add = (r, c, side, type) => {
        gameState.board[r][c] = {
            type,
            side,
            char: PIECE_CHARS[side][type]
        };
    };

    // --- Black Side (Top, Rows 0-4) ---
    add(0, 0, SIDES.BLACK, PIECE_TYPES.CHARIOT);
    add(0, 1, SIDES.BLACK, PIECE_TYPES.HORSE);
    add(0, 2, SIDES.BLACK, PIECE_TYPES.ELEPHANT);
    add(0, 3, SIDES.BLACK, PIECE_TYPES.ADVISOR);
    add(0, 4, SIDES.BLACK, PIECE_TYPES.GENERAL);
    add(0, 5, SIDES.BLACK, PIECE_TYPES.ADVISOR);
    add(0, 6, SIDES.BLACK, PIECE_TYPES.ELEPHANT);
    add(0, 7, SIDES.BLACK, PIECE_TYPES.HORSE);
    add(0, 8, SIDES.BLACK, PIECE_TYPES.CHARIOT);
    add(2, 1, SIDES.BLACK, PIECE_TYPES.CANNON);
    add(2, 7, SIDES.BLACK, PIECE_TYPES.CANNON);
    add(3, 0, SIDES.BLACK, PIECE_TYPES.SOLDIER);
    add(3, 2, SIDES.BLACK, PIECE_TYPES.SOLDIER);
    add(3, 4, SIDES.BLACK, PIECE_TYPES.SOLDIER);
    add(3, 6, SIDES.BLACK, PIECE_TYPES.SOLDIER);
    add(3, 8, SIDES.BLACK, PIECE_TYPES.SOLDIER);

    // --- Red Side (Bottom, Rows 5-9) ---
    add(9, 0, SIDES.RED, PIECE_TYPES.CHARIOT);
    add(9, 1, SIDES.RED, PIECE_TYPES.HORSE);
    add(9, 2, SIDES.RED, PIECE_TYPES.ELEPHANT);
    add(9, 3, SIDES.RED, PIECE_TYPES.ADVISOR);
    add(9, 4, SIDES.RED, PIECE_TYPES.GENERAL);
    add(9, 5, SIDES.RED, PIECE_TYPES.ADVISOR);
    add(9, 6, SIDES.RED, PIECE_TYPES.ELEPHANT);
    add(9, 7, SIDES.RED, PIECE_TYPES.HORSE);
    add(9, 8, SIDES.RED, PIECE_TYPES.CHARIOT);
    add(7, 1, SIDES.RED, PIECE_TYPES.CANNON);
    add(7, 7, SIDES.RED, PIECE_TYPES.CANNON);
    add(6, 0, SIDES.RED, PIECE_TYPES.SOLDIER);
    add(6, 2, SIDES.RED, PIECE_TYPES.SOLDIER);
    add(6, 4, SIDES.RED, PIECE_TYPES.SOLDIER);
    add(6, 6, SIDES.RED, PIECE_TYPES.SOLDIER);
    add(6, 8, SIDES.RED, PIECE_TYPES.SOLDIER);

    gameState.turn = SIDES.RED;
    gameState.selected = null;
    gameState.target = null;
    gameState.validMoves = [];
    gameState.isGameOver = false;
    gameState.stepCount = 0;
    gameState.timers = { [SIDES.RED]: getAllowedTime(0), [SIDES.BLACK]: getAllowedTime(0) };
    gameState.yellowCards = { [SIDES.RED]: false, [SIDES.BLACK]: false };
    gameState.history = [];
    gameState.moveLogs = [];
    gameState.repHistory = [serializeBoard(gameState.board, gameState.turn)];

    // Clear card visuals in HTML
    document.querySelectorAll('.card-icon').forEach(icon => icon.style.display = 'none');
    document.body.classList.remove('time-warning');

    // Hide Confirm Move button
    const commitBtn = document.getElementById('btn-commit-move');
    if (commitBtn) commitBtn.style.display = 'none';

    updateActiveTurnCard();
    renderBoard();
    updateSystemStatus();
    startTimer();
}

function initBoard() {
    initBoardLocal();
    if (gameState.playerConn && gameState.playerConn.open) {
        gameState.playerConn.send({ type: 'reset' });
    }
    gameState.spectatorConns.forEach(conn => {
        if (conn && conn.open) {
            conn.send({ type: 'reset' });
        }
    });
}

// Serialization helper to check repetition
function serializeBoard(boardState, turn) {
    let result = turn + ':';
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const p = boardState[r][c];
            if (p) {
                result += `${r}${c}${p.side[0]}${p.type}`;
            }
        }
    }
    return result;
}

// Save current board in history
function saveHistoryState() {
    // Deep clone the board
    const clonedBoard = gameState.board.map(row => row.map(cell => cell ? { ...cell } : null));
    gameState.history.push({
        board: clonedBoard,
        turn: gameState.turn,
        timers: { ...gameState.timers },
        yellowCards: { ...gameState.yellowCards }
    });
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = false;
}

// --- Rules & Move Validation ---
function getPseudoMoves(r, c, boardState = gameState.board) {
    const piece = boardState[r][c];
    if (!piece) return [];

    const moves = [];
    const side = piece.side;

    const inRange = (row, col) => row >= 0 && row < 10 && col >= 0 && col < 9;
    const isOpponentOrEmpty = (row, col) => {
        const targetPiece = boardState[row][col];
        return !targetPiece || targetPiece.side !== side;
    };

    switch (piece.type) {
        case PIECE_TYPES.GENERAL: {
            // General: moves 1 step orthogonally within Palace
            // Palace: rows 0-2 (Black), 7-9 (Red); cols 3-5
            const palaceRows = side === SIDES.BLACK ? [0, 1, 2] : [7, 8, 9];
            const palaceCols = [3, 4, 5];
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

            dirs.forEach(([dr, dc]) => {
                const nr = r + dr;
                const nc = c + dc;
                if (palaceRows.includes(nr) && palaceCols.includes(nc) && isOpponentOrEmpty(nr, nc)) {
                    moves.push({ r: nr, c: nc });
                }
            });
            break;
        }

        case PIECE_TYPES.ADVISOR: {
            // Advisor: moves 1 step diagonally within Palace
            const palaceRows = side === SIDES.BLACK ? [0, 1, 2] : [7, 8, 9];
            const palaceCols = [3, 4, 5];
            const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

            dirs.forEach(([dr, dc]) => {
                const nr = r + dr;
                const nc = c + dc;
                if (palaceRows.includes(nr) && palaceCols.includes(nc) && isOpponentOrEmpty(nr, nc)) {
                    moves.push({ r: nr, c: nc });
                }
            });
            break;
        }

        case PIECE_TYPES.ELEPHANT: {
            // Elephant: moves 2 steps diagonally, cannot cross River
            // Palace barrier is rows 0-4 (Black), 5-9 (Red)
            const sideLimit = side === SIDES.BLACK ? 4 : 5; // row index boundary
            const dirs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];

            dirs.forEach(([dr, dc]) => {
                const nr = r + dr;
                const nc = c + dc;
                if (inRange(nr, nc) && isOpponentOrEmpty(nr, nc)) {
                    // Check river
                    if ((side === SIDES.BLACK && nr <= sideLimit) || (side === SIDES.RED && nr >= sideLimit)) {
                        // Check block (別象腳: eye is intermediate square)
                        const eyeR = r + dr / 2;
                        const eyeC = c + dc / 2;
                        if (!boardState[eyeR][eyeC]) {
                            moves.push({ r: nr, c: nc });
                        }
                    }
                }
            });
            break;
        }

        case PIECE_TYPES.HORSE: {
            // Horse: moves 1 step orthogonally then 1 step diagonally
            const LMoves = [
                { step: [-1, 0], targets: [[-2, -1], [-2, 1]] },  // Up
                { step: [1, 0], targets: [[2, -1], [[2, 1]], [2, 1]] },   // Down
                { step: [0, -1], targets: [[-1, -2], [1, -2]] },  // Left
                { step: [0, 1], targets: [[-1, 2], [1, 2]] }      // Right
            ];

            // Normalize coordinate target maps
            const targetsList = [
                { dr: -2, dc: -1, footR: -1, footC: 0 },
                { dr: -2, dc: 1, footR: -1, footC: 0 },
                { dr: 2, dc: -1, footR: 1, footC: 0 },
                { dr: 2, dc: 1, footR: 1, footC: 0 },
                { dr: -1, dc: -2, footR: 0, footC: -1 },
                { dr: 1, dc: -2, footR: 0, footC: -1 },
                { dr: -1, dc: 2, footR: 0, footC: 1 },
                { dr: 1, dc: 2, footR: 0, footC: 1 }
            ];

            targetsList.forEach(t => {
                const nr = r + t.dr;
                const nc = c + t.dc;
                if (inRange(nr, nc) && isOpponentOrEmpty(nr, nc)) {
                    // Check block (別馬腳: foot is orthogonally adjacent)
                    const footR = r + t.footR;
                    const footC = c + t.footC;
                    if (!boardState[footR][footC]) {
                        moves.push({ r: nr, c: nc });
                    }
                }
            });
            break;
        }

        case PIECE_TYPES.CHARIOT: {
            // Chariot: slide straight horizontally/vertically until blocked
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            dirs.forEach(([dr, dc]) => {
                let nr = r + dr;
                let nc = c + dc;
                while (inRange(nr, nc)) {
                    const dest = boardState[nr][nc];
                    if (!dest) {
                        moves.push({ r: nr, c: nc });
                    } else {
                        if (dest.side !== side) {
                            moves.push({ r: nr, c: nc });
                        }
                        break; // Blocked
                    }
                    nr += dr;
                    nc += dc;
                }
            });
            break;
        }

        case PIECE_TYPES.CANNON: {
            // Cannon: slide like Chariot, capture by jumping over 1 piece
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            dirs.forEach(([dr, dc]) => {
                let nr = r + dr;
                let nc = c + dc;
                let foundScreen = false;
                while (inRange(nr, nc)) {
                    const dest = boardState[nr][nc];
                    if (!foundScreen) {
                        if (!dest) {
                            moves.push({ r: nr, c: nc }); // Normal move
                        } else {
                            foundScreen = true; // Mount established
                        }
                    } else {
                        if (dest) {
                            if (dest.side !== side) {
                                moves.push({ r: nr, c: nc }); // Valid capture!
                            }
                            break; // Stop sliding after screen's first occupied node
                        }
                    }
                    nr += dr;
                    nc += dc;
                }
            });
            break;
        }

        case PIECE_TYPES.SOLDIER: {
            // Soldier: moves forward. After river cross, moves sideways
            const isRed = side === SIDES.RED;
            const forwardDr = isRed ? -1 : 1;
            const crossedRiver = isRed ? r <= 4 : r >= 5;

            // Forward
            const nr = r + forwardDr;
            if (inRange(nr, c) && isOpponentOrEmpty(nr, c)) {
                moves.push({ r: nr, c });
            }

            // Sideways if crossed river
            if (crossedRiver) {
                const cols = [c - 1, c + 1];
                cols.forEach(nc => {
                    if (inRange(r, nc) && isOpponentOrEmpty(r, nc)) {
                        moves.push({ r, c: nc });
                    }
                });
            }
            break;
        }
    }

    return moves;
}

// Find King position
function findKing(side, boardState = gameState.board) {
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const p = boardState[r][c];
            if (p && p.type === PIECE_TYPES.GENERAL && p.side === side) {
                return { r, c };
            }
        }
    }
    return null;
}

// Flying General check: return true if Kings face each other directly
function isFlyingGeneralViolated(boardState) {
    const blackKing = findKing(SIDES.BLACK, boardState);
    const redKing = findKing(SIDES.RED, boardState);
    if (!blackKing || !redKing) return false;

    // Must be in same column
    if (blackKing.c === redKing.c) {
        const col = blackKing.c;
        const startR = Math.min(blackKing.r, redKing.r) + 1;
        const endR = Math.max(blackKing.r, redKing.r);
        
        // Count intermediate pieces
        let count = 0;
        for (let r = startR; r < endR; r++) {
            if (boardState[r][col]) count++;
        }
        return count === 0;
    }
    return false;
}

// Check if a side's King is in check
function isKingInCheck(side, boardState = gameState.board) {
    const kingPos = findKing(side, boardState);
    if (!kingPos) return false;

    // Check if any opponent piece can capture the king
    const opponentSide = side === SIDES.RED ? SIDES.BLACK : SIDES.RED;
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const p = boardState[r][c];
            if (p && p.side === opponentSide) {
                const pseudo = getPseudoMoves(r, c, boardState);
                const canCaptureKing = pseudo.some(m => m.r === kingPos.r && m.c === kingPos.c);
                if (canCaptureKing) return true;
            }
        }
    }

    // Flying general counts as virtual check threat
    if (isFlyingGeneralViolated(boardState)) {
        return true;
    }

    return false;
}

// Main legal moves validator
function getLegalMoves(r, c) {
    const piece = gameState.board[r][c];
    if (!piece || piece.side !== gameState.turn) return [];

    const pseudo = getPseudoMoves(r, c);
    return pseudo.filter(m => {
        // Temporarily apply the move
        const prevDest = gameState.board[m.r][m.c];
        const prevStart = gameState.board[r][c];
        
        gameState.board[m.r][m.c] = prevStart;
        gameState.board[r][c] = null;

        // Check validation
        const violatesCheck = isKingInCheck(gameState.turn, gameState.board);
        const violatesFlyingGeneral = isFlyingGeneralViolated(gameState.board);

        // Revert
        gameState.board[r][c] = prevStart;
        gameState.board[m.r][m.c] = prevDest;

        return !violatesCheck && !violatesFlyingGeneral;
    });
}

// Check if active player has any legal moves left
function hasAnyLegalMoves(side) {
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const p = gameState.board[r][c];
            if (p && p.side === side) {
                const moves = getLegalMoves(r, c);
                if (moves.length > 0) return true;
            }
        }
    }
    return false;
}

// --- Game Logic Actions ---

// Commit move (Tap 3 confirmation)
function makeMove(startR, startC, endR, endC) {
    if (gameState.isGameOver) return;

    saveHistoryState();

    const piece = gameState.board[startR][startC];
    const targetPiece = gameState.board[endR][endC];

    // Play click sound or capture sweep
    if (targetPiece) {
        playSound('capture');
    } else {
        playSound('confirm');
    }

    // Apply move
    gameState.board[endR][endC] = piece;
    gameState.board[startR][startC] = null;

    // Check if the King is captured (killed)
    if (targetPiece && targetPiece.type === PIECE_TYPES.GENERAL) {
        endGame(gameState.turn, `${gameState.turn === SIDES.RED ? 'Red Guest' : 'Black Host'} wins by capturing the King!`);
        return;
    }

    // Verify that the move doesn't leave the current player's King in check
    if (isKingInCheck(gameState.turn)) {
        // Revert move
        gameState.board[startR][startC] = piece;
        gameState.board[endR][endC] = targetPiece;
        console.error("Illegal move: Leaves King in check!");
        return;
    }

    // Increment step counter
    gameState.stepCount++;

    // Send move details over PeerJS WebRTC P2P DataConnection
    if (gameState.playerConn && gameState.playerConn.open) {
        gameState.playerConn.send({
            type: 'move',
            startR,
            startC,
            endR,
            endC,
            timers: { ...gameState.timers },
            yellowCards: { ...gameState.yellowCards }
        });
    }
    // Broadcast move to all spectators
    gameState.spectatorConns.forEach(conn => {
        if (conn && conn.open) {
            conn.send({
                type: 'move',
                startR,
                startC,
                endR,
                endC,
                timers: { ...gameState.timers },
                yellowCards: { ...gameState.yellowCards }
            });
        }
    });

    // Reset commitment variables
    gameState.selected = null;
    gameState.target = null;
    gameState.validMoves = [];

    // Swap turns
    const prevTurn = gameState.turn;
    gameState.turn = gameState.turn === SIDES.RED ? SIDES.BLACK : SIDES.RED;

    // Add state to repetition history
    const stateStr = serializeBoard(gameState.board, gameState.turn);
    gameState.repHistory.push(stateStr);

    // Repetition check (Threefold repetition check)
    if (checkThreefoldRepetition(stateStr)) {
        endGame(null, 'Draw by Threefold Repetition');
        return;
    }

    // Checkmate / Stalemate validation
    const inCheck = isKingInCheck(gameState.turn);
    const hasMoves = hasAnyLegalMoves(gameState.turn);

    if (inCheck && !hasMoves) {
        // Checkmate
        endGame(prevTurn, `${prevTurn === SIDES.RED ? 'Red Guest' : 'Black Host'} wins by Checkmate!`);
        return;
    } else if (!inCheck && !hasMoves) {
        // Stalemate: Stalemate is a Loss! Active player loses.
        const winner = gameState.turn === SIDES.RED ? SIDES.BLACK : SIDES.RED;
        endGame(winner, `${gameState.turn === SIDES.RED ? 'Red Guest' : 'Black Host'} Stalestated (Loss)!`);
        return;
    }

    // Reset active player timer dynamically based on step count
    gameState.timers[gameState.turn] = getAllowedTime(gameState.stepCount);
    
    // Clear pulsing yellow warnings
    document.body.classList.remove('time-warning');

    // Hide Confirm Move button
    document.getElementById('btn-commit-move').style.display = 'none';

    // Trigger visual updates
    updateActiveTurnCard();
    renderBoard();
    updateSystemStatus();

    // Start timer for new player
    startTimer();

    // Trigger AI move if in One Player Mode and it's the AI's turn
    // (Disabled for local pass-and-play playability)
    // if (gameState.mode === 'one-player' && gameState.turn === SIDES.BLACK && !gameState.isGameOver) {
    //     setTimeout(makeAIMove, 800);
    // }
}

function endGame(winnerSide, message) {
    gameState.isGameOver = true;
    clearInterval(gameState.timerId);
    
    document.body.classList.remove('time-warning');
    const modal = document.getElementById('modal-gameover');
    const icon = document.getElementById('modal-card-icon');
    const title = document.getElementById('modal-title');
    const msg = document.getElementById('modal-message');

    if (winnerSide) {
        icon.textContent = '🏆';
        title.textContent = 'Victory!';
        msg.textContent = message;
    } else {
        icon.textContent = '🤝';
        title.textContent = 'Draw';
        msg.textContent = message;
    }

    modal.style.display = 'flex';
}

function checkThreefoldRepetition(currentHash) {
    let matches = 0;
    // Iterate through past state log and count identical hashes
    gameState.repHistory.forEach(hash => {
        if (hash === currentHash) matches++;
    });
    return matches >= 3;
}

// --- Turn Timer & Wake-up Alarm System ---
function startTimer() {
    clearInterval(gameState.timerId);
    gameState.timerId = setInterval(() => {
        if (gameState.isGameOver) {
            clearInterval(gameState.timerId);
            return;
        }

        gameState.timers[gameState.turn]--;
        updateTimerDisplay();

        const timeLeft = gameState.timers[gameState.turn];

        // Critical Alarm: Pulse warning yellow background and speak voice countdown
        if (timeLeft === 30) {
            document.body.classList.add('time-warning');
            speakAlert("Wake up, baby! Your move!");
        }

        // Timer reaches 0:00 - trigger Penalty Strike
        if (timeLeft <= 0) {
            handleTimeExpiration();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const redTimerText = formatTime(gameState.timers[SIDES.RED]);
    const blackTimerText = formatTime(gameState.timers[SIDES.BLACK]);
    
    document.getElementById('timer-red').textContent = redTimerText;
    document.getElementById('timer-black').textContent = blackTimerText;
}

function formatTime(sec) {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Expiration Penalty Logic
function handleTimeExpiration() {
    clearInterval(gameState.timerId);
    
    const player = gameState.turn;
    const opponent = player === SIDES.RED ? SIDES.BLACK : SIDES.RED;

    // Check if player already has a Yellow Card
    if (gameState.yellowCards[player]) {
        // Strike 2: Forfeit Game!
        triggerForfeit(player, opponent);
    } else {
        // Strike 1: Yellow Card and +1:00 min extension
        gameState.yellowCards[player] = true;
        gameState.timers[player] = 60; // Add 1 minute
        
        // Render Yellow Card icon in header
        const cardElem = document.querySelector(`.player-${player} .yellow-card`);
        if (cardElem) cardElem.style.display = 'inline';
        
        speakAlert("Strike one! One minute added.");
        
        updateTimerDisplay();
        startTimer(); // Resume ticks on extension
    }
}

function triggerForfeit(forfeitPlayer, winnerPlayer) {
    gameState.isGameOver = true;
    
    // Play red forfeit splash screen animation
    const flash = document.createElement('div');
    flash.className = 'red-card-flash';
    flash.textContent = '🟥';
    document.body.appendChild(flash);

    speakAlert("Time's up! Forfeit game.");

    setTimeout(() => {
        flash.remove();
        endGame(winnerPlayer, `${forfeitPlayer === SIDES.RED ? 'Red Guest' : 'Black Host'} Forfeited on time (Red Card)!`);
    }, 1500);
}

// --- Tap Interaction Handlers (3-Tap Commitment) ---

// Tap 1: Select Piece
function handlePieceTap(r, c) {
    if (gameState.isGameOver || gameState.role === 'spectator') return;

    // Lock piece interactions in P2P mode if guest player connection is not open yet
    if (gameState.mode === 'p2p' && (!gameState.playerConn || !gameState.playerConn.open)) {
        return;
    }

    const piece = gameState.board[r][c];
    if (!piece) return;

    // In P2P mode, check if the clicked piece belongs to our assigned role color
    if (gameState.role && piece.side !== gameState.role) {
        // Tapping opponent's piece? (allowing capture target selection)
        if (gameState.selected) {
            const isLegalCapture = gameState.validMoves.some(m => m.r === r && m.c === c);
            if (isLegalCapture && (gameState.role === gameState.turn)) {
                handleTargetTap(r, c);
            }
        }
        return;
    }

    // Check if it is actually our turn in P2P mode
    if (gameState.role && gameState.turn !== gameState.role) {
        return; // Lock inputs on opponent's turn
    }

    // Tapping opponent's piece? (in Local Mode)
    if (piece.side !== gameState.turn) {
        if (gameState.selected) {
            const isLegalCapture = gameState.validMoves.some(m => m.r === r && m.c === c);
            if (isLegalCapture) {
                handleTargetTap(r, c);
            }
        }
        return;
    }

    // Play click sound
    playSound('select');

    // Selection Commitment Lift & Glow
    gameState.selected = { r, c };
    gameState.target = null; // Reset target selection
    gameState.validMoves = getLegalMoves(r, c);

    // Hide Confirm Move button
    document.getElementById('btn-commit-move').style.display = 'none';

    renderBoard();
}

// Tap 2: Target destination selection
function handleTargetTap(r, c) {
    if (gameState.isGameOver || gameState.role === 'spectator' || !gameState.selected) return;

    // Verify if it is a highlighted legal destination
    const isLegal = gameState.validMoves.some(m => m.r === r && m.c === c);
    if (!isLegal) return;

    // Play select click
    playSound('select');

    gameState.target = { r, c };

    // Display Confirm Move button
    document.getElementById('btn-commit-move').style.display = 'block';
}

// Tap 3: Confirm commitment move
function handleCommitTap() {
    if (gameState.isGameOver || gameState.role === 'spectator' || !gameState.selected || !gameState.target) return;
    
    makeMove(
        gameState.selected.r,
        gameState.selected.c,
        gameState.target.r,
        gameState.target.c
    );
}

// --- Render Operations ---
function renderBoard() {
    const piecesContainer = document.getElementById('pieces-container');
    const markersContainer = document.getElementById('ghost-markers-container');
    
    piecesContainer.innerHTML = '';
    markersContainer.innerHTML = '';

    // Draw active pieces
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const piece = gameState.board[r][c];
            if (piece) {
                const pieceDiv = document.createElement('div');
                pieceDiv.className = `chess-piece side-${piece.side}`;
                if (gameState.selected && gameState.selected.r === r && gameState.selected.c === c) {
                    pieceDiv.classList.add('selected');
                }
                pieceDiv.style.setProperty('--row', r);
                pieceDiv.style.setProperty('--col', c);
                pieceDiv.textContent = piece.char;

                // Bind Tap 1 selection event
                pieceDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handlePieceTap(r, c);
                });

                piecesContainer.appendChild(pieceDiv);
            }
        }
    }

    // Draw destination ghost dots
    if (gameState.selected) {
        gameState.validMoves.forEach(m => {
            const marker = document.createElement('div');
            marker.className = 'ghost-marker';
            marker.style.setProperty('--row', m.r);
            marker.style.setProperty('--col', m.c);

            // Bind Tap 2 target selection event
            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                handleTargetTap(m.r, m.c);
            });

            markersContainer.appendChild(marker);
        });
    }
}

function updateActiveTurnCard() {
    const redCard = document.getElementById('player-red-card');
    const blackCard = document.getElementById('player-black-card');

    if (gameState.turn === SIDES.RED) {
        redCard.classList.add('active-turn');
        blackCard.classList.remove('active-turn');
    } else {
        blackCard.classList.add('active-turn');
        redCard.classList.remove('active-turn');
    }
}

function updateSystemStatus() {
    const inCheck = isKingInCheck(gameState.turn);
    const alertElem = document.getElementById('check-alert');
    const statusElem = document.getElementById('system-status');

    if (inCheck) {
        alertElem.style.display = 'block';
        speakAlert("Check");
    } else {
        alertElem.style.display = 'none';
    }

    statusElem.textContent = `${gameState.turn === SIDES.RED ? "Red Guest's" : "Black Host's"} turn.`;
}

// --- Heuristic AI Engine (One Player Mode) ---
function isCellThreatened(targetR, targetC, attackerSide) {
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const p = gameState.board[r][c];
            if (p && p.side === attackerSide) {
                const pseudo = getPseudoMoves(r, c, gameState.board);
                const legalMoves = pseudo.filter(m => {
                    const prevDest = gameState.board[m.r][m.c];
                    const prevStart = gameState.board[r][c];
                    
                    gameState.board[m.r][m.c] = prevStart;
                    gameState.board[r][c] = null;

                    const violatesCheck = isKingInCheck(attackerSide, gameState.board);
                    const violatesFlyingGeneral = isFlyingGeneralViolated(gameState.board);

                    gameState.board[r][c] = prevStart;
                    gameState.board[m.r][m.c] = prevDest;

                    return !violatesCheck && !violatesFlyingGeneral;
                });

                if (legalMoves.some(m => m.r === targetR && m.c === targetC)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function makeAIMove() {
    if (gameState.isGameOver || gameState.turn !== SIDES.BLACK) return;

    // 1. Collect all Black pieces
    const blackPieces = [];
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const piece = gameState.board[r][c];
            if (piece && piece.side === SIDES.BLACK) {
                blackPieces.push({ r, c, piece });
            }
        }
    }

    // 2. Generate all legal moves for Black pieces
    const allMoves = [];
    blackPieces.forEach(({ r, c, piece }) => {
        const moves = getLegalMoves(r, c);
        moves.forEach(m => {
            let score = 0;
            const target = gameState.board[m.r][m.c];
            if (target) {
                const valMap = {
                    [PIECE_TYPES.GENERAL]: 10000,
                    [PIECE_TYPES.CHARIOT]: 900,
                    [PIECE_TYPES.CANNON]: 450,
                    [PIECE_TYPES.HORSE]: 400,
                    [PIECE_TYPES.ELEPHANT]: 200,
                    [PIECE_TYPES.ADVISOR]: 200,
                    [PIECE_TYPES.SOLDIER]: 100
                };
                score += valMap[target.type] || 100;
            }

            // Soldier evaluations: advance pawns
            if (piece.type === PIECE_TYPES.SOLDIER) {
                score += m.r * 2;
                if (m.r >= 5) score += 15;
            }

            // Deploy pieces early
            if (r === 0 && (piece.type === PIECE_TYPES.CHARIOT || piece.type === PIECE_TYPES.HORSE || piece.type === PIECE_TYPES.CANNON)) {
                score += 8;
            }

            // Threat calculations
            if (isCellThreatened(m.r, m.c, SIDES.RED)) {
                score -= 150;
            }

            // Tiny random variance
            score += Math.random() * 8;

            allMoves.push({
                startR: r,
                startC: c,
                endR: m.r,
                endC: m.c,
                score
            });
        });
    });

    if (allMoves.length === 0) {
        const inCheck = isKingInCheck(SIDES.BLACK);
        if (inCheck) {
            endGame(SIDES.RED, 'Red Guest wins by Checkmate!');
        } else {
            endGame(SIDES.RED, 'Black Host Stalestated (Loss)!');
        }
        return;
    }

    // Sort descending and play highest evaluated move
    allMoves.sort((a, b) => b.score - a.score);
    const bestMove = allMoves[0];

    makeAIMoveVisual(bestMove.startR, bestMove.startC, bestMove.endR, bestMove.endC);
}

function makeAIMoveVisual(startR, startC, endR, endC) {
    gameState.selected = { r: startR, c: startC };
    gameState.validMoves = getLegalMoves(startR, startC);
    renderBoard();
    playSound('select');

    setTimeout(() => {
        if (gameState.isGameOver || gameState.turn !== SIDES.BLACK) return;

        gameState.target = { r: endR, c: endC };
        
        document.getElementById('btn-commit-move').style.display = 'block';
        
        renderBoard();
        playSound('select');

        setTimeout(() => {
            if (gameState.isGameOver || gameState.turn !== SIDES.BLACK) return;

            document.getElementById('btn-commit-move').style.display = 'none';
            makeMove(startR, startC, endR, endC);
        }, 500);
    }, 600);
}

// --- Give Up & Forfeit ---
function toggleGiveUpConfirm(show) {
    const overlay = document.getElementById('giveup-confirm-overlay');
    if (show) {
        overlay.style.display = 'flex';
        playSound('select');
    } else {
        overlay.style.display = 'none';
        playSound('select');
    }
}

function executeGiveUp() {
    let forfeitSide = gameState.turn;
    if (gameState.role) forfeitSide = gameState.role;

    if (gameState.playerConn && gameState.playerConn.open) {
        gameState.playerConn.send({ type: 'forfeit' });
    }
    // Broadcast forfeit to all spectators
    gameState.spectatorConns.forEach(conn => {
        if (conn && conn.open) {
            conn.send({ type: 'forfeit' });
        }
    });

    const winnerSide = forfeitSide === SIDES.RED ? SIDES.BLACK : SIDES.RED;
    const winnerName = winnerSide === SIDES.RED ? "Red Guest" : "Black Host";
    const loserName = forfeitSide === SIDES.RED ? "Red Guest" : "Black Host";

    document.getElementById('giveup-confirm-overlay').style.display = 'none';
    endGame(winnerSide, `${loserName} gave up. ${winnerName} wins!`);
}

// --- P2P Network Handlers ---
function startP2PInviteFlow() {
    const statusPanel = document.getElementById('connection-status-panel');
    statusPanel.style.display = 'flex';

    // Show or hide spectators link readout based on spectator settings
    const spectatorSection = document.getElementById('invite-spectator-section');
    if (spectatorSection) {
        spectatorSection.style.display = gameState.spectatorsAllowed ? 'flex' : 'none';
    }

    // Open board immediately for Host so they aren't frozen on start modal
    initBoardLocal();
    clearInterval(gameState.timerId); // Keep timers frozen at 15s until player joins
    const statusText = document.getElementById('connection-status-text');
    if (statusText) {
        statusText.textContent = 'P2P: Waiting for guest connection...';
    }

    // Generate random 4-digit passcode
    const passcode = Math.floor(1000 + Math.random() * 9000).toString();
    gameState.passcode = passcode;
    
    // Display passcode
    const passcodeDisplay = document.getElementById('game-passcode-display');
    if (passcodeDisplay) {
        passcodeDisplay.textContent = passcode;
    }

    if (!gameState.peer) {
        initP2P();
    } else {
        // Peer is already initialized, generate invite links immediately
        const origin = window.location.origin === 'null' ? '' : window.location.origin;
        const roomLink = `${origin}${window.location.pathname}?room=${gameState.peerId}`;
        startInviteTimeout();
        showCopyLinkModal(roomLink);
    }

    // Wait for Peer ID registration if not ready
    if (!gameState.peerId) {
        // Timeout if peer ID not received in 5 seconds (brokering server unreachable)
        const peerTimeoutId = setTimeout(() => {
            if (!gameState.peerId) {
                clearInterval(checkPeerId);
                alert("Online matchmaking server unreachable. Please verify you are connected to the internet.");
                if (gameState.peer) {
                    gameState.peer.destroy();
                    gameState.peer = null;
                }
                document.getElementById('connection-status-panel').style.display = 'none';
                document.getElementById('modal-start-mode').style.display = 'flex';
            }
        }, 5000);

        const checkPeerId = setInterval(() => {
            if (gameState.peerId) {
                clearInterval(checkPeerId);
                clearTimeout(peerTimeoutId);
                const origin = window.location.origin === 'null' ? '' : window.location.origin;
                const roomLink = `${origin}${window.location.pathname}?room=${gameState.peerId}`;
                
                // Start the 30-second invitation timeout
                startInviteTimeout();

                // Always show the copy link modal so host can see passcode
                showCopyLinkModal(roomLink);

                // Native WhatsApp/Text Share sheet trigger (optional parallel call)
                if (navigator.share) {
                    const shareData = {
                        title: 'Join my Chinese Chess Game!',
                        text: `Let's play a real-time game of Chinese Chess! Passcode: ${passcode}`,
                        url: roomLink
                    };
                    navigator.share(shareData)
                        .then(() => console.log('[P2P] Shared successfully'))
                        .catch(err => {
                            console.log('[P2P] Share cancelled or blocked', err);
                        });
                }
            }
        }, 100);
    }
}

function showCopyLinkModal(roomLink) {
    const urlInput = document.getElementById('invite-url-input');
    urlInput.value = roomLink;
    document.getElementById('btn-copy-url').textContent = 'Copy';

    const spectateInput = document.getElementById('spectate-url-input');
    if (spectateInput) {
        spectateInput.value = `${roomLink}&spectate=true`;
        document.getElementById('btn-copy-spectate-url').textContent = 'Copy';
    }

    document.getElementById('modal-invite').style.display = 'flex';
}

function startInviteTimeout() {
    if (gameState.inviteTimeoutId) {
        clearTimeout(gameState.inviteTimeoutId);
    }

    gameState.inviteTimeoutId = setTimeout(() => {
        if (!gameState.playerConn || !gameState.playerConn.open) {
            console.log('[P2P] No Response: 30 seconds connection window expired');
            document.getElementById('modal-no-response').style.display = 'flex';
            playSound('select');
        }
    }, 30000); // 30 seconds
}

function initP2P(roomToConnect = null) {
    const statusText = document.getElementById('connection-status-text');
    const statusDot = document.querySelector('.status-indicator-dot');

    statusDot.className = 'status-indicator-dot waiting';
    if (roomToConnect) {
        if (gameState.role !== 'spectator') {
            gameState.role = SIDES.RED;
            statusText.textContent = 'P2P: Connecting to Host...';
        } else {
            statusText.textContent = 'P2P: Connecting to Host as Spectator...';
        }
    } else {
        statusText.textContent = 'P2P: Initializing Host...';
        gameState.role = SIDES.BLACK; 
    }

    try {
        gameState.peer = new Peer({
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });

        gameState.peer.on('open', (id) => {
            gameState.peerId = id;
            console.log('[P2P] PeerJS ID received: ' + id);

            if (roomToConnect) {
                connectToHost(roomToConnect);
            } else {
                statusText.textContent = 'P2P: Waiting for connections...';
            }
        });

        gameState.peer.on('connection', (connection) => {
            const clientRole = connection.metadata ? connection.metadata.role : 'player';
            if (clientRole === 'spectator') {
                if (!gameState.spectatorsAllowed) {
                    console.log('[P2P] Rejecting spectator: Spectators disabled');
                    const rejectSpectator = () => {
                        connection.send({ type: 'auth-failed', reason: 'Spectators are disabled in this match.' });
                        setTimeout(() => connection.close(), 500);
                    };
                    if (connection.open) {
                        rejectSpectator();
                    } else {
                        connection.on('open', rejectSpectator);
                    }
                    return;
                }

                gameState.spectatorConns.push(connection);

                const sendSync = () => {
                    connection.send({
                        type: 'spectator-sync',
                        board: gameState.board,
                        turn: gameState.turn,
                        stepCount: gameState.stepCount,
                        timers: gameState.timers,
                        yellowCards: gameState.yellowCards,
                        spectatorCount: gameState.spectatorConns.length
                    });
                    broadcastSpectatorCount();
                };

                if (connection.open) {
                    sendSync();
                } else {
                    connection.on('open', sendSync);
                }

                // Setup spectator message listener
                connection.on('close', () => {
                    gameState.spectatorConns = gameState.spectatorConns.filter(c => c !== connection);
                    console.log('[P2P] Spectator disconnected. Total spectators:', gameState.spectatorConns.length);
                    broadcastSpectatorCount();
                });
            } else {
                // Verify passcode
                const clientPasscode = connection.metadata ? connection.metadata.passcode : '';
                if (clientPasscode !== gameState.passcode) {
                    console.warn('[P2P] Rejecting player connection: Incorrect passcode');
                    const rejectPlayer = () => {
                        connection.send({ type: 'auth-failed', reason: 'Incorrect passcode' });
                        setTimeout(() => connection.close(), 500);
                    };
                    if (connection.open) {
                        rejectPlayer();
                    } else {
                        connection.on('open', rejectPlayer);
                    }
                    return;
                }

                if (gameState.playerConn) {
                    connection.close();
                    return;
                }
                gameState.playerConn = connection;

                if (connection.open) {
                    setupHostPlayerConnection(connection);
                } else {
                    connection.on('open', () => {
                        setupHostPlayerConnection(connection);
                    });
                }
            }
        });

        gameState.peer.on('error', (err) => {
            console.error('[P2P] PeerJS Error:', err);
            statusDot.className = 'status-indicator-dot';
            statusText.textContent = `P2P Error: ${err.type}`;
            
            if (err.type === 'peer-unavailable') {
                alert("The game host could not be found. Please check that the host is online and the invite link is correct.");
            } else if (err.type === 'network') {
                alert("Network error connecting to the matchmaking server. Please check your internet connection.");
            } else if (err.type === 'webrtc') {
                alert("WebRTC error. Your browser or network may be blocking peer-to-peer connections.");
            } else {
                alert(`P2P Connection Error: ${err.message || err.type}`);
            }
        });

    } catch (e) {
        console.error('[P2P] WebRTC not supported or blocked:', e);
        statusDot.className = 'status-indicator-dot';
        statusText.textContent = 'P2P: WebRTC Blocked';
    }
}

function connectToHost(hostId) {
    const statusText = document.getElementById('connection-status-text');
    const statusDot = document.querySelector('.status-indicator-dot');

    // Pass role and passcode metadata when connecting
    gameState.playerConn = gameState.peer.connect(hostId, {
        metadata: {
            role: gameState.role || 'player',
            passcode: gameState.enteredPasscode
        }
    });

    gameState.playerConn.on('open', () => {
        setupClientConnection();
    });

    gameState.playerConn.on('error', (err) => {
        console.error('[P2P] Connection Error:', err);
        statusDot.className = 'status-indicator-dot';
        statusText.textContent = 'P2P: Connection Failed!';
    });
}

function setupClientConnection() {
    // Clear timeouts and modals
    if (gameState.inviteTimeoutId) {
        clearTimeout(gameState.inviteTimeoutId);
        gameState.inviteTimeoutId = null;
    }
    document.getElementById('modal-invite').style.display = 'none';
    document.getElementById('modal-no-response').style.display = 'none';

    const statusText = document.getElementById('connection-status-text');
    const statusDot = document.querySelector('.status-indicator-dot');

    statusDot.className = 'status-indicator-dot connected';
    
    if (gameState.role === SIDES.RED) {
        statusText.textContent = 'P2P: Connected! Playing as Guest (Red)';
        speakAlert("Connected to Host. Red's turn. Make your move!");
        initBoardLocal();
    } else if (gameState.role === 'spectator') {
        statusText.textContent = 'P2P: Connected! Spectating game...';
        speakAlert("Connected as spectator.");
    }

    gameState.playerConn.on('data', (data) => {
        handleIncomingMessage(data);
    });

    gameState.playerConn.on('close', () => {
        console.log('[P2P] Connection closed');
        statusDot.className = 'status-indicator-dot';
        statusText.textContent = 'P2P: Disconnected!';
        speakAlert("Opponent disconnected.");
        gameState.playerConn = null;
    });
}

function setupHostPlayerConnection(connection) {
    const statusText = document.getElementById('connection-status-text');
    const statusDot = document.querySelector('.status-indicator-dot');

    statusDot.className = 'status-indicator-dot connected';
    statusText.textContent = `P2P: Connected! Playing as Host (Black). Spectators: ${gameState.spectatorConns.length}`;
    speakAlert("Opponent joined. Red's turn first.");
    initBoard();
    
    // Hide the invite modal when player joins!
    document.getElementById('modal-invite').style.display = 'none';
    
    connection.send({
        type: 'sync-timers',
        timers: { ...gameState.timers },
        yellowCards: { ...gameState.yellowCards }
    });

    connection.on('data', (data) => {
        handleIncomingMessage(data);
    });

    connection.on('close', () => {
        console.log('[P2P] Player connection closed');
        statusDot.className = 'status-indicator-dot';
        statusText.textContent = 'P2P: Disconnected!';
        speakAlert("Opponent disconnected.");
        gameState.playerConn = null;
    });

    broadcastSpectatorCount();
}

function broadcastSpectatorCount() {
    const count = gameState.spectatorConns.length;
    const payload = {
        type: 'spectator-count',
        count: count
    };
    if (gameState.playerConn && gameState.playerConn.open) {
        gameState.playerConn.send(payload);
    }
    gameState.spectatorConns.forEach(conn => {
        if (conn && conn.open) {
            conn.send(payload);
        }
    });

    // Update Host UI status text if playing
    if (gameState.role === SIDES.BLACK) {
        const statusText = document.getElementById('connection-status-text');
        statusText.textContent = `P2P: Connected! Playing as Host (Black). Spectators: ${count}`;
    }
}

function handleIncomingMessage(data) {
    if (data.type === 'move') {
        const piece = gameState.board[data.startR][data.startC];
        const targetPiece = gameState.board[data.endR][data.endC];

        if (targetPiece) {
            playSound('capture');
        } else {
            playSound('confirm');
        }

        gameState.board[data.endR][data.endC] = piece;
        gameState.board[data.startR][data.startC] = null;

        // Check if the King is captured (killed)
        if (targetPiece && targetPiece.type === PIECE_TYPES.GENERAL) {
            endGame(gameState.turn, `${gameState.turn === SIDES.RED ? 'Red Guest' : 'Black Host'} wins by capturing the King!`);
            return;
        }

        gameState.stepCount++;

        const prevTurn = gameState.turn;
        gameState.turn = gameState.turn === SIDES.RED ? SIDES.BLACK : SIDES.RED;

        const stateStr = serializeBoard(gameState.board, gameState.turn);
        gameState.repHistory.push(stateStr);

        if (data.timers) gameState.timers = data.timers;
        if (data.yellowCards) {
            gameState.yellowCards = data.yellowCards;
            const sides = [SIDES.RED, SIDES.BLACK];
            sides.forEach(s => {
                const icon = document.querySelector(`.player-${s} .yellow-card`);
                if (icon) {
                    icon.style.display = gameState.yellowCards[s] ? 'inline' : 'none';
                }
            });
        }

        const inCheck = isKingInCheck(gameState.turn);
        const hasMoves = hasAnyLegalMoves(gameState.turn);

        if (inCheck && !hasMoves) {
            endGame(prevTurn, `${prevTurn === SIDES.RED ? 'Red Guest' : 'Black Host'} wins by Checkmate!`);
            return;
        } else if (!inCheck && !hasMoves) {
            const winner = gameState.turn === SIDES.RED ? SIDES.BLACK : SIDES.RED;
            endGame(winner, `${gameState.turn === SIDES.RED ? 'Red Guest' : 'Black Host'} Stalestated (Loss)!`);
            return;
        }

        gameState.timers[gameState.turn] = getAllowedTime(gameState.stepCount);
        document.body.classList.remove('time-warning');
        
        // Hide Confirm Move button
        document.getElementById('btn-commit-move').style.display = 'none';

        updateActiveTurnCard();
        renderBoard();
        updateSystemStatus();
        updateTimerDisplay();
        startTimer();

        // Broadcast move to all spectators if we are Host
        if (gameState.role === SIDES.BLACK) {
            gameState.spectatorConns.forEach(conn => {
                if (conn && conn.open) {
                    conn.send({
                        type: 'move',
                        startR: data.startR,
                        startC: data.startC,
                        endR: data.endR,
                        endC: data.endC,
                        timers: { ...gameState.timers },
                        yellowCards: { ...gameState.yellowCards }
                    });
                }
            });
        }
    } else if (data.type === 'sync-timers') {
        if (data.timers) gameState.timers = data.timers;
        if (data.yellowCards) gameState.yellowCards = data.yellowCards;
        updateTimerDisplay();
    } else if (data.type === 'reset') {
        initBoardLocal();
    } else if (data.type === 'forfeit') {
        const oppSide = gameState.role === SIDES.RED ? SIDES.BLACK : SIDES.RED;
        const mySide = gameState.role;
        const myName = mySide === SIDES.RED ? "Red Guest" : "Black Host";
        const oppName = oppSide === SIDES.RED ? "Red Guest" : "Black Host";
        
        // Broadcast forfeit to all spectators if we are Host
        if (gameState.role === SIDES.BLACK) {
            gameState.spectatorConns.forEach(conn => {
                if (conn && conn.open) {
                    conn.send({ type: 'forfeit' });
                }
            });
        }

        endGame(mySide, `${oppName} gave up. ${myName} wins!`);
    } else if (data.type === 'spectator-sync') {
        if (data.board) gameState.board = data.board;
        if (data.turn) gameState.turn = data.turn;
        if (data.stepCount !== undefined) gameState.stepCount = data.stepCount;
        if (data.timers) gameState.timers = data.timers;
        if (data.yellowCards) {
            gameState.yellowCards = data.yellowCards;
            const sides = [SIDES.RED, SIDES.BLACK];
            sides.forEach(s => {
                const icon = document.querySelector(`.player-${s} .yellow-card`);
                if (icon) {
                    icon.style.display = gameState.yellowCards[s] ? 'inline' : 'none';
                }
            });
        }
        
        const statusText = document.getElementById('connection-status-text');
        statusText.textContent = `P2P: Spectating. Spectators: ${data.spectatorCount}`;
        const statusPanel = document.getElementById('connection-status-panel');
        statusPanel.style.display = 'flex';
        const statusDot = document.querySelector('.status-indicator-dot');
        statusDot.className = 'status-indicator-dot connected';

        updateActiveTurnCard();
        renderBoard();
        updateSystemStatus();
        updateTimerDisplay();
        startTimer();
    } else if (data.type === 'spectator-count') {
        const statusText = document.getElementById('connection-status-text');
        if (gameState.role === 'spectator') {
            statusText.textContent = `P2P: Spectating. Spectators: ${data.count}`;
        } else {
            statusText.textContent = `P2P: Connected! Spectators: ${data.count}`;
        }
    } else if (data.type === 'undo-request') {
        document.getElementById('modal-undo-request').style.display = 'flex';
        playSound('select');
    } else if (data.type === 'undo-accept') {
        undoMoveLocal();
        document.getElementById('system-status').textContent = 'Undo request accepted by opponent.';
        speakAlert("Undo request accepted.");
    } else if (data.type === 'undo-decline') {
        document.getElementById('system-status').textContent = 'Undo request declined.';
        speakAlert("Undo request declined.");
    } else if (data.type === 'auth-failed') {
        alert(`Connection Rejected: ${data.reason}`);
        if (gameState.playerConn) {
            gameState.playerConn.close();
            gameState.playerConn = null;
        }
        document.getElementById('connection-status-panel').style.display = 'none';
        document.getElementById('modal-start-mode').style.display = 'flex';
    }
}

// --- Startup Event Hooks ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial local board setup (does not start game clocks until mode selected)
    initBoardLocal();
    clearInterval(gameState.timerId); // Keep clock frozen on startup screen

    // 2. Check room parameter to initiate Guest auto-join or Spectator auto-join
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    const spectate = urlParams.get('spectate');
    if (room) {
        document.getElementById('modal-start-mode').style.display = 'none';
        gameState.mode = 'p2p';
        if (spectate === 'true') {
            gameState.role = 'spectator';
            initP2P(room);
        } else {
            const enteredPasscode = prompt("Enter the 4-digit Game Passcode to join as Player:");
            if (!enteredPasscode) {
                alert("Passcode is required to join as a player.");
                document.getElementById('modal-start-mode').style.display = 'flex';
            } else {
                gameState.enteredPasscode = enteredPasscode;
                initP2P(room);
            }
        }
    }

    // 3. Commit move overlay Tap 3 action (with touchstart optimization for mobile)
    const commitBtn = document.getElementById('btn-commit-move');
    const commitHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCommitTap();
    };
    commitBtn.addEventListener('click', commitHandler);
    commitBtn.addEventListener('touchstart', commitHandler, { passive: false });

    // 4. Reset/Menu actions
    document.getElementById('btn-restart').addEventListener('click', () => {
        if (confirm("Return to main menu and end current game?")) {
            // Cancel connection timers
            if (gameState.inviteTimeoutId) clearTimeout(gameState.inviteTimeoutId);
            clearInterval(gameState.timerId);
            
            if (gameState.peer) {
                gameState.peer.destroy();
                gameState.peer = null;
                gameState.peerId = null;
                gameState.playerConn = null;
                gameState.spectatorConns = [];
            }

            // Hide headers & panels
            document.getElementById('connection-status-panel').style.display = 'none';
            document.getElementById('modal-start-mode').style.display = 'flex';
        }
    });

    document.getElementById('btn-modal-restart').addEventListener('click', () => {
        document.getElementById('modal-gameover').style.display = 'none';
        document.getElementById('modal-start-mode').style.display = 'flex';
    });

    // 5. Game Mode Buttons Triggers
    document.getElementById('btn-mode-ai').addEventListener('click', () => {
        document.getElementById('modal-start-mode').style.display = 'none';
        gameState.mode = 'one-player';
        gameState.role = null; // No fixed role, player plays both sides
        initBoard();
    });

    document.getElementById('btn-mode-spectator').addEventListener('click', () => {
        document.getElementById('modal-start-mode').style.display = 'none';
        gameState.mode = 'p2p';
        gameState.role = SIDES.BLACK;
        gameState.spectatorsAllowed = true;
        startP2PInviteFlow();
    });

    document.getElementById('btn-mode-p2p').addEventListener('click', () => {
        document.getElementById('modal-start-mode').style.display = 'none';
        gameState.mode = 'p2p';
        gameState.role = SIDES.BLACK;
        gameState.spectatorsAllowed = false;
        startP2PInviteFlow();
    });

    // 6. Invite Fallback URL copying
    document.getElementById('btn-close-invite').addEventListener('click', () => {
        document.getElementById('modal-invite').style.display = 'none';
    });

    document.getElementById('btn-copy-url').addEventListener('click', () => {
        const urlInput = document.getElementById('invite-url-input');
        urlInput.select();
        urlInput.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(urlInput.value)
            .then(() => {
                document.getElementById('btn-copy-url').textContent = 'Copied!';
            })
            .catch(err => console.error('Failed to copy text', err));
    });

    document.getElementById('btn-copy-spectate-url').addEventListener('click', () => {
        const urlInput = document.getElementById('spectate-url-input');
        urlInput.select();
        urlInput.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(urlInput.value)
            .then(() => {
                document.getElementById('btn-copy-spectate-url').textContent = 'Copied!';
            })
            .catch(err => console.error('Failed to copy text', err));
    });

    // 7. Timeout/No-Response bindings
    document.getElementById('btn-timeout-oneplayer').addEventListener('click', () => {
        document.getElementById('modal-no-response').style.display = 'none';
        if (gameState.inviteTimeoutId) clearTimeout(gameState.inviteTimeoutId);
        
        gameState.mode = 'one-player';
        gameState.role = null; // No fixed role, player plays both sides
        document.getElementById('connection-status-panel').style.display = 'none';
        initBoard();
    });

    document.getElementById('btn-timeout-retry').addEventListener('click', () => {
        document.getElementById('modal-no-response').style.display = 'none';
        startP2PInviteFlow();
    });

    document.getElementById('btn-timeout-menu').addEventListener('click', () => {
        document.getElementById('modal-no-response').style.display = 'none';
        if (gameState.inviteTimeoutId) clearTimeout(gameState.inviteTimeoutId);
        
        if (gameState.peer) {
            gameState.peer.destroy();
            gameState.peer = null;
            gameState.peerId = null;
            gameState.playerConn = null;
            gameState.spectatorConns = [];
        }
        
        document.getElementById('connection-status-panel').style.display = 'none';
        document.getElementById('modal-start-mode').style.display = 'flex';
    });

    // 8. Give Up actions
    document.getElementById('btn-giveup').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGiveUpConfirm(true);
    });

    document.getElementById('btn-confirm-giveup').addEventListener('click', (e) => {
        e.stopPropagation();
        executeGiveUp();
    });

    document.getElementById('btn-cancel-giveup').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGiveUpConfirm(false);
    });

    // Tap outside resets selection and overlays
    window.addEventListener('click', (e) => {
        // Ignore clicks if the target or its parent is the #btn-commit-move button
        if (e.target.closest('#btn-commit-move')) {
            return;
        }
        // Reset confirmation markers
        if (gameState.selected && !gameState.target) {
            return;
        }
        gameState.target = null;
        document.getElementById('btn-commit-move').style.display = 'none';
        
        // Hide Give Up overlays
        document.getElementById('giveup-confirm-overlay').style.display = 'none';
    });

    // Mobile viewport touch optimization: trigger voice synth initialization on first touch
    window.addEventListener('touchstart', () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
        }
    }, { once: true });
});
