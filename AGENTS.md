1. Project Objective: A game where players use a webcam to recognize their hands and slice voxel-graphic fruits on the screen.
   Simultaneous recognition of both hands, two modes (Classic/Arcade), and only local high scores are saved.

2. Directory Structure Guidelines:
   - src/main.ts: Entry point, game instance creation, and startup
   - src/core/: Infrastructure such as GameLoop, GameStateMachine, and EventBus
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
     Use an OrthographicCamera in Three.js for a 1:1 mapping with screen coordinates.

4. Design Guidelines:
   - Color Palette: Natural and soft tones. Avoid excessive saturation.
   - Lighting: Combine HemisphereLight and DirectionalLight; replace shadows with Bloom post-processing.
   - Trails: White core with a slight blue glow; variable width of 1–3px.
   - HUD: Minimalist glassmorphism. Scores use a large display font; time uses a slim sans-serif font.

5. Work Guidelines:
   - After completing each stage, verify functionality with `npm run dev` before committing to Git.
   - Always notify others in advance when adding new dependencies.
   - Separate major refactorings into separate commits.