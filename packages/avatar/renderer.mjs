import { CubismFramework } from './vendor/sdk/live2dcubismframework.js';
import { CubismUserModel } from './vendor/sdk/model/cubismusermodel.js';
import { CubismMatrix44 } from './vendor/sdk/math/cubismmatrix44.js';
import { CubismPhysics } from './vendor/sdk/physics/cubismphysics.js';
import { CubismShaderManager_WebGL } from './vendor/sdk/rendering/cubismshader_webgl.js';
import { AvatarDriver, adaptParameters, PARAM_MODES } from './driver.mjs';

const SHADERS = ['vertshadersrc.vert', 'vertshadersrcmasked.vert', 'vertshadersrcsetupmask.vert', 'fragshadersrcsetupmask.frag', 'fragshadersrcpremultipliedalpha.frag', 'fragshadersrcmaskpremultipliedalpha.frag', 'fragshadersrcmaskinvertedpremultipliedalpha.frag', 'vertshadersrccopy.vert', 'fragshadersrccopy.frag', 'fragshadersrccolorblend.frag', 'fragshadersrcalphablend.frag', 'vertshadersrcblend.vert', 'fragshadersrcpremultipliedalphablend.frag'];
export class AvatarRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.driver = new AvatarDriver(); this.abort = new AbortController(); this.entries = new Map();
    this.textures = []; this.ready = false; this.disposed = false; this.frames = 0; this.last = 0;
    this.mask = document.createElement('canvas'); this.mask.width = 144; this.mask.height = 192;
    this.maskContext = this.mask.getContext('2d', { willReadFrequently: true }); this.nonTransparentPixels = 0;
  }
  check() { this.abort.signal.throwIfAborted(); if (this.disposed) throw Error('角色已释放'); }
  async fetch(relative, format = 'json') {
    this.check(); const url = new URL(relative, location.href);
    if (url.protocol !== location.protocol || url.host !== location.host) throw Error('资源地址无效');
    const response = await fetch(url, { signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(15000)]), cache: 'no-store' });
    if (!response.ok) throw Error('角色资源读取失败');
    const value = await response[format](); this.check(); return value;
  }
  async load() {
    try {
      const gl = this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
      if (!gl || !globalThis.Live2DCubismCore || !CubismFramework.startUp()) throw Error('WebGL 或 Cubism 未就绪');
      if (!CubismFramework.isInitialized()) CubismFramework.initialize();
      const settings = await this.fetch('/model/entry.json');
      this.userModel = new CubismUserModel(); this.userModel.loadModel(await this.fetch(settings.FileReferences.Moc, 'arrayBuffer'), true);
      this.model = this.userModel.getModel(); if (!this.model) throw Error('模型加载失败');
      for (let index = 0; index < this.model.getParameterCount(); index++) {
        const handle = this.model.getParameterId(index), id = handle.getString();
        this.entries.set(id, { handle, min: this.model.getParameterMinimumValue(index), max: this.model.getParameterMaximumValue(index), default: this.model.getParameterDefaultValue(index) });
      }
      if (settings.FileReferences.Physics) {
        const data = await this.fetch(settings.FileReferences.Physics, 'arrayBuffer'); this.physics = CubismPhysics.create(data, data.byteLength);
      }
      this.model.saveParameters(); this.resize(); this.userModel.createRenderer(this.canvas.width, this.canvas.height);
      this.renderer = this.userModel.getRenderer(); this.renderer.startUp(gl); this.renderer.setIsPremultipliedAlpha(true);
      for (const [index, file] of settings.FileReferences.Textures.entries()) {
        const bitmap = await createImageBitmap(await this.fetch(file, 'blob'), { premultiplyAlpha: 'none' });
        try {
          this.check(); const texture = gl.createTexture(); if (!texture) throw Error('纹理分配失败'); this.textures.push(texture);
          const image = document.createElement('canvas'); image.width = bitmap.width; image.height = bitmap.height; image.getContext('2d').drawImage(bitmap, 0, 0);
          gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          this.renderer.bindTexture(index, texture);
        } finally { bitmap.close(); }
      }
      const shaderPath = new URL('/vendor/Framework/Shaders/WebGL/', location.href).href;
      const sources = new Map(await Promise.all(SHADERS.map(async file => [shaderPath + file, await this.fetch(shaderPath + file, 'text')])));
      const shader = CubismShaderManager_WebGL.getInstance().getShader(gl);
      shader.loadShader = async url => { if (!sources.has(url)) throw Error('未知着色器'); return sources.get(url); };
      this.renderer.loadShaders(shaderPath); await new Promise(resolve => setTimeout(resolve, 0)); this.check();
      if (!shader._isShaderLoaded || !shader._shaderSets[1]?.shaderProgram
          || shader._shaderSets.some(item => item.shaderProgram !== undefined && (!item.shaderProgram || !gl.getProgramParameter(item.shaderProgram, gl.LINK_STATUS)))) throw Error('着色器加载失败');
      this.ready = true; this.render(performance.now(), true);
      if (!this.nonTransparentPixels) throw Error('模型未产生可见像素');
      return this;
    } catch (error) { this.dispose(); throw error; }
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; this.userModel?.setRenderTargetSize(width, height); }
  }
  render(now, force = false) {
    if (!this.ready || this.disposed || this.gl.isContextLost()) return;
    if (!force && now - this.last < 1000 / 30 - 1) return;
    const dt = this.last ? Math.min(0.05, Math.max(0, (now - this.last) / 1000)) : 0; this.last = now; this.resize();
    this.values = adaptParameters(this.driver.update(dt), this.entries);
    this.model.loadParameters();
    for (const [id, value] of Object.entries(this.values)) this.model.setParameterValueById(this.entries.get(id).handle, value);
    this.physics?.evaluate(this.model, dt); this.model.update();
    const gl = this.gl, width = this.canvas.width, height = this.canvas.height;
    const fit = Math.min(1.88 / this.model.getCanvasHeight(), 1.88 * width / height / this.model.getCanvasWidth());
    const matrix = new CubismMatrix44(); matrix.scale(fit * height / width, fit);
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.renderer.setMvpMatrix(matrix); this.renderer.setRenderState(null, [0, 0, width, height]); this.renderer.drawModel(); this.frames++;
    if (force || !this.lastMask || now - this.lastMask > 150) {
      this.maskContext.clearRect(0, 0, 144, 192); this.maskContext.drawImage(this.canvas, 0, 0, 144, 192);
      const pixels = this.maskContext.getImageData(0, 0, 144, 192).data;
      this.nonTransparentPixels = 0; for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 16) this.nonTransparentPixels++;
      this.lastMask = now;
    }
  }
  stats() {
    return { ready: this.ready, disposed: this.disposed, frames: this.frames, parameterCount: this.entries.size,
      textureCount: this.textures.length, controlledIds: Object.keys(PARAM_MODES).filter(id => this.entries.has(id)),
      missingIds: Object.keys(PARAM_MODES).filter(id => !this.entries.has(id)), physicsLoaded: !!this.physics,
      nonTransparentPixels: this.nonTransparentPixels, values: this.values || {}, state: this.driver.state, paused: this.driver.paused,
      audioLevel: this.driver.audioLevel, mouthLevel: this.driver.mouth,
      mouthRange: this.entries.has('ParamMouthOpenY') ? { min: this.entries.get('ParamMouthOpenY').min, max: this.entries.get('ParamMouthOpenY').max } : null };
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.ready = false; this.abort.abort();
    try { CubismPhysics.delete(this.physics); this.physics = null; this.userModel?.release(); }
    finally {
      for (const texture of this.textures) this.gl?.deleteTexture(texture);
      this.textures = []; this.model = null; this.userModel = null; this.renderer = null;
      if (CubismFramework.isInitialized()) CubismFramework.dispose();
    }
  }
}
