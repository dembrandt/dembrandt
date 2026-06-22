import assert from 'node:assert/strict';
import { test } from 'node:test';

const SPOOFED_VENDOR   = 'Google Inc. (NVIDIA)';
const SPOOFED_RENDERER = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';

function makeWebGLProto() {
  const store: Record<number, string> = {
    37445: 'Google Inc. (SwiftShader)',
    37446: 'SwiftShader ANGLE (Google, Vulkan 1.3.0)',
    9729:  'some-other-value',
  };
  return {
    getParameter(param: number): string | undefined {
      return store[param];
    },
  };
}

function applyWebGLPatch(proto: { getParameter: (p: number) => string | undefined }) {
  const orig = proto.getParameter.bind(proto);
  proto.getParameter = function(param: number) {
    if (param === 37445) return SPOOFED_VENDOR;
    if (param === 37446) return SPOOFED_RENDERER;
    return orig(param);
  };
}

test('WebGL patch overrides vendor (37445)', () => {
  const proto = makeWebGLProto();
  applyWebGLPatch(proto);
  assert.equal(proto.getParameter(37445), SPOOFED_VENDOR);
});

test('WebGL patch overrides renderer (37446)', () => {
  const proto = makeWebGLProto();
  applyWebGLPatch(proto);
  assert.equal(proto.getParameter(37446), SPOOFED_RENDERER);
});

test('WebGL patch passes through other parameters', () => {
  const proto = makeWebGLProto();
  applyWebGLPatch(proto);
  assert.equal(proto.getParameter(9729), 'some-other-value');
});

test('WebGL patch works independently on two prototypes (WebGL1 + WebGL2)', () => {
  const proto1 = makeWebGLProto();
  const proto2 = makeWebGLProto();
  applyWebGLPatch(proto1);
  applyWebGLPatch(proto2);
  assert.equal(proto1.getParameter(37445), SPOOFED_VENDOR);
  assert.equal(proto2.getParameter(37445), SPOOFED_VENDOR);
  assert.equal(proto1.getParameter(9729), proto2.getParameter(9729));
});

// --- Audio fingerprint ---

function makeSessionNoise(seed: number) {
  return (index: number): number => {
    const x = Math.sin(seed * 9301 + index * 49297 + 233720) * 10000;
    return 1e-7 + (x - Math.floor(x)) * 9e-7;
  };
}

function makeOfflineAudioContextProto() {
  return {
    startRendering(): Promise<{ getChannelData: (ch: number) => Float32Array }> {
      const data = new Float32Array(128).fill(0.5);
      return Promise.resolve({ getChannelData: (_ch: number) => data });
    },
  };
}

function applyAudioPatch(
  proto: { startRendering: () => Promise<{ getChannelData: (ch: number) => Float32Array }> },
  sessionNoise: (i: number) => number,
) {
  const orig = proto.startRendering.bind(proto);
  proto.startRendering = function() {
    return orig().then((buffer) => {
      const data = buffer.getChannelData(0);
      for (let i = 0; i < Math.min(data.length, 20); i++) {
        data[i] += sessionNoise(i);
      }
      return buffer;
    });
  };
}

test('audio patch mutates only first 20 samples of the rendered buffer', async () => {
  const proto = makeOfflineAudioContextProto();
  const baseline = new Float32Array(128).fill(0.5);
  applyAudioPatch(proto, makeSessionNoise(0.73));
  const buffer = await proto.startRendering();
  const data = buffer.getChannelData(0);

  for (let i = 0; i < 20; i++) {
    assert.ok(data[i] !== baseline[i], `sample ${i} unchanged`);
    assert.ok(Math.abs(data[i] - baseline[i]) < 1e-5, `sample ${i} noise too large`);
  }
  for (let i = 20; i < 128; i++) {
    assert.equal(data[i], baseline[i], `sample ${i} unexpectedly modified`);
  }
});

test('audio patch is session-stable: two startRendering calls produce identical output', async () => {
  const noise = makeSessionNoise(0.42);
  const proto = makeOfflineAudioContextProto();
  applyAudioPatch(proto, noise);

  const b1 = await proto.startRendering();
  const d1 = Float32Array.from(b1.getChannelData(0));

  // Reset underlying data to simulate a second fingerprint probe on the same page.
  const proto2 = makeOfflineAudioContextProto();
  applyAudioPatch(proto2, noise);
  const b2 = await proto2.startRendering();
  const d2 = b2.getChannelData(0);

  for (let i = 0; i < 20; i++) {
    assert.equal(d1[i], d2[i], `sample ${i} differs between reads`);
  }
});

test('audio patch noise differs across sessions (different seeds)', async () => {
  async function render(seed: number) {
    const proto = makeOfflineAudioContextProto();
    applyAudioPatch(proto, makeSessionNoise(seed));
    const buf = await proto.startRendering();
    return buf.getChannelData(0)[0];
  }
  const v1 = await render(0.1);
  const v2 = await render(0.9);
  assert.notEqual(v1, v2);
});
