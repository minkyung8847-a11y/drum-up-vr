// Test-only XR driver. Uses actual curved UI raycasts and live Trigger state.
export async function installUnifiedPanelControls() {
  const T = window.THREE ?? window.T;
  const { unifiedPanelPoint } = await import('/src/components/vrUnifiedPanel.ts');
  const scene = window.scene ?? window.vrScene;
  window.panelStep = (count = 1) => {
    const actual = performance.now.bind(performance);
    try { performance.now = () => window.testXR.time; window.testXR.step(count); }
    finally { performance.now = actual; }
  };
  window.panelEmit = (type, input) => {
    const actual = performance.now.bind(performance), session = window.testXR;
    try { performance.now = () => session.time; session.emit(type, { inputSource: input, frame: session.frame() }); }
    finally { performance.now = actual; }
  };
  window.panelAim = (input, x, y) => {
    const panel = scene.getObjectByName('vr-unified-panel'), rig = scene.getObjectByName('player-rig');
    const point = panel.localToWorld(unifiedPanelPoint(x, y, new T.Vector3()));
    const origin = new T.Vector3(input.handedness === 'left' ? -.24 : .24, 1.15, .86);
    input.targetRaySpace.position = rig.worldToLocal(origin.clone()).toArray();
    input.targetRaySpace.quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), point.sub(origin).normalize()).toArray();
    window.panelStep(3);
  };
  window.panelClick = (input, x, y) => {
    window.panelAim(input, x, y);
    window.lastPanelPress = window.testXR.time + 1000 / 90;
    input.gamepad.buttons[0].pressed = true; input.gamepad.buttons[0].value = 1; window.panelStep();
    input.gamepad.buttons[0].pressed = false; input.gamepad.buttons[0].value = 0;
    if (!window.testXR.ended) window.panelStep(4);
  };
  window.panelPractice = input => window.panelClick(input, 432, 106);
  window.panelStart = input => {
    window.panelPractice(input); window.panelClick(input, 700, 450); window.panelClick(input, 180, 695);
    return window.lastPanelPress;
  };
  window.panelMode = (input, mode) => {
    window.panelClick(input, 656, 106); window.panelClick(input, mode === 'ar' ? 750 : 260, 333);
    if (!window.testXR.ended) window.panelStep(30);
  };
}
