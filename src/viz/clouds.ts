import fragmentSource from './clouds.frag.glsl?raw';

const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Heavy volumetric march: render at half resolution and let CSS scale the canvas up.
const RES_SCALE = 0.5;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed');
  }
  return shader;
}

/** Starts the cloud shader on a canvas. Returns false when WebGL2 is unavailable. */
export function startClouds(canvas: HTMLCanvasElement): boolean {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return false;

  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
  } catch (err) {
    console.warn('[clouds]', err);
    return false;
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(program, 'u_resolution');
  const uTime = gl.getUniformLocation(program, 'u_time');

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr * RES_SCALE));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr * RES_SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };

  // Start a little into the drift so the first frame is not the field origin.
  const t0 = 20;
  let elapsed = 0;
  let last = 0;
  let frame = 0;
  let visible = false;

  const draw = (time: number) => {
    resize();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t0 + time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const loop = (now: number) => {
    if (last) elapsed += Math.min(now - last, 100) / 1000;
    last = now;
    draw(elapsed);
    frame = requestAnimationFrame(loop);
  };

  const update = () => {
    const run = visible && !document.hidden && !reduceMotion.matches;
    if (run && !frame) {
      last = 0;
      frame = requestAnimationFrame(loop);
    } else if (!run && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    // Reduced motion: one still frame instead of the animation.
    if (visible && reduceMotion.matches) draw(elapsed);
  };

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  reduceMotion.addEventListener('change', update);
  new ResizeObserver(() => { if (!frame && visible) draw(elapsed); }).observe(canvas);
  return true;
}
