# Balance Scale Game

A physics-based puzzle game where you balance objects on a scale.

## How to Play

1. **Objective**: Balance the scale by placing objects of equal weight on both pans
2. **Drag and Drop**: Click and drag objects onto the scale pans
3. **Balance Detection**: Keep the scale balanced for 1 second to complete the level
4. **Duplicator**: Place an object on the duplicator platform, enter a number (1-10), and press Enter to spawn copies
5. **Trashcan**: Drag unwanted objects to the trashcan to remove them

## Controls

- **Mouse/Touch**: Drag objects to move them
- **R**: Restart current level
- **ESC**: Pause/Resume game

## Game Features

- Procedurally generated levels with increasing difficulty
- Unique weights for each object (no duplicates)
- Fixed objects appear starting at level 5 (cannot be moved)
- Physics-based scale movement with realistic tilting
- Duplicate prevention: Can't win by placing identical objects on each side

## Developer Mode

Type "sunwoo" during gameplay to toggle developer mode, which shows:
- Weight of each object
- Total weight on each pan
- Object locations

## Project Structure

```
balance-scale-game/
├── index.html    # Main HTML file
├── styles.css    # Stylesheet
├── game.js       # Game logic
└── README.md     # This file
```

## Running Locally

Simply open `index.html` in a modern web browser. No build process required.

## Technologies

- HTML5 Canvas
- Vanilla JavaScript (ES6+)
- CSS3
