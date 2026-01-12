/* three-teaser.js (NO bare imports, Webflow-safe)
   - Creates a full-screen Three.js canvas inside #three-mount
   - Pointer-follow tilt + smooth idle wiggle (continues from last pointer)
   - Rotates logo 180° on X axis (fix “wrong face”)
   - Uses CDN module imports internally (no importmap needed)
*/

(function () {
  // =========================
  // 1) CONFIG (edit these 2)
  // =========================
  // IMPORTANT: set these to your real asset URLs.
  // HDR you already used before (kept as default):
  const DEFAULT_HDRI_URL =
    "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/studio_small_09_4k.hdr";

  // SET THIS to your real GLB/GLTF URL in the same repo:
  // Example guesses (pick the one you actually have):
  // "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/logo.glb"
  // "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/hammoumi.glb"
  const DEFAULT_MODEL_URL =
    "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/logo.glb";

  // Make logo ~30% bigger:
  const LOGO_SCALE = 1.3;

  // Tilt strength (you asked: more up/down tilt than left/right):
  const TILT_X_STRENGTH = 1.55; // up/down
  const TILT_Y_STRENGTH = 1.0;  // left/right (already “perfect”)

  // Idle wiggle:
  const IDLE_AFTER_MS = 900;
  const IDLE_WIGGLE_X = 0.22;
  const IDLE_WIGGLE_Y = 0.10;
  const IDLE_WIGGLE_Z = 0.03;

  // =========================
  // 2) Ensure mount exists
  // =========================
  function ensureMount() {
    let mount = document.getElementById("three-mount");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "three-mount";
      document.body.prepend(mount);
    }

    // Full-screen fixed layer behind UI
    mount.style.position = "fixed";
    mount.style.inset = "0";
    mount.style.width = "100vw";
    mount.style.height = "100vh";
    mount.style.zIndex = "1";
    mount.style.pointerEvents = "none"; // keeps your UI clickable
    mount.style.overflow = "hidden";

    return mount;
  }

  // =========================
  // 3) Inject a MODULE script that imports Three from CDN
  // =========================
  function runAsModule(mount) {
    const modelUrl = mount.getAttribute("data-model") || DEFAULT_MODEL_URL;
    const hdriUrl = mount.getAttribute("data-hdri") || DEFAULT_HDRI_URL;

    const moduleCode = `
      import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
      import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js";
      import { RGBELoader } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/RGBELoader.js";

      const mount = document.getElementById("three-mount");
      if (!mount) {
        console.error("Three teaser init error: Missing #three-mount");
        throw new Error("Missing #three-mount");
      }

      // --- Scene / Camera / Renderer ---
      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
      camera.position.set(0, 0.2, 6);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setClearColor(0x000000, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      mount.innerHTML = "";
      mount.appendChild(renderer.domElement);

      // --- Lights (subtle) ---
      const key = new THREE.DirectionalLight(0xffffff, 1.0);
      key.position.set(2, 3, 4);
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xffffff, 0.45);
      fill.position.set(-3, 1.5, 2);
      scene.add(fill);

      const amb = new THREE.AmbientLight(0xffffff, 0.25);
      scene.add(amb);

      // --- Resize ---
      function resize() {
        const w = Math.max(1, mount.clientWidth);
        const h = Math.max(1, mount.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
      window.addEventListener("resize", resize, { passive: true });
      resize();

      // --- Environment HDRI ---
      new RGBELoader().load(
        ${JSON.stringify(hdriUrl)},
        (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          scene.environment = tex;
        },
        undefined,
        (err) => console.warn("HDRI load failed:", err)
      );

      // --- Load Model ---
      const loader = new GLTFLoader();
      let rig = new THREE.Group();
      scene.add(rig);

      let logo = null;

      function fitCameraToObject(object3D, fitOffset = 1.18) {
        const box = new THREE.Box3().setFromObject(object3D);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxSize = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs((maxSize / 2) / Math.tan(fov / 2));
        cameraZ *= fitOffset;

        camera.position.set(center.x, center.y + maxSize * 0.05, center.z + cameraZ);
        camera.lookAt(center);
      }

      loader.load(
        ${JSON.stringify(modelUrl)},
        (gltf) => {
          logo = gltf.scene;

          // 30% bigger
          logo.scale.setScalar(${LOGO_SCALE});

          // FIX: rotate 180° on X axis (your request)
          logo.rotation.x += Math.PI;

          rig.add(logo);

          // Frame it nicely
          fitCameraToObject(rig, 1.22);
        },
        undefined,
        (err) => {
          console.error("Model load failed:", err);
        }
      );

      // =========================
      // Interaction (cursor + idle wiggle)
      // =========================
      let targetX = 0, targetY = 0;     // pointer target
      let lastMove = performance.now();
      let hasPointer = false;

      function setFromPointer(clientX, clientY) {
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        const nx = (clientX / w) * 2 - 1;   // -1..1
        const ny = (clientY / h) * 2 - 1;   // -1..1
        targetX = -ny; // invert so up tilts up
        targetY = nx;
        lastMove = performance.now();
        hasPointer = true;
      }

      window.addEventListener("mousemove", (e) => setFromPointer(e.clientX, e.clientY), { passive: true });
      window.addEventListener("touchmove", (e) => {
        if (!e.touches || !e.touches[0]) return;
        setFromPointer(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });

      // Start idle from the last pointer position (no “cut jump”)
      // We keep targetX/targetY as base and add small sin wiggle on top.
      const BASE_X = 0.10; // small presentational tilt
      const BASE_Y = -0.10;
      const BASE_Z = 0.00;

      function animate(t) {
        requestAnimationFrame(animate);

        const now = performance.now();
        const idle = (now - lastMove) > ${IDLE_AFTER_MS};

        // pointer influence
        const px = hasPointer ? (targetX * ${TILT_X_STRENGTH}) : 0;
        const py = hasPointer ? (targetY * ${TILT_Y_STRENGTH}) : 0;

        // idle wiggle (continues from last pointer, no snapping)
        let wigX = 0, wigY = 0, wigZ = 0;
        if (idle) {
          const tt = t * 0.001;
          wigX = Math.sin(tt * 0.65) * ${IDLE_WIGGLE_X};
          wigY = Math.sin(tt * 0.50) * ${IDLE_WIGGLE_Y};
          wigZ = Math.sin(tt * 0.35) * ${IDLE_WIGGLE_Z};
        }

        // Smooth interpolation
        const desiredX = BASE_X + px + wigX;
        const desiredY = BASE_Y + py + wigY;
        const desiredZ = BASE_Z + wigZ;

        rig.rotation.x += (desiredX - rig.rotation.x) * 0.08;
        rig.rotation.y += (desiredY - rig.rotation.y) * 0.10;
        rig.rotation.z += (desiredZ - rig.rotation.z) * 0.06;

        renderer.render(scene, camera);
      }

      animate(0);
    `;

    const script = document.createElement("script");
    script.type = "module";
    script.textContent = moduleCode;
    document.head.appendChild(script);
  }

  // =========================
  // 4) Boot
  // =========================
  function boot() {
    const mount = ensureMount();
    runAsModule(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
