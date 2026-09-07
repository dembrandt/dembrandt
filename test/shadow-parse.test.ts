import { describe, it, expect } from './_vitest-shim.js';
import { parseShadow, shadowDepth, splitShadowLayers } from '../lib/shadow-parse.js';

describe('shadow parsing', () => {
  it('splits layers without breaking colour functions apart', () => {
    const layers = splitShadowLayers('rgba(0, 0, 0, 0.1) 0px 1px 2px, rgba(0, 0, 0, 0.05) 0px 4px 6px');
    expect(layers.length).toBe(2);
    expect(layers[0]).toBe('rgba(0, 0, 0, 0.1) 0px 1px 2px');
  });

  it('reads a computed shadow, where the colour comes first', () => {
    const [layer] = parseShadow('rgba(0, 0, 0, 0.1) 0px 10px 15px -3px');
    expect(layer.offsetX).toBe('0px');
    expect(layer.offsetY).toBe('10px');
    expect(layer.blur).toBe('15px');
    expect(layer.spread).toBe('-3px');
    expect(layer.color).toBe('rgba(0, 0, 0, 0.1)');
    expect(layer.inset).toBe(false);
  });

  it('reads an authored shadow, where the colour comes last', () => {
    const [layer] = parseShadow('inset 0 2px 4px #00000033');
    expect(layer.inset).toBe(true);
    expect(layer.offsetY).toBe('2px');
    expect(layer.color).toBe('#00000033');
  });

  it('keeps every layer of a multi-layer shadow', () => {
    const layers = parseShadow('rgba(0,0,0,.1) 0 1px 2px 0, rgba(0,0,0,.06) 0 10px 15px -3px');
    expect(layers.length).toBe(2);
    expect(layers[1].blur).toBe('15px');
  });

  it('defaults the omitted blur and spread rather than shifting the colour into them', () => {
    const [layer] = parseShadow('0 2px red');
    expect(layer.blur).toBe('0px');
    expect(layer.spread).toBe('0px');
    expect(layer.color).toBe('red');
  });

  it('drops a layer that carries no offsets', () => {
    expect(parseShadow('none')).toHaveLength(0);
  });

  it('ranks elevation by the deepest layer, not the first', () => {
    expect(shadowDepth('rgba(0,0,0,.1) 0 1px 2px')).toBe(3);
    expect(shadowDepth('rgba(0,0,0,.1) 0 1px 2px, rgba(0,0,0,.06) 0 10px 15px -3px')).toBe(25);
  });
});
