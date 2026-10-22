"use client";

import { useEffect, useRef, useState } from "react";

export function InterviewerAvatar({ state }: { state: "idle" | "listening" | "speaking" | "thinking" }) {
  const host = useRef<HTMLDivElement>(null);
  const phase = useRef(state);
  phase.current = state;
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    const abort = new AbortController();
    void Promise.all([import("three"), import("three/addons/loaders/GLTFLoader.js"), import("three/addons/environments/RoomEnvironment.js")]).then(async ([T, { GLTFLoader }, { RoomEnvironment }]) => {
      if (disposed || !host.current) return;
      const container = host.current;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      container.appendChild(renderer.domElement);
      const scene = new T.Scene();
      const studio = new RoomEnvironment();
      const pmrem = new T.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(studio, .04);
      scene.environment = environment.texture;
      scene.environmentIntensity = .7;
      studio.dispose(); pmrem.dispose();
      const camera = new T.PerspectiveCamera(30, 1, .01, 20);
      camera.position.set(.01, 1.26, .86);
      camera.lookAt(0, 1.22, 0);
      scene.add(new T.HemisphereLight(0xfff7ec, 0x8eaaa0, 1.6));
      const key = new T.DirectionalLight(0xffe7d4, 2.3);
      key.position.set(-1, 2.5, 2); scene.add(key);
      const fill = new T.DirectionalLight(0xe1edff, 1);
      fill.position.set(1, 1.7, 1); scene.add(fill);
      const rim = new T.DirectionalLight(0xffefd8, 1.5);
      rim.position.set(.5, 2, -1); scene.add(rim);
      const release = (root: InstanceType<typeof T.Object3D>) => {
        const materials = new Set<InstanceType<typeof T.Material>>();
        const textures = new Set<InstanceType<typeof T.Texture>>();
        root.traverse((object) => {
          if (!(object instanceof T.Mesh)) return;
          object.geometry.dispose();
          if (object instanceof T.SkinnedMesh) object.skeleton.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        });
        materials.forEach((material) => {
          Object.values(material).forEach((value) => { if (value instanceof T.Texture) textures.add(value); });
          material.dispose();
        });
        textures.forEach((texture) => { texture.dispose(); if (typeof ImageBitmap !== "undefined" && texture.source.data instanceof ImageBitmap) texture.source.data.close(); });
      };
      const resize = new ResizeObserver(() => {
        const width = container.clientWidth, height = container.clientHeight;
        if (!width || !height) return;
        camera.aspect = width / height; camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      });
      resize.observe(container);
      const lost = (event: Event) => { event.preventDefault(); setStatus("failed"); renderer.setAnimationLoop(null); };
      renderer.domElement.addEventListener("webglcontextlost", lost);
      cleanup = () => {
        resize.disconnect(); renderer.setAnimationLoop(null);
        renderer.domElement.removeEventListener("webglcontextlost", lost);
        release(scene); environment.dispose(); renderer.dispose(); renderer.domElement.remove();
      };
      const response = await fetch("/models/interviewer.glb", { signal: abort.signal });
      if (!response.ok) throw new Error("Avatar unavailable");
      const model = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "/models/");
      if (disposed) { release(model.scene); return; }
      scene.add(model.scene);
      const top = new T.Box3().setFromObject(model.scene).max.y;
      camera.position.set(.18, top - .65, 5.65);
      camera.lookAt(0, top * .53, 0);
      const face: InstanceType<typeof T.Mesh>[] = [];
      model.scene.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        if (object.morphTargetDictionary) face.push(object);
      });
      const head = model.scene.getObjectByName("head");
      const restingHead = head?.quaternion.clone();
      const nod = new T.Quaternion();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      const start = performance.now();
      setStatus("ready");
      renderer.setAnimationLoop(() => {
        if (document.hidden) return;
        const t = (performance.now() - start) / 1000;
        const talking = phase.current === "speaking";
        const blink = reduced.matches ? 0 : Math.max(0, 1 - Math.abs((t % 4.7) - .12) / .12);
        // shortcut: state-driven mouth movement, upgrade to phoneme timing when TTS supplies it.
        const mouth = talking && !reduced.matches ? .12 + Math.abs(Math.sin(t * 10.5) * Math.sin(t * 3.7)) * .42 : 0;
        for (const mesh of face) {
          for (const [name, value] of [["BlinkLeft", blink], ["BlinkRight", blink], ["Speak", mouth]] as const) {
            const index = mesh.morphTargetDictionary?.[name];
            if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
          }
        }
        if (head && restingHead) {
          nod.setFromEuler(new T.Euler(reduced.matches ? 0 : Math.sin(t * 1.4) * .025, reduced.matches ? 0 : Math.sin(t * .6) * .055, phase.current === "listening" ? -.065 : 0));
          head.quaternion.copy(restingHead).multiply(nod);
        }
        renderer.render(scene, camera);
      });
    }).catch(() => { if (!disposed) { cleanup(); setStatus("failed"); } });
    return () => { disposed = true; abort.abort(); cleanup(); };
  }, []);
  return <div className="avatar-canvas" ref={host} role="img" aria-label="3D 机器人面试官">
    {status !== "ready" && <div className="avatar-portrait" style={{ backgroundImage: "url(/models/interviewer-preview.png)" }}>
      <span role="status">{status === "loading" ? "正在加载面试官…" : "3D 暂不可用，语音仍可使用"}</span>
    </div>}
  </div>;
}
