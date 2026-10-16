import {
  Color,
  DataTexture,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Vector2,
} from 'three';

export type Materials = ReturnType<typeof makeMaterials>;

/** random normals, one per texel: under a clear coat they read as the metal flake in the paint */
function flakeNormals() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 128 + (Math.random() - 0.5) * 120;
    data[i * 4 + 1] = 128 + (Math.random() - 0.5) * 120;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  const texture = new DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(36, 36);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Grey noise for roughness (and bump): no real surface is evenly smooth. `brushed` draws it in streaks, the
 * way a machined or brushed part catches light along its grain.
 */
function grain(size: number, brushed: boolean, repeat: number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const streak = brushed ? Math.random() * 0.14 : 0;
    for (let x = 0; x < size; x++) {
      const v = Math.round(255 * (0.82 + streak + (Math.random() - 0.5) * (brushed ? 0.06 : 0.2)));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.min(255, v);
      data[i + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(brushed ? 1 : repeat, repeat);
  texture.needsUpdate = true;
  return texture;
}

export function makeMaterials(frame: string) {
  const rubberGrain = grain(128, false, 24);
  return {
    paint: new MeshPhysicalMaterial({
      color: frame,
      metalness: 0.55,
      roughness: 0.38,
      normalMap: flakeNormals(),
      normalScale: new Vector2(0.05, 0.05),
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    }),
    /** black anodised aluminium: cranks, hubs, stem, rocker */
    anodised: new MeshStandardMaterial({
      // not pure black: a dark grey with metal in it shows its shape in the studio's reflections
      color: '#2a2e31',
      metalness: 0.8,
      roughness: 0.38,
      roughnessMap: grain(256, true, 6),
    }),
    /** satin aluminium of the alloy rims: light enough to tell from carbon at a glance */
    alloy: new MeshStandardMaterial({ color: '#a3aaae', metalness: 0.9, roughness: 0.32 }),
    /** gloss carbon of the carbon bar and rims: near black under a clear coat */
    carbon: new MeshPhysicalMaterial({
      color: '#0e1011',
      metalness: 0.1,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    }),
    /** matte composite of the motor and battery shells */
    shell: new MeshStandardMaterial({ color: '#202427', metalness: 0.2, roughness: 0.62 }),
    rubber: new MeshStandardMaterial({ color: '#111213', metalness: 0, roughness: 0.92 }),
    /** tyre compound: a touch lighter than grips and hoses, with a fine grain that breaks up the highlights */
    tyre: new MeshStandardMaterial({
      color: '#18191a',
      metalness: 0,
      roughness: 0.95,
      roughnessMap: rubberGrain,
      bumpMap: rubberGrain,
      bumpScale: 0.4,
    }),
    steel: new MeshStandardMaterial({ color: '#d4d8da', metalness: 1, roughness: 0.2 }),
    /** gold-coated fork stanchions and shock shaft */
    kashima: new MeshStandardMaterial({ color: '#c99a3c', metalness: 1, roughness: 0.24 }),
    rotor: new MeshStandardMaterial({
      color: '#b7bcbf',
      metalness: 1,
      roughness: 0.36,
      roughnessMap: grain(256, true, 1),
    }),
    spring: new MeshStandardMaterial({ color: '#f2c230', metalness: 0.35, roughness: 0.35 }),
    leather: new MeshStandardMaterial({ color: '#141617', metalness: 0, roughness: 0.55 }),
    led: new MeshStandardMaterial({
      color: '#ffffff',
      emissive: new Color('#b8f2c8'),
      emissiveIntensity: 3,
      toneMapped: false,
    }),
    lamp: new MeshStandardMaterial({
      color: '#ffffff',
      emissive: new Color('#fff3dc'),
      emissiveIntensity: 6,
      toneMapped: false,
    }),
  };
}

/** releases the materials and the textures they made for themselves */
export function disposeMaterials(m: Materials) {
  const textures = new Set(
    Object.values(m).flatMap((mat) =>
      [mat.normalMap, mat.roughnessMap, mat.bumpMap].filter((t) => t !== null),
    ),
  );
  textures.forEach((t) => t.dispose());
  Object.values(m).forEach((mat) => mat.dispose());
}
