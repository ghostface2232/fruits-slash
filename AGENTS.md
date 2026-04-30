1. Project Objective: A game where players use a webcam to recognize their hands and slice voxel fruits on the screen. Features simultaneous recognition of both hands, two modes (Classic and Arcade), and saves only the local high score.

2. Directory Structure Guidelines:
   - src/main.ts: Entry point; creates and starts the game instance
   - src/core/: Infrastructure components such as GameLoop, GameStateMachine, and EventBus
   - src/input/: HandTracker, MediaPipe integration, coordinate mapping
   - src/render/: Renderer, Camera, Lighting, PostFX, TrailRenderer
   - src/entities/: Fruit, VoxelMesh, Bomb, PowerUp
   - src/systems/: SpawnSystem, CollisionSystem, ScoreSystem, ModeRules
   - src/audio/: AudioBus, SoundLibrary
   - src/ui/: HUD, MainMenu, GameOverScreen, PermissionGate
   - src/config/: gameConfig.ts (all tunable constants)
   - public/models/: HandLandmarker, .task models
   - public/audio/: BGM, SFX files

3. Coding Rules:
   - All modules must use named exports. Default exports are prohibited.
   - Implement using classes, prioritizing read-only fields and using constructor injection for dependencies.
   - Explicitly define the disposal responsibility for Three.js objects (Mesh, Geometry, Material, Texture).
   - Functions called every frame should minimize object creation. Perform Vector3 operations in-place whenever possible.
   - All game constants must be centralized in src/config/gameConfig.ts.
   - The coordinate system defaults to pixel units (top-left origin at 0,0; y-axis increases downward).
     Use an OrthographicCamera for the Three.js camera to ensure a 1:1 mapping with screen coordinates.

4. Design Guidelines:
   - Color Palette: Natural and soft tones. Avoid excessive saturation.
   - Lighting: Combine HemisphereLight and DirectionalLight; replace shadows with Bloom post-processing.
   - Trails: A cartoon-style glow with a white core and a faint outline, with a variable width of 1–3px. The end of the slash should incorporate a slightly curved motion line that evokes a “whoosh!” sensation.
   - HUD: Cartoon card style. Thick (2-3px) dark outline + rounded corners (12-20px) + slight drop shadow + subtle -1° to +1° rotation to create a hand-drawn, slightly skewed look. Do not use the `backdrop-filter blur` property.
   - Main font: pixel font (Press Start 2P or Silkscreen); body text: Korean pixel font (DotGothic16, Galmuri11) or a rounded sans-serif prioritizing readability. Avoid using pixel fonts that are too small for body text; a 1.5x line height is recommended.
   - The color palette consists of a base of vivid pop colors (warm yellow, leaf green, sky blue, tomato red) + a warm background with low saturation (cream or apricot). Avoid backgrounds that are too dark, as they clash with the cartoon tone.

5. Work Guidelines:
   - After completing each step, verify functionality with `npm run dev` before committing to Git.
   - Always notify others in advance when adding new dependencies.
   - Separate major refactorings into separate commits.