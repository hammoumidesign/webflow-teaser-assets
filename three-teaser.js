/* three-teaser.js
   Hammoumi teaser — stable Webflow embed version (NO ESM imports)
*/

(() => {

   console.log("[ThreeTeaser] script started");

  // ====== CONFIG (your asset URLs) ======
  const GLB_URL =
    "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/Hammoumi_Logo3D.glb";
  const HDR_URL =
    "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/studio_small_09_4k.hdr";

  // ====== Helpers ======
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((s) => s.src === src);
      if (existing) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load: " + src));
      document.head.appendChild(s);
    });
  }

  function ensureMount() {
    let mount = document.getElementById("three-mount");

    if (!mount) {
      mount = document.createElement("div");
      mount.id = "three-mount";
    }

    // Force it to be a direct body child so Webflow wrappers can’t clip it
    if (mount.parentElement !== document.body) {
      document.body.appendChild(mount);
    }

    // Fullscreen canvas behind UI
    mount.style.position = "fixed";
    mount.style.left = "0";
    mount.style.top = "0";
    mount.style.width = "100vw";
    mount.style.height = "100vh";
    mount.style.zIndex = "1";
    mount.style.pointerEvents = "none";
    mount.style.overflow = "hidden";

    return mount;
  }

  function ensureBaseStyle() {
    // Keep background black + remove margins
    const styleId = "three-teaser-style";
    if (document.getElementById(styleId)) return;

    const st = document.createElement("style");
    st.id = styleId;
    st.textContent = `
      html, body { margin: 0; padding: 0; background: #000; }
      #three-mount canvas { display: block; width: 100%; height: 100%; }
    `;
    document.head.appendChild(st);
  }

  // ====== Main ======
  async function run() {
    ensureBaseStyle();
    const mount = ensureMount();
     console.log("[ThreeTeaser] mount:", mount);

    // Load Three + loaders (classic, stable)
    await loadScript("https://unpkg.com/three@0.158.0/build/three.min.js");
     console.log("[ThreeTeaser] three.min.js loaded");

    await loadScript(
      "https://unpkg.com/three@0.158.0/examples/js/loaders/GLTFLoader.js"
    );
    await loadScript(
      "https://unpkg.com/three@0.158.0/examples/js/loaders/RGBELoader.js"
    );

    const THREE = window.THREE;
    if (!THREE) throw new Error("THREE is not available on window");
    if (!THREE.GLTFLoader) throw new Error("GLTFLoader not attached to THREE");
    if (!THREE.RGBELoader) throw new Error("RGBELoader not attached to THREE");

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 800);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 1);

    // For three.min.js (0.158): use outputEncoding
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Tone mapping
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    mount.appendChild(renderer.domElement);
     console.log("[ThreeTeaser] canvas appended:", mount.querySelector("canvas"));


    // Resize
    function resize() {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    // Environment (HDRI)
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    const rgbe = new THREE.RGBELoader();
    rgbe.setDataType(THREE.UnsignedByteType);

    rgbe.load(
      HDR_URL,
      (hdrTex) => {
        const envMap = pmrem.fromEquirectangular(hdrTex).texture;
        scene.environment = envMap;
        scene.background = null;
        hdrTex.dispose();
        pmrem.dispose();
      },
      undefined,
      (err) => console.error("[Three] HDR load error:", err)
    );

    // Lights (small help, chrome relies mostly on env)
    const key = new THREE.DirectionalLight(0xffffff, 0.25);
    key.position.set(2, 3, 4);
    scene.add(key);

    const fill = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(fill);

    // Rig for rotation (so we tilt the whole logo)
    const rig = new THREE.Group();
    scene.add(rig);

    // Load model
    let logo = null;
    const gltfLoader = new THREE.GLTFLoader();

    function fitCameraToObject(obj3d, fitOffset = 1.25) {
      const box = new THREE.Box3().setFromObject(obj3d);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const maxSize = Math.max(size.x, size.y, size.z);
      const fov = (camera.fov * Math.PI) / 180;
      let cameraZ = Math.abs((maxSize / 2) / Math.tan(fov / 2));
      cameraZ *= fitOffset;

      camera.position.set(center.x, center.y, cameraZ);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
    }

    gltfLoader.load(
      GLB_URL,
      (gltf) => {
        logo = gltf.scene;

        // Put logo in rig
        rig.add(logo);

        // ✅ Rotate 180° on X axis (your request)
        // If it looks wrong, we can switch to Y or Z, but start with X.
        logo.rotation.x += Math.PI;

        // Optional: make it bigger (+30%)
        logo.scale.setScalar(1.3);

        // Center it
        const box = new THREE.Box3().setFromObject(logo);
        const center = box.getCenter(new THREE.Vector3());
        logo.position.sub(center);

        // Camera fit
        fitCameraToObject(rig, 1.2);
      },
      undefined,
      (err) => console.error("[Three] GLB load error:", err)
    );

    // Interaction (cursor follow + idle wiggle)
    let targetX = 0;
    let targetY = 0;
    let lastMove = performance.now();
    const idleAfterMs = 800;

    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    window.addEventListener("mousemove", (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1; // -1..1
      const ny = (e.clientY / window.innerHeight) * 2 - 1; // -1..1
      targetX = nx;
      targetY = ny;
      lastMove = performance.now();
    });

    // Mobile: use device orientation if available, otherwise idle wiggle
    if (window.DeviceOrientationEvent) {
      window.addEventListener(
        "deviceorientation",
        (e) => {
          if (e.beta == null || e.gamma == null) return;
          // gamma: left/right, beta: front/back
          const nx = clamp(e.gamma / 30, -1, 1);
          const ny = clamp(e.beta / 30, -1, 1);
          targetX = nx;
          targetY = ny;
          lastMove = performance.now();
        },
        { passive: true }
      );
    }

    // Base rotation offsets (tuned)
    const BASE_X = 0;
    const BASE_Y = 0;
    const BASE_Z = 0;

    // Tilt strengths (more vertical tilt like you wanted)
    const STR_X = 0.55; // vertical tilt strength (UP/DOWN)
    const STR_Y = 0.35; // horizontal tilt strength (LEFT/RIGHT)

    // Smoothness
    const LERP = 0.07;

    // Keep last “hold” so idle continues from last cursor position
    let holdX = 0;
    let holdY = 0;

    function animate(t) {
      requestAnimationFrame(animate);

      const now = performance.now();
      const idle = now - lastMove > idleAfterMs;

      if (!idle) {
        // Update hold point while user moves
        holdX = targetX;
        holdY = targetY;
      }

      // Desired offsets
      let dx = holdX;
      let dy = holdY;

      if (idle) {
        // Slow wiggle continuing from last position (no jump)
        const tt = now * 0.001;
        dx = holdX + Math.sin(tt * 0.7) * 0.12;
        dy = holdY + Math.sin(tt * 0.55) * 0.18;
      }

      // Apply to rig rotation
      const desiredRotX = BASE_X + (-dy * STR_X);
      const desiredRotY = BASE_Y + (dx * STR_Y);
      const desiredRotZ = BASE_Z + Math.sin(now * 0.00025) * 0.02;

      rig.rotation.x += (desiredRotX - rig.rotation.x) * LERP;
      rig.rotation.y += (desiredRotY - rig.rotation.y) * LERP;
      rig.rotation.z += (desiredRotZ - rig.rotation.z) * (LERP * 0.6);

      renderer.render(scene, camera);
    }

    requestAnimationFrame(animate);
  }

  // Run safely
  run().catch((err) => {
  console.error("[ThreeTeaser] crashed:", err);
  const m = document.getElementById("three-mount");
  if (m) m.innerHTML = "<div style='position:fixed;left:12px;bottom:12px;color:#fff;font:12px/1.4 monospace;z-index:99999'>ThreeTeaser crashed — check console.</div>";
});
