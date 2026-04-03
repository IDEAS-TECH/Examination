/**
 * swimmingpool.js - ADVANCED ARCHITECTURAL WATER
 * Features: Gerstner Swells, Fresnel Optics, and Procedural Caustics.
 */

AFRAME.registerComponent('pool-water', {
  schema: {
    width: { type: 'number', default: 10 },
    depth: { type: 'number', default: 16 },
    color: { type: 'color', default: '#a2eefd' },
    deepColor: { type: 'color', default: '#3ebed7' },
    opacity: { type: 'number', default: 0.85 },
    waveScale: { type: 'number', default: 0.04 },
    speed: { type: 'number', default: 0.5 }
  },

  init: function () {
    this.time = 0;
    this.setupMesh();
  },

  setupMesh: function () {
    const data = this.data;
    // Water surface sized to match pool dimensions
    const geometry = new THREE.PlaneGeometry(data.width, data.depth, 128, 128);
    geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(data.color) },
        uDeepColor: { value: new THREE.Color(data.deepColor) },
        uOpacity: { value: data.opacity },
        uWaveScale: { value: data.waveScale },
        uSpeed: { value: data.speed },
        uCameraPos: { value: new THREE.Vector3() }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;
        uniform float uWaveScale;
        uniform float uSpeed;

        // Gerstner Wave Math: Creates the "rolling" liquid effect
        vec3 Gerstner(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
          float k = 2.0 * 3.14159 / wave.w;
          float c = sqrt(9.8 / k);
          vec2 d = normalize(wave.xy);
          float f = k * (dot(d, p.xz) - c * uTime * uSpeed);
          float a = uWaveScale / k;

          tangent += vec3(-d.x * d.x * (uWaveScale * sin(f)), d.x * (uWaveScale * cos(f)), -d.x * d.y * (uWaveScale * sin(f)));
          binormal += vec3(-d.x * d.y * (uWaveScale * sin(f)), d.y * (uWaveScale * cos(f)), -d.y * d.y * (uWaveScale * sin(f)));
          return vec3(d.x * (a * cos(f)), a * sin(f), d.y * (a * cos(f)));
        }

        void main() {
          vUv = uv;
          vec3 p = position;
          vec3 tangent = vec3(1, 0, 0);
          vec3 binormal = vec3(0, 0, 1);

          p += Gerstner(vec4(1.0, 0.5, 0.5, 8.0), position, tangent, binormal);
          p += Gerstner(vec4(-0.5, 1.2, 0.5, 12.0), position, tangent, binormal);
          p += Gerstner(vec4(0.2, -0.8, 0.5, 10.0), position, tangent, binormal);

          vNormal = normalize(cross(binormal, tangent));
          vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform vec3 uColor;
        uniform vec3 uDeepColor;
        uniform float uOpacity;
        uniform float uTime;
        uniform vec3 uCameraPos;

        void main() {
          vec3 viewDir = normalize(uCameraPos - vWorldPos);

          float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);

          vec3 sunDir = normalize(vec3(5.0, 10.0, 2.0));
          float spec = pow(max(dot(vNormal, sunDir), 0.0), 128.0);

          float caustic = sin(vUv.x * 30.0 + uTime * 0.5) * cos(vUv.y * 30.0 - uTime * 0.5) * 0.1;

          vec3 finalColor = mix(uColor, uDeepColor, 0.2);
          gl_FragColor = vec4(finalColor + (spec * 0.8) + (fresnel * 0.3) + caustic, uOpacity + (fresnel * 0.2));
        }
      `
    });

    this.el.setObject3D('mesh', new THREE.Mesh(geometry, this.material));
  },

  tick: function (t, dt) {
    if (!this.material) return;
    this.time += dt * 0.001;
    this.material.uniforms.uTime.value = this.time;

    const cam = this.el.sceneEl.camera;
    if (cam) {
        cam.getWorldPosition(this.material.uniforms.uCameraPos.value);
    }
  }
});

/**
 * POOL BASIN COMPONENT
 * Handles the architectural structure of the pool.
 * Supports invisible basin for overlaying on static pool models.
 */
AFRAME.registerComponent('pool-basin', {
  schema: {
    width: { type: 'number', default: 10 },
    depth: { type: 'number', default: 16 },
    height: { type: 'number', default: 3 },
    wallHeight: { type: 'number', default: 3.0 },
    wallThick: { type: 'number', default: 0.25 },
    waterLevel: { type: 'number', default: 0.85 },
    tileColor: { type: 'color', default: '#c2dde8' },
    groutColor: { type: 'color', default: '#7ab8d4' },
    coping: { type: 'color', default: '#e8e2d4' },
    waterColor: { type: 'color', default: '#1ab5e8' },
    deepColor: { type: 'color', default: '#0a4a7a' }
  },

  init: function () {
    const data = this.data;
    const { width: w, depth: d } = this.data;
    const wallHeight = data.wallHeight || 0.01;
    const wallThick = data.wallThick || 0.01;

    // Check if colors are transparent (hex with alpha 00)
    const isTileTransparent = data.tileColor && data.tileColor.length === 9 && data.tileColor.slice(-2) === '00';
    const isInvisible = isTileTransparent;

    // 1. Interior Basin - invisible if tileColor is transparent
    const basin = document.createElement('a-entity');

    // Floor (invisible)
    this.createPart(basin, `0 ${-wallHeight/2} 0`, `${w} 0.01 ${d}`, data.tileColor || '#ffffff', isInvisible);
    // Walls (invisible)
    this.createPart(basin, `0 0 ${-d/2}`, `${w} ${wallHeight} ${wallThick}`, data.groutColor || '#f0f0f0', isInvisible);
    this.createPart(basin, `0 0 ${d/2}`, `${w} ${wallHeight} ${wallThick}`, data.groutColor || '#f0f0f0', isInvisible);
    this.createPart(basin, `${-w/2} 0 0`, `${wallThick} ${wallHeight} ${d}`, data.groutColor || '#f0f0f0', isInvisible);
    this.createPart(basin, `${w/2} 0 0`, `${wallThick} ${wallHeight} ${d}`, data.groutColor || '#f0f0f0', isInvisible);

    this.el.appendChild(basin);

    // 2. Coping (invisible if coping is transparent)
    const rim = 0.5;
    this.createPart(this.el, `0 ${wallHeight/2} ${d/2 + rim/2}`, `${w + rim*2} 0.2 ${rim}`, data.coping || '#e0e0e0', isInvisible);
    this.createPart(this.el, `0 ${wallHeight/2} ${-d/2 - rim/2}`, `${w + rim*2} 0.2 ${rim}`, data.coping || '#e0e0e0', isInvisible);
    this.createPart(this.el, `${w/2 + rim/2} ${wallHeight/2} 0`, `${rim} 0.2 ${d}`, data.coping || '#e0e0e0', isInvisible);
    this.createPart(this.el, `${-w/2 - rim/2} ${wallHeight/2} 0`, `${rim} 0.2 ${d}`, data.coping || '#e0e0e0', isInvisible);

    // 3. The Water Component - full size water surface
    const water = document.createElement('a-entity');
    water.setAttribute('pool-water', {
      width: w,
      depth: d,
      color: data.waterColor || '#1ab5e8',
      deepColor: data.deepColor || '#0a4a7a',
      opacity: 0.85
    });
    water.setAttribute('position', `0 ${wallHeight * data.waterLevel} 0`);
    this.el.appendChild(water);
  },

  createPart: function (parent, pos, scale, color, invisible = false) {
    const ent = document.createElement('a-box');
    ent.setAttribute('position', pos);
    const s = scale.split(' ');
    ent.setAttribute('width', s[0]);
    ent.setAttribute('height', s[1]);
    ent.setAttribute('depth', s[2]);
    if (invisible) {
      ent.setAttribute('material', 'visible: false');
    } else {
      ent.setAttribute('material', `color: ${color}; roughness: 0.2; metalness: 0.1`);
    }
    parent.appendChild(ent);
  }
});
