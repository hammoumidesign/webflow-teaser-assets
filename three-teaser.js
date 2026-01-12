(() => {
  if (window.__HammoumiTeaser3DLoaded) return;
  window.__HammoumiTeaser3DLoaded = true;

  const GLB_URL =
    "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/Hammoumi_Logo3D.glb";
  const HDR_URL =
    "https://raw.githubusercontent.com/hammoumidesign/webflow-teaser-assets/main/studio_small_09_4k.hdr";

  function ensureStyle() {
    if (document.getElementById("three-teaser-style")) return;
    const style = document.createElement("style");
    style.id = "three-teaser-style";
    style.textContent = `
      html, body { margin:0; padding:0; background:#000; overflow:hidden; }
      #three-mount{
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 1 !important;
        pointer-events: none !important;
      }
      #three-mount canvas { display:block; width:100% !important; height:100% !important; }
    `;
    document.head.appendChild(style);
  }

  function ensureMount() {
    let mount = document.getElementById("three-mount");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "three-mount";
      document.body.appendChild(mount);
    }
    if (mount.parentElement !== document.body) document.body.appendChild(mount);
    return mount;
  }

  async function main() {
    ensureStyle();
    const mount = ensureMount();

    const THREE = await import(
      "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js"
    );
    const { GLTFLoader } = await import(
      "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js"
    );
    const { RGBELoader } = await import(
      "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/RGBELoader.js"
    );

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    function resize() {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    const rig = new THREE.Group();
    scene.add(rig);

    // ---- Base orientation (we'll flip after we confirm facing) ----
    const BASE_X = Math.PI / 2;
    const BASE_Y = Math.PI;
    const BASE_Z = 0;
    rig.rotation.set(BASE_X, BASE_Y, BASE_Z);

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(5, 5, 5);
    scene.add(light);

    new RGBELoader().load(HDR_URL, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = tex;
    });

    let logo = null;

    function fitCameraToObject(object3D, fitOffset = 1.18) {
      const box = new THREE.Box3().setFromObject(object3D);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      object3D.position.sub(center);

      const maxSize = Math.max(size.x, size.y, size.z);
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const aspect = camera.aspect || 1;

      const fitHeightDistance = (maxSize / 2) / Math.tan(fov / 2);
      const fitWidthDistance = fitHeightDistance / aspect;
      const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

      camera.position.set(0, 0, distance);
      camera.near = distance / 100;
      camera.far = distance * 100;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0, 0);
    }

    new GLTFLoader().load(
      GLB_URL,
      (gltf) => {
        logo = gltf.scene;

        logo.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.metalness = 1;
            child.material.roughness = 0.08;
            child.material.envMapIntensity = 1.2;
            child.frustumCulled = false;
          }
        });

        rig.add(logo);
        resize();
        fitCameraToObject(logo, 1.18);
      },
      undefined,
      (err) => console.error("GLB load error:", err)
    );

    window.addEventListener("resize", () => {
      resize();
      if (logo) fitCameraToObject(logo, 1.18);
    });

    let mx = 0,
      my = 0;
    let lastMove = performance.now();

    window.addEventListener(
      "pointermove",
      (e) => {
        const modal = document.querySelector(".modal_wrap");
        if (modal && getComputedStyle(modal).display !== "none") return;

        mx = (e.clientX / window.innerWidth - 0.5) * 2;
        my = (e.clientY / window.innerHeight - 0.5) * 2;
        lastMove = performance.now();
      },
      { passive: true }
    );

    const followStrengthY = 0.55;
    const followStrengthX = 0.95;

    let idleMode = false;
    let idleStart = 0;
    let holdOffsetX = 0;
    let holdOffsetY = 0;

    function animate() {
      requestAnimationFrame(animate);

      const now = performance.now();
      const isIdle = now - lastMove > 900;

      if (isIdle && !idleMode) {
        idleMode = true;
        idleStart = now;
        holdOffsetX = rig.rotation.x - BASE_X;
        holdOffsetY = rig.rotation.y - BASE_Y;
      }
      if (!isIdle && idleMode) idleMode = false;

      const targetOffsetX = THREE.MathUtils.clamp(-my * followStrengthX, -1.05, 1.05);
      const targetOffsetY = mx * followStrengthY;

      const currentOffsetX = rig.rotation.x - BASE_X;
      const currentOffsetY = rig.rotation.y - BASE_Y;

      let desiredOffsetX = targetOffsetX;
      let desiredOffsetY = targetOffsetY;

      if (idleMode) {
        const t = (now - idleStart) * 0.001;
        desiredOffsetY = holdOffsetY + Math.sin(t * 0.65) * 0.18;
        desiredOffsetX = holdOffsetX + Math.sin(t * 0.5) * 0.06;
      }

      rig.rotation.x = BASE_X + (currentOffsetX + (desiredOffsetX - currentOffsetX) * 0.06);
      rig.rotation.y = BASE_Y + (currentOffsetY + (desiredOffsetY - currentOffsetY) * 0.06);
      rig.rotation.z = BASE_Z + Math.sin(now * 0.00032) * 0.02;

      renderer.render(scene, camera);
    }

    resize();
    animate();
  }

  main().catch((e) => console.error("Three teaser init error:", e));
})();
