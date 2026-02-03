import React, { useState, useEffect } from 'react';
import { useGame } from '../hooks/useGame';
import Grid from './Grid';

const Game = () => {
  const {
    grid,
    score,
    highScore,
    nextBlock,
    nextNextBlock,
    gameOver,
    isPaused,
    isDropping,
    droppingBlock,
    mergingBlocks,
    isAIMode,
    leaderboard,
    pendingScore,
    dropBlock,
    restart,
    togglePause,
    toggleAIMode,
    clearLeaderboard,
    savePlayerScore,
    skipSaveScore,
    ROWS,
    COLS,
  } = useGame();

  // Player name input state
  const [playerName, setPlayerName] = useState('');

  // Color palette for preview blocks (no animation)
  const getBlockColor = (value) => {
    const colors = {
      2: '#3b3b4f',
      4: '#4a4a5e',
      8: '#5a5a6e',
      16: '#6b5a7e',
      32: '#7b5a8e',
      64: '#8b5a7e',
      128: '#5a7b8e',
      256: '#5a8b7e',
      512: '#7e8b5a',
      1024: '#8e7b5a',
      2048: '#9e6b5a',
    };
    return colors[value] || '#ce3b4a';
  };

  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  // Keyboard controls for columns 1-5 (disabled during AI mode)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showRestartConfirm || isAIMode) return;

      const key = e.key;
      if (key >= '1' && key <= '5') {
        const col = parseInt(key, 10) - 1; // Convert to 0-indexed
        dropBlock(col);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dropBlock, showRestartConfirm, isAIMode]);

  const handleRestart = () => {
    if (score > 0 && !gameOver) {
      setShowRestartConfirm(true);
    } else {
      restart();
    }
  };

  const confirmRestart = () => {
    setShowRestartConfirm(false);
    restart();
  };

  const cancelRestart = () => {
    setShowRestartConfirm(false);
  };

  return (
    <div className="game-wrapper">
      {/* Main Game Section */}
      <div className="game">
        <div className="header">
          <h1>Number Merge</h1>
        </div>

        <div className="scores">
          <div className="score-box">
            <span className="score-label">Score</span>
            <span className="score-value">{score}</span>
          </div>
          <div className="score-box">
            <span className="score-label">Best</span>
            <span className="score-value">{highScore}</span>
          </div>
        </div>

        <div className="next-block-container">
          <span className="next-label">Next</span>
          <div className="next-block-preview">
            <div
              className="preview-block"
              style={{ backgroundColor: getBlockColor(nextBlock), color: '#f0f0f0' }}
            >
              {nextBlock}
            </div>
            <div
              className="preview-block secondary"
              style={{ backgroundColor: getBlockColor(nextNextBlock), color: '#f0f0f0' }}
            >
              {nextNextBlock}
            </div>
          </div>
        </div>

        <div className="game-area">
          <Grid
            grid={grid}
            onColumnClick={dropBlock}
            isDropping={isDropping}
            droppingBlock={droppingBlock}
            mergingBlocks={mergingBlocks}
            isAIMode={isAIMode}
            ROWS={ROWS}
            COLS={COLS}
          />

          {isPaused && !gameOver && (
            <div className="overlay">
              <div className="overlay-content">
                <h2>Paused</h2>
                <button className="btn" onClick={togglePause}>
                  Resume
                </button>
              </div>
            </div>
          )}

          {gameOver && !pendingScore && (
            <div className="overlay">
              <div className="overlay-content">
                <h2>Game Over</h2>
                <p className="final-score">Final Score: {score}</p>
                <button className="btn" onClick={restart}>
                  Play Again
                </button>
              </div>
            </div>
          )}

          {pendingScore !== null && (
            <div className="overlay">
              <div className="overlay-content">
                <h2>Game Over</h2>
                <p className="final-score">Final Score: {pendingScore}</p>
                <div className="name-input-section">
                  <label className="name-label">Enter your name:</label>
                  <input
                    type="text"
                    className="name-input"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Your name"
                    maxLength={12}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        savePlayerScore(playerName);
                        setPlayerName('');
                      }
                    }}
                  />
                  <div className="btn-group">
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        skipSaveScore();
                        setPlayerName('');
                      }}
                    >
                      Skip
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        savePlayerScore(playerName);
                        setPlayerName('');
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showRestartConfirm && (
            <div className="overlay">
              <div className="overlay-content">
                <h2>Restart Game?</h2>
                <p>Your current progress will be lost.</p>
                <div className="btn-group">
                  <button className="btn btn-secondary" onClick={cancelRestart}>
                    Cancel
                  </button>
                  <button className="btn" onClick={confirmRestart}>
                    Restart
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="controls">
          <button className="btn btn-secondary" onClick={togglePause} disabled={gameOver || isAIMode}>
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button className="btn btn-secondary" onClick={handleRestart}>
            Restart
          </button>
          <button
            className={`btn ${isAIMode ? 'btn-ai-active' : 'btn-ai'}`}
            onClick={toggleAIMode}
            disabled={gameOver}
          >
            {isAIMode ? 'Stop AI' : 'AI Mode'}
          </button>
        </div>

        <div className="instructions">
          <p>Tap a column to drop a block. Match same numbers to merge!</p>
        </div>
      </div>

      {/* Leaderboard - Side Section */}
      <div className="leaderboard-panel">
        <h4>Leaderboard</h4>
        {leaderboard.length === 0 ? (
          <p className="leaderboard-empty">No games yet</p>
        ) : (
          <>
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, idx) => (
                  <tr key={idx} className={`${idx === 0 ? 'top' : ''} ${entry.isAI ? 'ai-entry' : ''}`}>
                    <td>{idx + 1}</td>
                    <td>{entry.name}</td>
                    <td>{entry.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-small btn-danger" onClick={clearLeaderboard}>
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Game;
