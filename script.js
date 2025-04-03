import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// =============================================================================
// Configuration Constants
// =============================================================================
const DRAWING_CANVAS_WIDTH = 300;
const DRAWING_CANVAS_HEIGHT = 400;
const RENDER_CANVAS_WIDTH = 400;
const RENDER_CANVAS_HEIGHT = 400;
const POT_COLOR = 0xD3D3D3; // LightGray (wet clay look)
const BACKGROUND_COLOR = 0xf0f0f0;
const POT_SEGMENTS = 32;          // Smoothness of the 3D revolution
const DRAWING_CENTER_X = DRAWING_CANVAS_WIDTH / 2; // Vertical axis on drawing canvas
const MIN_POINT_DISTANCE_SQ = 4;  // Min squared distance between stored points
const SMOOTHING_ITERATIONS = 5;   // How many passes for the smoothing function
const POT_NOMINAL_HEIGHT = 10.0;  // Target height for the pot in 3D space for scaling/camera

// =============================================================================
// Global Variables
// =============================================================================
let scene, camera, renderer, controls, currentPot = null;
let isDrawing = false;
let drawnPoints = []; // Stores {x, y} points relative to drawing canvas top-left

// =============================================================================
// DOM Element References
// =============================================================================
// These are declared globally because they are used across multiple functions
const drawingCanvas = document.getElementById('drawingCanvas');
const ctx = drawingCanvas.getContext('2d');
const renderCanvas = document.getElementById('renderCanvas');
const clearButton = document.getElementById('clearButton');
const smoothCheckbox = document.getElementById('smoothCheckbox');

// =============================================================================
// Initialization Function
// =============================================================================
function init() {
    setupDrawingCanvas();
    setupThreeScene();
    setupEventListeners(); // Centralize event listener setup
    animate();             // Start the render loop
}

// =============================================================================
// Event Listener Setup
// =============================================================================
function setupEventListeners() {
    // Drawing Canvas Events
    drawingCanvas.addEventListener('pointerdown', startDrawing);
    drawingCanvas.addEventListener('pointermove', draw);
    drawingCanvas.addEventListener('pointerup', stopDrawing);
    drawingCanvas.addEventListener('pointerleave', stopDrawing); // Stop if pointer leaves canvas

    // Button/Checkbox Events
    clearButton.addEventListener('click', clearDrawing);
    smoothCheckbox.addEventListener('change', () => {
        // Regenerate pot immediately when checkbox changes, if a drawing exists
        if (drawnPoints.length > 1) {
            generate3DPot();
        }
    });
}

// =============================================================================
// 2D Canvas Drawing Functions
// =============================================================================

/** Sets up the initial state and style of the 2D drawing canvas. */
function setupDrawingCanvas() {
    drawingCanvas.width = DRAWING_CANVAS_WIDTH;
    drawingCanvas.height = DRAWING_CANVAS_HEIGHT;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    resetDrawingCanvasView(); // Set initial appearance
}

/** Clears the drawing canvas and redraws the background elements (overlay, axis). */
function resetDrawingCanvasView() {
    ctx.clearRect(0, 0, DRAWING_CANVAS_WIDTH, DRAWING_CANVAS_HEIGHT);
    drawInactiveAreaOverlay();
    drawAxisGuide();
}

/** Draws the semi-transparent overlay on the left (inactive) side. */
function drawInactiveAreaOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(200, 200, 200, 0.4)'; // Light grey, semi-transparent
    ctx.fillRect(0, 0, DRAWING_CENTER_X, DRAWING_CANVAS_HEIGHT);
    ctx.restore();
}

/** Draws the central vertical axis line. */
function drawAxisGuide() {
    ctx.save();
    ctx.strokeStyle = '#666'; // Darker grey for axis
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(DRAWING_CENTER_X, 0);
    ctx.lineTo(DRAWING_CENTER_X, DRAWING_CANVAS_HEIGHT);
    ctx.stroke();
    ctx.restore();
}

/** Handles the start of a drawing action (pointer down). */
function startDrawing(event) {
    event.preventDefault();
    isDrawing = true;
    clearDrawingData();
    resetDrawingCanvasView(); // Clear canvas visually

    const pos = getCanvasCoordinates(event);
    ctx.beginPath(); // Start a new line path
    ctx.moveTo(pos.x, pos.y);
    addPoint(pos.x, pos.y);

    // Draw initial mirrored point indicator
    drawMirroredPointIndicator(pos.x, pos.y);
}

/** Handles pointer movement during drawing. */
function draw(event) {
    if (!isDrawing) return;
    event.preventDefault();

    const pos = getCanvasCoordinates(event);
    const lastPoint = drawnPoints[drawnPoints.length - 1];

    if (lastPoint) {
        // Draw primary segment (right side)
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();

        // Draw mirrored segment (left side)
        const mirroredCurrentX = 2 * DRAWING_CENTER_X - pos.x;
        const mirroredLastX = 2 * DRAWING_CENTER_X - lastPoint.x;
        ctx.beginPath();
        ctx.moveTo(mirroredLastX, lastPoint.y);
        ctx.lineTo(mirroredCurrentX, pos.y);
        ctx.stroke();
    }
    addPoint(pos.x, pos.y);
}

/** Handles the end of a drawing action (pointer up or leave). */
function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        generate3DPot(); // Update the 3D view
    }
}

/** Draws a small indicator for the mirrored point (used in startDrawing). */
function drawMirroredPointIndicator(x, y) {
     const mirroredX = 2 * DRAWING_CENTER_X - x;
     ctx.fillStyle = '#000';
     ctx.fillRect(mirroredX - 1, y - 1, 3, 3); // Small 3x3 square
}

/** Converts browser event coordinates to canvas coordinates, clamping to the right side. */
function getCanvasCoordinates(event) {
    const rect = drawingCanvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    let x = clientX - rect.left;
    let y = clientY - rect.top;

    // Clamp to the drawing area (right side only) and canvas bounds
    x = Math.max(DRAWING_CENTER_X, x);
    x = Math.min(x, DRAWING_CANVAS_WIDTH);
    y = Math.max(0, y);
    y = Math.min(y, DRAWING_CANVAS_HEIGHT);

    return { x, y };
}

/** Adds a point to the drawnPoints array if it's sufficiently far from the last point. */
function addPoint(x, y) {
    const lastPoint = drawnPoints[drawnPoints.length - 1];
    if (!lastPoint || (x - lastPoint.x)**2 + (y - lastPoint.y)**2 > MIN_POINT_DISTANCE_SQ) {
        drawnPoints.push({ x, y });
    }
}

/** Clears the array storing the user's drawn points. */
function clearDrawingData() {
    drawnPoints = [];
}

/** Clears the drawing canvas, the stored points, and the 3D pot preview. */
function clearDrawing() {
    clearDrawingData();
    resetDrawingCanvasView(); // Reset visual appearance
    removeCurrentPot();      // Remove 3D object
    console.log("Drawing Cleared");
}

// =============================================================================
// 3D Scene (Three.js) Functions
// =============================================================================

/** Sets up the core Three.js scene, camera, renderer, lights, and controls. */
function setupThreeScene() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND_COLOR);

    // Camera
    const cameraYOffset = POT_NOMINAL_HEIGHT / 2;
    const cameraDistance = POT_NOMINAL_HEIGHT * 1.5; // Adjust for zoom
    camera = new THREE.PerspectiveCamera(50, RENDER_CANVAS_WIDTH / RENDER_CANVAS_HEIGHT, 0.1, 1000);
    camera.position.set(0, cameraYOffset, cameraDistance);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, antialias: true });
    renderer.setSize(RENDER_CANVAS_WIDTH, RENDER_CANVAS_HEIGHT);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Lighting (Improved Setup)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8); // Sky, Ground, Intensity
    hemiLight.position.set(0, POT_NOMINAL_HEIGHT, 0);
    scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7); // Key light
    dirLight1.position.set(5, 7, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4); // Fill light
    dirLight2.position.set(-5, 3, -3);
    scene.add(dirLight2);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, cameraYOffset, 0); // Look at pot center
    controls.update(); // Apply initial settings

    // Optional Axes Helper
    // const axesHelper = new THREE.AxesHelper(POT_NOMINAL_HEIGHT);
    // scene.add(axesHelper);
}

/** Creates the 3D pot geometry and mesh based on drawn points. */
function generate3DPot() {
    // Determine if smoothing should be applied
    let pointsToUse = drawnPoints;
    if (smoothCheckbox.checked && drawnPoints.length >= 3) {
        console.log("Applying smoothing...");
        pointsToUse = applyMovingAverage([...drawnPoints], SMOOTHING_ITERATIONS); // Use a copy!
    } else {
         console.log("Using raw points...");
    }

    if (pointsToUse.length < 2) {
        console.warn("Need at least 2 points after processing to generate shape.");
        removeCurrentPot(); // Clear previous pot if new drawing is too short
        return;
    }

    removeCurrentPot(); // Remove existing pot

    // --- Convert 2D points to 3D profile (LatheGeometry points) ---
    const scale = POT_NOMINAL_HEIGHT / DRAWING_CANVAS_HEIGHT;
    let lathePoints = [];
    for (const p of pointsToUse) {
        const radius = (p.x - DRAWING_CENTER_X) * scale;
        const height = (DRAWING_CANVAS_HEIGHT - p.y) * scale; // Flip Y axis
        lathePoints.push(new THREE.Vector2(Math.max(0, radius), height)); // Ensure non-negative radius
    }

    // --- Process points for LatheGeometry ---
    // Sort by height to correctly identify the base
    lathePoints.sort((a, b) => a.y - b.y);

    // Ensure base closure if the lowest point isn't on the axis
    if (lathePoints.length > 0 && lathePoints[0].x > 0.01) {
        lathePoints.unshift(new THREE.Vector2(0, lathePoints[0].y)); // Add point at radius 0
    }

    // Remove duplicate points (using tolerance)
    const uniqueLathePoints = lathePoints.filter((point, index, self) =>
        index === self.findIndex((p) => (
            Math.abs(p.x - point.x) < 0.001 && Math.abs(p.y - point.y) < 0.001
        ))
    );

    if (uniqueLathePoints.length < 2) {
        console.warn("Not enough unique points after processing for LatheGeometry.");
        return;
    }

    // --- Create the 3D Mesh ---
    try {
        const geometry = new THREE.LatheGeometry(uniqueLathePoints, POT_SEGMENTS);
        const material = new THREE.MeshStandardMaterial({
            color: POT_COLOR,
            side: THREE.DoubleSide, // Show inside for open tops
            metalness: 0.2,
            roughness: 0.6
        });

        currentPot = new THREE.Mesh(geometry, material);
        scene.add(currentPot);
        console.log(`Generated pot mesh with ${uniqueLathePoints.length} unique points.`);

    } catch (error) {
        console.error("Error creating LatheGeometry:", error);
        console.error("Points used:", uniqueLathePoints);
        // Consider adding user feedback here, e.g., alert(...)
    }
}

/** Removes the current 3D pot from the scene and frees GPU resources. */
function removeCurrentPot() {
    if (currentPot) {
        scene.remove(currentPot);
        if (currentPot.geometry) currentPot.geometry.dispose();
        if (currentPot.material) currentPot.material.dispose();
        currentPot = null;
        console.log("Removed previous pot mesh.");
    }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Applies a simple moving average smoothing to an array of 2D points.
 * Keeps the first and last points fixed.
 * @param {Array<{x: number, y: number}>} points - The input points.
 * @param {number} [iterations=1] - Number of smoothing passes.
 * @returns {Array<{x: number, y: number}>} The smoothed points array.
 */
function applyMovingAverage(points, iterations = 1) {
    if (points.length < 3 || iterations < 1) {
        return points; // Cannot smooth or no iterations requested
    }

    let smoothedPoints = [...points]; // Start with a copy

    for (let iter = 0; iter < iterations; iter++) {
        let currentPassResult = [smoothedPoints[0]]; // Keep first point fixed

        for (let i = 1; i < smoothedPoints.length - 1; i++) {
            const p = smoothedPoints[i - 1]; // Previous
            const c = smoothedPoints[i];     // Current
            const n = smoothedPoints[i + 1]; // Next
            // Average the point with its immediate neighbors
            currentPassResult.push({ x: (p.x + c.x + n.x) / 3, y: (p.y + c.y + n.y) / 3 });
        }

        currentPassResult.push(smoothedPoints[smoothedPoints.length - 1]); // Keep last point fixed
        smoothedPoints = currentPassResult; // Result of this pass becomes input for the next
    }
    return smoothedPoints;
}

// =============================================================================
// Animation Loop
// =============================================================================

/** The main render loop, called repeatedly via requestAnimationFrame. */
function animate() {
    requestAnimationFrame(animate); // Schedule the next frame
    controls.update();             // Update orbit controls (needed for damping)
    renderer.render(scene, camera); // Render the 3D scene
}

// =============================================================================
// Start Application
// =============================================================================
init(); // Execute the initialization function