// Test-only WebXR device. Injected by Playwright, never imported by the app.
// Exercises Three's real WebXRManager and render loop with deterministic poses.
// Does NOT emulate a headset compositor, driver, latency, permissions or FPS.
export function installMockWebXR(options = {}) {
  const arMode = options.mode === 'immersive-ar';
  const switchable = options.mode === 'switchable';
  localStorage.setItem('drumup_vr_environment', 'studio');
  const transform = (p, q = [0, 0, 0, 1]) => {
    const [x, y, z, w] = q;
    return {
      position: { x: p[0], y: p[1], z: p[2], w: 1 },
      orientation: { x, y, z, w },
      matrix: new Float32Array([
        1 - 2 * (y*y + z*z), 2 * (x*y + z*w), 2 * (x*z - y*w), 0,
        2 * (x*y - z*w), 1 - 2 * (x*x + z*z), 2 * (y*z + x*w), 0,
        2 * (x*z + y*w), 2 * (y*z - x*w), 1 - 2 * (x*x + y*y), 0,
        ...p, 1,
      ]),
    };
  };
  class ReferenceSpace extends EventTarget {
    getOffsetReferenceSpace() { return this; }
  }
  class TestSession extends EventTarget {
    constructor(mode = arMode ? 'immersive-ar' : 'immersive-vr') {
      super();
      this.mode = mode;
      this.visibilityState = 'visible';
      this.environmentBlendMode = mode === 'immersive-ar' ? 'alpha-blend' : 'opaque';
      this.enabledFeatures = [mode === 'immersive-ar' && !switchable ? 'local' : 'local-floor'];
      this.renderState = { depthNear: .03, depthFar: 30 };
      this.inputSources = [];
      this.reference = new ReferenceSpace();
      this.head = { position: [0, 1.2, 0], quaternion: [0, 0, 0, 1], tracked: true };
      this.callbacks = new Map();
      this.nextId = 1;
      this.time = performance.now();
      this.pulses = [];
      this.ended = false;
    }
    requestReferenceSpace(type) {
      if (type !== this.enabledFeatures[0]) throw Error(`Unexpected reference space: ${type}`);
      return Promise.resolve(this.reference);
    }
    updateRenderState(state) { Object.assign(this.renderState, state); }
    requestAnimationFrame(callback) { const id = this.nextId++; this.callbacks.set(id, callback); return id; }
    cancelAnimationFrame(id) { this.callbacks.delete(id); }
    emit(type, data = {}) { const event = new Event(type); Object.assign(event, data); this.dispatchEvent(event); }
    connect(hand) {
      const space = { position: [hand === 'left' ? -.25 : .25, 1.05, .05], quaternion: [0, 0, 0, 1], tracked: true };
      const source = { handedness: hand, targetRayMode: 'tracked-pointer', gripSpace: space, targetRaySpace: space,
        profiles: ['generic-trigger-squeeze-thumbstick'],
        gamepad: { buttons: Array.from({ length: 5 }, () => ({ pressed: false, touched: false, value: 0 })),
          hapticActuators: [{ pulse: (strength, duration) => {
          this.pulses.push({ hand, strength, duration }); return Promise.resolve(true);
        } }] },
      };
      this.inputSources.push(source);
      this.emit('inputsourceschange', { added: [source], removed: [] });
      return source;
    }
    disconnect(source) {
      this.inputSources = this.inputSources.filter(item => item !== source);
      this.emit('inputsourceschange', { added: [], removed: [source] });
    }
    frame() {
      return {
        session: this,
        getPose: space => space.tracked ? { transform: transform(space.position, space.quaternion), emulatedPosition: false } : null,
        getViewerPose: () => {
          if (!this.head.tracked) return null;
          const head = transform(this.head.position, this.head.quaternion);
          const near = this.renderState.depthNear, far = this.renderState.depthFar;
          return { transform: head, emulatedPosition: false, views: ['left', 'right'].map(eye => {
            const offset = eye === 'left' ? -.032 : .032;
            const p = this.head.position.map((value, i) => value + head.matrix[i] * offset);
            return { eye, transform: transform(p, this.head.quaternion),
              projectionMatrix: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,-(far+near)/(far-near),-1, 0,0,-2*far*near/(far-near),0]) };
          }) };
        },
      };
    }
    step(count = 1, hz = 90) {
      if (this.ended) throw Error('Cannot step an ended test session');
      for (let i = 0; i < count; i++) {
        this.time += 1000 / hz;
        const pending = [...this.callbacks.values()]; this.callbacks.clear();
        if (!pending.length) throw Error('XR render loop has no scheduled frame');
        for (const callback of pending) callback(this.time, this.frame());
      }
    }
    squeeze(source) {
      this.emit('squeezestart', { inputSource: source, frame: this.frame() });
      this.emit('squeezeend', { inputSource: source, frame: this.frame() });
    }
    async end() {
      if (this.ended) return;
      this.ended = true;
      this.emit('end'); this.callbacks.clear();
    }
  }
  // The ordinary framebuffer is sufficient to exercise the app's stereo render
  // path. Native XR framebuffer/compositor correctness needs physical hardware.
  class TestLayer {
    constructor() {
      this.framebuffer = null; this.framebufferWidth = 1280; this.framebufferHeight = 720;
      this.ignoreDepthValues = false; this.fixedFoveation = 0;
    }
    getViewport(view) { return { x: view.eye === 'left' ? 0 : 640, y: 0, width: 640, height: 720 }; }
  }
  Object.defineProperty(window, 'XRWebGLBinding', { configurable: true, value: undefined });
  Object.defineProperty(window, 'XRWebGLLayer', { configurable: true, value: TestLayer });
  WebGL2RenderingContext.prototype.makeXRCompatible = async () => {};
  Object.defineProperty(navigator, 'xr', { configurable: true, value: {
    isSessionSupported: async mode => switchable ? ['immersive-vr', 'immersive-ar'].includes(mode) : mode === (arMode ? 'immersive-ar' : 'immersive-vr'),
    requestSession: async (mode, options) => {
      if (!(switchable ? ['immersive-vr', 'immersive-ar'].includes(mode) : mode === (arMode ? 'immersive-ar' : 'immersive-vr'))
        || ((!arMode || switchable) && !options.requiredFeatures.includes('local-floor'))) throw Error('Incorrect XR request');
      window.testXR = new TestSession(mode); return window.testXR;
    },
  } });
}
