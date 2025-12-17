# Balance Scale Game - Development Context for Claude Code

This document provides comprehensive context about the Balance Scale Game project to enable seamless continuation of development.

## Project Overview

A physics-based puzzle game where players balance a scale by arranging objects of unknown weights. The player must figure out which combination of objects creates equal weight on both sides.

## File Structure

```
balance-scale-game/
├── index.html    # Entry point, loads CSS and JS
├── styles.css    # Minimal styling (fullscreen canvas)
├── game.js       # All game logic (~900 lines)
└── README.md     # Player-facing documentation
```

## Core Game Mechanics

### Objective
- Place objects on the left and right pans of a balance scale
- Achieve equal weight on both sides
- Hold balance for 1 second to complete the level

### Objects
- Each object has a unique weight (1-15 kg depending on level)
- Objects are either circles or squares (randomly assigned)
- Size scales with weight: `size = 30 + weight * 8`
- 12 distinct colors in the palette
- **Fixed objects** (level 5+): Cannot be moved, indicated by white border and inner shape

### Scale Physics
- Scale tilts based on weight difference between pans
- **When unbalanced**: Physics-based movement with acceleration (5.0) and damping (0.95)
- **When balanced (equal weights)**: Set animation that smoothly levels out (`scale.angle *= 0.98` per frame)
- Max tilt angle: `Math.PI / 4.5` radians

### Duplicator Station (Bottom-Left)
- Place an object on the duplicator platform
- Click the screen display to activate input
- Type a number 1-10 and press Enter
- Spawns that many copies of the object (fall from sky)

### Trashcan (Bottom-Right)
- Drag objects over the trashcan to delete them

### Win Condition Requirements
1. Scale angle < 0.02 radians (nearly level)
2. At least one object on each pan
3. Objects on each side must be "different" - prevents the exploit of duplicating one object and placing copies on each side
   - "Different" is checked by comparing mass AND color when there's exactly 1 object per side

## Procedural Level Generation

### Difficulty Scaling
```javascript
const difficulty = Math.min(levelNum, 20);  // Caps at level 20
const minWeight = 1;
const maxWeight = Math.min(5 + difficulty, 15);  // Range expands with levels
const numMovable = Math.min(3 + Math.floor(difficulty / 5), 5);  // 3-5 objects
const useFixedObjects = levelNum >= 5;  // Fixed objects appear at level 5
```

### Generation Algorithm
1. Track used weights in a Set to ensure uniqueness
2. For fixed object levels (50% chance when level >= 5):
   - Generate a fixed object with random weight
   - Create 2 movable objects that sum to the fixed weight
   - Add extra movable objects to reach `numMovable`
3. For regular levels:
   - Generate `numMovable` objects with unique weights
   - Player must find valid combinations

### Key Design Decision
Levels are NOT guaranteed to be solvable with the provided objects alone - the duplicator is intended to be used to create additional objects as needed.

## Game States

```
'start'   → Start screen with Play button
'playing' → Active gameplay
'paused'  → Pause overlay with Resume/Quit buttons
```

## Controls

| Input | Action |
|-------|--------|
| Mouse/Touch drag | Move objects |
| R | Restart current level |
| ESC | Toggle pause |
| Click (after win) | Advance to next level |
| Type "sunwoo" | Toggle dev mode |

## Developer Mode

Activated by typing "sunwoo" during gameplay. Shows:
- Panel in top-right with object list
- Weight labels on each object
- Total weight per pan
- Object locations (left/right/dup/ground)

## Key Code Components

### PhysicsObject Class
```javascript
class PhysicsObject {
    // Properties: id, x, y, width, height, mass, color, isCircle, isFixed
    // State: vx, vy, grounded, onPan, isDragging
    // Methods: update(dt), draw(), containsPoint(), getPanInfo(), checkPanBottomCollision()
}
```

### Important Functions
- `generateLevel(levelNum)` - Creates new level with objects
- `updateScale(dt)` - Physics simulation for scale movement
- `checkDuplicationPan()` - Monitors duplicator for objects
- `spawnDuplicates()` - Creates copies when Enter pressed
- `animate()` - Main game loop (requestAnimationFrame)

### Pan Detection
Objects track which pan they're on via `getPanInfo()`:
- Returns `{ overPan: boolean, whichPan: 'left'|'right'|'dup'|null, panTop, panBottom }`
- Used for collision detection and weight calculation

## Visual Design

### Colors
- Background: `#1a1a2e` (dark blue)
- Ground: `#2d2d44` (slightly lighter)
- Scale base: `#8b7355` (brown)
- Scale metal: `#c4a052` (gold)
- Pans: `#cd853f` (copper)

### Layout
- Scale centered horizontally
- Duplicator in bottom-left corner
- Trashcan in bottom-right corner
- HUD at top (level number, status text, restart button)

## Previous Development Decisions

1. **Scale animation speed**: Multiple iterations to find the right balance between responsiveness and visual appeal. Final: 0.98 multiplier per frame for balanced state.

2. **Object count**: Reduced from 6 to 3-5 objects per level for cleaner gameplay.

3. **Weight variance**: Increased range and enforced uniqueness to make puzzles more interesting.

4. **Duplicate prevention**: Added check to prevent winning by placing identical duplicated objects on each side.

5. **Fixed objects**: Don't reduce movable object count - both types coexist.

6. **Removed features**: Tutorial system and Indiana Jones mode (timed mode with jungle theme) were removed for simplicity.

## Potential Future Enhancements

These were discussed but not implemented:
- Object-to-object collision (hitboxes) - attempted but reverted
- Sound effects
- Save progress between sessions
- More game modes
- Bound objects (locked to specific pan)
- Additional visual themes

## Known Behaviors

1. Objects can overlap each other (no inter-object collision)
2. Objects bounce off pan bottoms if approaching from below
3. Scale snaps to exactly 0 when balanced and close enough
4. Duplicated objects fall with initial velocity of 50

## Testing Dev Mode

To verify the game is working correctly:
1. Start game, begin level 1
2. Type "sunwoo" to enable dev mode
3. Check that weights are displayed and unique
4. Verify scale physics responds correctly to weight changes
5. Test duplicator creates correct number of copies
6. Confirm trashcan removes objects
7. Test that identical duplicates don't trigger win condition

---

This context should enable Claude Code to understand the codebase structure, design decisions, and continue development effectively.
