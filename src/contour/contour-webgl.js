/* MIT; contributed by higekibaka. GPU stroke painter from Endfield Glass. */
const CURVE_TOLERANCE_PX = 0.04;
const STRIDE = 6;
class StrokeSegments {
  data = new Float32Array(4096 * STRIDE);
  used = 0;
  tolerance = CURVE_TOLERANCE_PX;
  x = 0;
  y = 0;
  startX = 0;
  startY = 0;
  first = 0;
  reset() {
    this.used = 0;
    this.first = 0;
  }
  moveTo(x, y) {
    this.x = this.startX = x;
    this.y = this.startY = y;
    this.first = this.used;
  }
  lineTo(x, y) {
    if (x === this.x && y === this.y) return;
    if (this.used + STRIDE > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const i = this.used;
    this.data[i] = this.x;
    this.data[i + 1] = this.y;
    this.data[i + 2] = x;
    this.data[i + 3] = y;
    this.data[i + 4] = i === this.first ? 1 : 0;
    this.data[i + 5] = 1;
    if (i > this.first) this.data[i - 1] = 0;
    this.used += STRIDE;
    this.x = x;
    this.y = y;
  }
  closePath() {
    this.lineTo(this.startX, this.startY);
    if (this.used > this.first) {
      this.data[this.first + 4] = 0;
      this.data[this.used - 1] = 0;
    }
  }
  bezierCurveTo(ax, ay, bx, by, x, y) {
    this.cubic(this.x, this.y, ax, ay, bx, by, x, y, 0);
  }
  cubic(x0, y0, x1, y1, x2, y2, x3, y3, depth) {
    const dx = x3 - x0, dy = y3 - y0, length2 = dx * dx + dy * dy;
    const tolerance2 = this.tolerance * this.tolerance;
    const t1 = length2 > 0 ? Math.max(0, Math.min(1, ((x1 - x0) * dx + (y1 - y0) * dy) / length2)) : 0;
    const t2 = length2 > 0 ? Math.max(0, Math.min(1, ((x2 - x0) * dx + (y2 - y0) * dy) / length2)) : 0;
    const e1x = x1 - x0 - t1 * dx, e1y = y1 - y0 - t1 * dy;
    const e2x = x2 - x0 - t2 * dx, e2y = y2 - y0 - t2 * dy;
    if (e1x * e1x + e1y * e1y <= tolerance2 && e2x * e2x + e2y * e2y <= tolerance2 || depth >= 16) {
      this.lineTo(x3, y3);
      return;
    }
    const a = (x0 + x1) / 2, b = (y0 + y1) / 2, c = (x1 + x2) / 2, d = (y1 + y2) / 2;
    const e = (x2 + x3) / 2, f = (y2 + y3) / 2, g = (a + c) / 2, h = (b + d) / 2;
    const i = (c + e) / 2, j = (d + f) / 2, k = (g + i) / 2, l = (h + j) / 2;
    this.cubic(x0, y0, a, b, g, h, k, l, depth + 1);
    this.cubic(k, l, i, j, e, f, x3, y3, depth + 1);
  }
}
function parseStrokeColor(value) {
  const m = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (!m) return null;
  const values = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255, m[4] === void 0 ? 1 : Number(m[4])];
  return values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ? values : null;
}
const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec4 segment;
layout(location=1) in vec2 caps;
uniform vec2 viewportSize;
uniform vec2 scale;
uniform float width;
out vec2 local;
flat out float segmentLength;
flat out float radius;
flat out vec2 endCaps;
void main() {
  vec2 a = segment.xy * scale, b = segment.zw * scale;
  vec2 delta = b-a;
  segmentLength = max(length(delta), 0.000001);
  vec2 tangent = delta / segmentLength;
  vec2 normal = vec2(-tangent.y, tangent.x);
  radius = 0.5 * width * scale.x * scale.y * length(segment.zw-segment.xy) / segmentLength;
  float margin = radius + 1.0;
  // Two triangles per segment, generated without a second vertex buffer.
  vec2 corners[6] = vec2[6](vec2(0,-1),vec2(1,-1),vec2(0,1),vec2(0,1),vec2(1,-1),vec2(1,1));
  vec2 corner = corners[gl_VertexID];
  local = vec2(mix(-margin, segmentLength+margin, corner.x), corner.y * margin);
  vec2 pixel = a + tangent * local.x + normal * local.y;
  gl_Position = vec4(pixel.x/viewportSize.x*2.0-1.0, 1.0-pixel.y/viewportSize.y*2.0, 0, 1);
  endCaps = caps;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 local;
flat in float segmentLength;
flat in float radius;
flat in vec2 endCaps;
uniform vec4 color;
out vec4 outputColor;
void main() {
  vec2 nearest = vec2(clamp(local.x, 0.0, segmentLength), 0);
  float distance = length(local-nearest)-radius;
  if (endCaps.x > 0.5) distance = max(distance, -local.x);
  if (endCaps.y > 0.5) distance = max(distance, local.x-segmentLength);
  float coverage = clamp(0.5-distance, 0.0, 1.0);
  float alpha = color.a * coverage;
  outputColor = vec4(color.rgb * alpha, alpha);
}`;
function createWebGLContourContext(canvas, onContextLost) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false
  });
  if (!gl) return null;
  let program = null;
  let buffer = null;
  let vao = null;
  const shaders = [];
  const events = canvas;
  const lost = () => onContextLost?.();
  const releaseContext = gl.getExtension("WEBGL_lose_context");
  const release = () => {
    events.removeEventListener?.("webglcontextlost", lost);
    if (buffer) gl.deleteBuffer(buffer);
    if (vao) gl.deleteVertexArray(vao);
    if (program) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    buffer = null;
    vao = null;
    program = null;
    shaders.length = 0;
    releaseContext?.loseContext();
  };
  try {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("WebGL shader allocation failed");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Contour shader: " + gl.getShaderInfoLog(shader));
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram();
    buffer = gl.createBuffer();
    vao = gl.createVertexArray();
    if (!program || !buffer || !vao) throw new Error("WebGL allocation failed");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Contour shader link: " + gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, STRIDE * 4, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE * 4, 16);
    gl.vertexAttribDivisor(1, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DITHER);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    const viewport = gl.getUniformLocation(program, "viewportSize");
    const scaling = gl.getUniformLocation(program, "scale");
    const color = gl.getUniformLocation(program, "color");
    const width = gl.getUniformLocation(program, "width");
    const segments = new StrokeSegments();
    let sx = 1, sy = 1, capacity = 0, disposed = false;
    const context = {
      strokeStyle: "rgba(16,17,16,0.16)",
      lineWidth: 1,
      lineJoin: "round",
      setTransform(a, b, c, d, e, f) {
        if (b !== 0 || c !== 0 || e !== 0 || f !== 0 || a <= 0 || d <= 0) throw new Error("Unsupported contour transform");
        sx = a;
        sy = d;
        segments.tolerance = CURVE_TOLERANCE_PX / Math.max(sx, sy);
      },
      clearRect() {
        if (disposed || gl.isContextLost()) throw new Error("Contour WebGL context lost");
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
      beginPath: () => segments.reset(),
      moveTo: (x, y) => segments.moveTo(x, y),
      lineTo: (x, y) => segments.lineTo(x, y),
      bezierCurveTo: (a, b, c, d, e, f) => segments.bezierCurveTo(a, b, c, d, e, f),
      closePath: () => segments.closePath(),
      stroke() {
        const rgba = parseStrokeColor(context.strokeStyle);
        if (!rgba) throw new Error("Unsupported contour stroke color");
        if (segments.used === 0) {
          gl.flush();
          return;
        }
        gl.uniform2f(viewport, canvas.width, canvas.height);
        gl.uniform2f(scaling, sx, sy);
        gl.uniform4fv(color, rgba);
        gl.uniform1f(width, context.lineWidth);
        if (capacity < segments.data.byteLength) {
          capacity = segments.data.byteLength;
          gl.bufferData(gl.ARRAY_BUFFER, capacity, gl.STREAM_DRAW);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, segments.data, 0, segments.used);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, segments.used / STRIDE);
        gl.flush();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        segments.data = new Float32Array(0);
        segments.used = 0;
        release();
      }
    };
    events.addEventListener?.("webglcontextlost", lost);
    return context;
  } catch (error) {
    release();
    throw error;
  }
}
