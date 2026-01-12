;(() => {
  // ============ CONFIG ============
  const GLB_URL =
    "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/Hammoumi_Logo3D.glb";
  const HDR_URL =
    "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/studio_small_09_4k.hdr";

  // ============ HELPERS ============
  function ensureStyle() {
    if (document.getElementById("three-teaser-style")) return;
    const css = `
      #three-mount{
        position:fixed;
        inset:0;
        width:100vw;
        height:100vh;
        z-index:1;
        pointer-events:none;
        background:#000;
      }
      #three-mount canvas{ display:block; width:100%; height:100%; }
    `;
    const style = document.createElement("style");
    style.id = "three-teaser-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureMount() {
    let mount = document.getElementById("three-mount");
    if (!mount) {
      // If the div wasn't in the Embed for some reason, we create it so you at least see something.
      mount = document.createElement("div");
      mount.id = "three-mount";
      document.body.appendChild(mount);
    }
    return mount;
  }

  function showCrashBadge(msg) {
    const m = document.getElementById("three-mount");
    if (!m) return;
    const badge = document.createElement("div");
    badge.style.cssText =
      "position:fixed;left:12px;bottom:12px;color:#fff;font:12px/1.4 monospace;z-index:99999;background:rgba(0,0,0,.6);padding:8px 10px;border-radius:8px;max-width:70vw";
    badge.textContent = msg;
    document.body.appendChild(badge);
  }

  // This file is a NORMAL script. Webflow likes that.
  // Inside it we inject a MODULE script so we can use modern imports safely.
  function injectModule() {
    console.log("[ThreeTeaser] script started");

    ensureStyle();
    const mount = ensureMount();
    console.log("[ThreeTeaser] mount:", mount);

    const moduleCode = `
      const GLB_URL = ${JSON.stringify(GLB_URL)};
      const HDR_URL = ${JSON.stringify(HDR_URL)};

      async function main() {
        const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js");
        const { GLTFLoader } = await import("https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js");
        const { RGBELoader } = await import("https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/RGBELoader.js");

        const mount = document.getElementById("three-mount");
        if (!mount) throw new Error("Missing #three-mount");

        // Scene
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
        camera.position.set(0, 0, 7);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setClearColor(0x000000, 1);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        mount.innerHTML = "";
        mount.appendChild(renderer.domElement);

        function resize() {
          const w = Math.max(1, mount.clientWidth);
          const h = Math.max(1, mount.clientHeight);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
        }
        window.addEventListener("resize", resize, { passive: true });
        resize();

        // Env map
        try {
          const envTex = await new RGBELoader().loadAsync(HDR_URL);
          envTex.mapping = THREE.EquirectangularReflectionMapping;
          scene.environment = envTex;
        } catch (e) {
          console.warn("[ThreeTeaser] HDR failed:", e);
        }

        // Lights (fallback)
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir = new THREE.DirectionalLight(0xffffff, 0.7);
        dir.position.set(3, 5, 4);
        scene.add(dir);

        // Group/rig for motion
        const rig = new THREE.Group();
        scene.add(rig);

        // Load model
        const gltf = await new GLTFLoader().loadAsync(GLB_URL);
        const model = gltf.scene;

        // ===== FIX FACING DIRECTION HERE =====
        // You requested: rotate 180 degrees on X-axis (and keep it readable)
        model.rotation.x += Math.PI; // 180° on X

        rig.add(model);

        // Fit camera roughly
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Make logo ~30% bigger
        const scale = 1.3;
        model.scale.setScalar(scale);

        // Cursor tilt settings (more tilt on up/down as requested)
        let pointerX = 0, pointerY = 0;
        let lastMove = performance.now();
        let idleMode = true;

        function onMove(e){
          const rect = mount.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const y = (e.clientY - rect.top) / rect.height;
          pointerX = (x - 0.5) * 2;
          pointerY = (y - 0.5) * 2;
          lastMove = performance.now();
          idleMode = false;
        }
        window.addEventListener("pointermove", onMove, { passive:true });

        // Keep last cursor point for idle wiggle start (no jump)
        let holdX = 0, holdY = 0;
        let idleStart = performance.now();

        // Base rotations
        const BASE_X = 0;
        const BASE_Y = 0;
        const BASE_Z = 0;

        function animate(now){
          requestAnimationFrame(animate);

          const dtIdle = now - lastMove;
          if (dtIdle > 700 && !idleMode){
            idleMode = true;
            idleStart = now;
            holdX = pointerX;
            holdY = pointerY;
          }

          // More tilt on Y (up/down) than before
          const targetTiltX = (-pointerY) * 0.55; // stronger up/down tilt
          const targetTiltY = (pointerX) * 0.35;  // left/right already good

          let desiredX = targetTiltX;
          let desiredY = targetTiltY;

          if (idleMode){
            const t = (now - idleStart) * 0.001;
            desiredX = (-holdY) * 0.55 + Math.sin(t * 0.8) * 0.10;
            desiredY = ( holdX) * 0.35 + Math.sin(t * 0.6) * 0.08;
          }

          rig.rotation.x += (BASE_X + desiredX - rig.rotation.x) * 0.06;
          rig.rotation.y += (BASE_Y + desiredY - rig.rotation.y) * 0.06;
          rig.rotation.z  =  BASE_Z + Math.sin(now * 0.00025) * 0.02;

          renderer.render(scene, camera);
        }

        console.log("[ThreeTeaser] module ready, starting render loop");
        requestAnimationFrame(animate);
      }

      main().catch(err => {
        console.error("[ThreeTeaser] crashed:", err);
        const badge = document.createElement("div");
        badge.style.cssText =
          "position:fixed;left:12px;bottom:12px;color:#fff;font:12px/1.4 monospace;z-index:99999;background:rgba(0,0,0,.6);padding:8px 10px;border-radius:8px;max-width:70vw";
        badge.textContent = "ThreeTeaser crashed — check console.";
        document.body.appendChild(badge);
      });
    `;

    const blob = new Blob([moduleCode], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);

    const s = document.createElement("script");
    s.type = "module";
    s.src = url;
    s.onload = () => console.log("[ThreeTeaser] module injected");
    s.onerror = (e) => {
      console.error("[ThreeTeaser] module tag failed:", e);
      showCrashBadge("ThreeTeaser module failed to load — check console.");
    };
    document.head.appendChild(s);
  }

  try {
    injectModule();
  } catch (e) {
    console.error("[ThreeTeaser] outer crash:", e);
    showCrashBadge("ThreeTeaser crashed before start — check console.");
  }
})();
