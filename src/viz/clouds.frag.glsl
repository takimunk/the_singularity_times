#version 300 es
// Cloud deck at dusk by Freeborn (@Freeeborn), https://x.com/Freeeborn/status/2113362205664215067
// Adapted for The Singularity Times issue #0: the aerobatic flight model, head motion, buffet and
// grey-out are removed. The camera is fixed high above the deck and the cloud field drifts past
// it with the wind. HDR output is off (WebGL2 presents SDR).
//
// From the original:
// FIELD version: one continuous cloud deck instead of separate columns. Almost every cell
// holds a heap, all heaps are about half as tall.
//
// Full RGB light transport instead of the photo palette: grey scattering plus a separate
// absorption coefficient per RGB channel (blue largest), so light that travels deeper into a
// cloud loses blue first; low warm sun, dusk-blue sky light, orange-to-blue sky.
//
// Shape: one low cumulus heap per jittered 2D cell, wide at the base and narrowing upward, so
// neighbours merge into a continuous deck with domes; big and medium cauliflower lobes from
// hemispherical caps sqrt(1 - F1^2/R^2) around Worley feature points; fine lumps from
// billowed gradient noise (|n| octaves: rounded bumps, creases at zero crossings) pushing
// the surface in and out, faded out below ~2 px and drifting upward so the detail boils.
// Volume: density fades in over SOFT units inside that surface: translucent edges, but thin
// enough that the fine lumps stay crisp and shade each other.
// Light: sun shadow march (first steps at full detail) with multiple-scattering octaves,
// sky ambient from a short upward occlusion march, dual-lobe phase for the silver lining,
// exponential distance haze toward the sky colour. Linear RGB light; the brightest channel
// is tonemapped to a shoulder and the others scaled with it (hue-preserving).
//
// Standing on the shoulders of:
//   Pierre Bouguer, Johann Heinrich Lambert, August Beer - exponential attenuation of light
//   Lord Rayleigh - 1/lambda^4 scattering: the blue sky and the red low sun (SUN_COL)
//   Gustav Mie - forward scattering by droplets, approximated by the Henyey-Greenstein
//     phase function hg() (Louis Henyey & Jesse Greenstein)
//   Luke Howard - who named the clouds in 1802
//   Ken Perlin - gradient noise and the quintic fade (gnoise, bumps)
//   Steven Worley - cellular noise (worley2, the cauliflower lobes)
//   Inigo Quilez - the smooth minimum smin() and the octave rotation matrix ROT (his code,
//     marked below), and the culture of raymarched shapes on Shadertoy
//   John C. Hart - sphere tracing (the empty-space steps)
//   Magnus Wrenninge and colleagues - multiple scattering as softer octaves (the MS terms)
//   Andrew Schneider - real-time volumetric cloudscapes (Nubis)
//   Jorge Jimenez - interleaved gradient noise (the step jitter)
//   Dave Hoskins - "Hash without Sine" (hash33, MIT)
//   Xor - who asked for puffy clouds, and built FragCoord

precision highp float;
precision highp int;   // default mediump int can be 16-bit on mobile GPUs, which breaks the hash

uniform vec2 u_resolution;
uniform float u_time;
out vec4 fragColor;

#define CELL 4.0
#define TOP 10.5
#define BASE -4.0
#define SIGMA 12.0      // extinction at full density
#define SOFT 0.15       // depth over which density fades in below the surface
#define FOG 0.025
#define EXPOSURE 1.0
#define AMB 0.8         // sky ambient scale
#define MS 0.25         // multiple-scattering scale
#define SUNK 2.2        // direct + scattered sun gain
#define HDR_PEAK 1.0    // SDR canvas

#define AIRMASS 20.0    // air path to a sun ~1 deg above the horizon, in zenith air masses
const vec3 SUN_COL = 2.2 * exp(-vec3(0.04, 0.10, 0.23) * AIRMASS);   // ~ (1.0, 0.30, 0.02)
const vec3 SKY_AMB = vec3(0.25, 0.38, 0.85);   // blue sky light from above: lights the shadowed sides
const vec3 ABSORB = vec3(0.02, 0.12, 0.30);    // absorption per channel, as a fraction of SIGMA
#define MAX_OCT 3.0     // Worley lobe octaves (big/medium); fine detail comes from BUMP noise
#define COVER 0.85      // share of cells holding a heap: high, so heaps merge into a deck
#define BUMP 0.9        // fine billow lumps

// Static camera: high above the deck, looking toward the low sun and slightly down.
#define FOCAL 1.1
const vec3 CAM_POS = vec3(0.0, 8.0, 0.0);
const vec3 CAM_TARGET = vec3(-6.0, 2.5, 14.0);
const vec2 WIND = vec2(0.35, -0.12);   // units/s the field drifts past the camera (x, z)

const float RELIEF[6] = float[6](1.0, 1.3, 1.0, 0.75, 0.6, 0.5);
// Inigo Quilez, https://iquilezles.org
const mat3 ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

const vec3 SUN = vec3(-0.75, 0.02, 1.0);    // ~1 deg above the horizon

// "Hash without Sine" by Dave Hoskins, MIT License, https://www.shadertoy.com/embed/4djSRW
vec3 hash33(ivec3 c) {
    vec3 p = fract(vec3(c) * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}

float grad(ivec3 c, vec3 r) {
    return dot(hash33(c) * 2.0 - 1.0, r);
}

float gnoise(vec3 p) {
    ivec3 i = ivec3(floor(p));
    vec3 f = fract(p);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(grad(i, f), grad(i + ivec3(1, 0, 0), f - vec3(1, 0, 0)), u.x),
                   mix(grad(i + ivec3(0, 1, 0), f - vec3(0, 1, 0)), grad(i + ivec3(1, 1, 0), f - vec3(1, 1, 0)), u.x), u.y),
               mix(mix(grad(i + ivec3(0, 0, 1), f - vec3(0, 0, 1)), grad(i + ivec3(1, 0, 1), f - vec3(1, 0, 1)), u.x),
                   mix(grad(i + ivec3(0, 1, 1), f - vec3(0, 1, 1)), grad(i + ivec3(1, 1, 1), f - vec3(1, 1, 1)), u.x), u.y), u.z);
}

// Inigo Quilez, https://iquilezles.org
float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

float worley2(vec3 p) {
    ivec3 i = ivec3(floor(p));
    vec3 f = fract(p);
    ivec3 n = ivec3(step(vec3(0.5), f)) * 2 - 1;
    float m = 9.0;
    for (int z = 0; z < 2; z++) {
        for (int y = 0; y < 2; y++) {
            for (int x = 0; x < 2; x++) {
                ivec3 o = ivec3(x, y, z) * n;
                vec3 r = vec3(o) + 0.15 + 0.7 * hash33(i + o) - f;
                m = min(m, dot(r, r));
            }
        }
    }
    return m;
}

float heaps(vec3 p) {
    ivec2 cell = ivec2(floor(p.xz / CELL));
    float d = 1e3;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            ivec3 c = ivec3(cell.x + i, 0, cell.y + j);
            vec3 h = hash33(c);
            if (h.z >= COVER) continue;
            vec3 g = hash33(c + ivec3(0, 1, 0));
            float r = CELL * (0.24 + 0.16 * g.x);
            float top = 2.0 * g.y;
            vec2 ctr = (vec2(c.xz) + 0.3 + 0.4 * h.xy) * CELL;
            vec3 q = p - vec3(ctr.x, 0.0, ctr.y);
            float y = clamp(q.y, BASE, top);
            float rad = r * (0.65 + 1.2 * (1.0 - smoothstep(top - 3.0, top, y)));
            float lo = 0.7 * (length(vec2(max(length(q.xz) - 0.5 * r, 0.0), q.y - y)) - rad);
            if (lo >= d + 0.2 * CELL) continue;
            vec2 wob = vec2(sin(y * 0.7 + 6.28 * g.z), cos(y * 0.6 + 6.28 * h.x)) * 0.35 * r;
            float tower = (length(q - vec3(wob.x, y, wob.y)) - rad) * 0.7;
            d = smin(d, tower, 0.2 * CELL);
        }
    }
    return d;
}

float lobes(vec3 p, float d, float lod) {
    vec3 q = p;
    float fr = 0.5;
    float fine = 0.35 + 0.65 * smoothstep(-5.0, 3.0, p.y);
    for (int o = 0; o < 6; o++) {
        float wgt = clamp(lod - float(o), 0.0, 1.0);
        if (wgt <= 0.0) break;
        float x = max(1.0 - worley2(q * fr) / 0.36, 0.0);
        float h = 0.6 / fr * RELIEF[o] * (o == 0 ? 1.0 : fine) * wgt;
        d -= h * x / sqrt(x + 0.04) * clamp(1.0 - d / (1.5 * h), 0.0, 1.0);
        q = ROT * q + 3.1;
        fr *= 2.1;
    }
    return d;
}

float lobesTail(vec3 p, float d, float lod) {
    vec3 q = ROT * (ROT * p + 3.1) + 3.1;
    float fr = 0.5 * 2.1 * 2.1;
    float fine = 0.35 + 0.65 * smoothstep(-5.0, 3.0, p.y);
    for (int o = 2; o < 6; o++) {
        float wgt = clamp(lod - float(o), 0.0, 1.0);
        if (wgt <= 0.0) break;
        float x = max(1.0 - worley2(q * fr) / 0.36, 0.0);
        float h = 0.6 / fr * RELIEF[o] * fine * wgt;
        d -= h * x / sqrt(x + 0.04) * clamp(1.0 - d / (1.5 * h), 0.0, 1.0);
        q = ROT * q + 3.1;
        fr *= 2.1;
    }
    return d;
}

float cloud(vec3 p, float lod) {
    float d = heaps(p);
    if (d > 2.0) return max(d, BASE - p.y);
    return max(lobes(p, d, lod), BASE - p.y);
}

float puff(float d) {
    return smoothstep(0.0, SOFT, -d);
}

float puffL(float d, float w) {
    return smoothstep(-0.3 * w, w, -d);
}

float bumps(vec3 p, float oct) {
    p = p * 3.0 + vec3(0.0, -0.1 * u_time, 0.0);
    float n = 0.0, a = 1.0;
    for (int o = 0; o < 4; o++) {
        float w = clamp(oct - float(o), 0.0, 1.0);
        if (w <= 0.0) break;
        n += a * w * abs(gnoise(p));
        p = ROT * p * 2.03;
        a *= 0.5;
    }
    return BUMP * (n - 0.28);
}

float sunDepth(vec3 p, vec3 L, float lod) {
    float od = 0.0, s = 0.08;
    for (int k = 0; k < 6; k++) {
        p += L * s;
        float l = 1.0;
        if (k < 3) l = 2.0;
        if (k == 0) l = min(lod, 4.0);
        float d = cloud(p, l);
        if (k < 2 && d < 0.45) d -= bumps(p, 2.0);
        od += puffL(d, SOFT * (1.0 + 2.0 * float(k))) * s;
        s *= 1.6;
    }
    return od;
}

float skyDepth(vec3 p) {
    return puffL(cloud(p + vec3(0.0, 0.5, 0.0), 2.0), 0.8) * 0.6
         + puffL(cloud(p + vec3(0.0, 1.5, 0.0), 1.0), 0.8) * 1.0;
}

float hg(float c, float g) {
    return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
}

vec3 linearToSrgb(vec3 c) {
    return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

vec3 skyCol(vec3 rd, vec3 L) {
    float c = max(dot(rd, L), 0.0);
    vec3 col = mix(vec3(0.38, 0.50, 0.80), vec3(0.08, 0.16, 0.45), smoothstep(0.0, 0.5, rd.y));
    float side = max(dot(normalize(rd.xz + 1e-6), normalize(L.xz)), 0.0);
    col = mix(col, vec3(1.0, 0.40, 0.15), side * side * exp(-8.0 * max(rd.y, 0.0)));
    col = mix(vec3(0.26, 0.26, 0.42), col, smoothstep(-0.2, 0.0, rd.y));
    return col + SUN_COL * (0.5 * pow(c, 4.0) + 2.5 * pow(c, 48.0));
}

float interiorNoise(vec3 p, float t, float px) {
    vec3 q = p * 4.0 + vec3(0.3 * u_time, -0.15 * u_time, 0.0);
    float oct = clamp(log2(0.25 / (2.0 * px * max(t, 0.05))) / 1.02 + 1.0, 1.0, 5.0);
    float n = 0.0, a = 1.0, wsum = 0.0;
    for (int o = 0; o < 6; o++) {
        float w = clamp(oct - float(o), 0.0, 1.0);
        if (w <= 0.0) break;
        n += a * w * abs(gnoise(q));
        wsum += a * w;
        q = ROT * q * 2.03;
        a *= 0.75;
    }
    return clamp(n / max(wsum, 1e-3) * 2.2, 0.0, 1.0);
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = (fragCoord - 0.5 * u_resolution.xy) / u_resolution.y;
    vec3 L = normalize(SUN);

    // Fixed camera; the world slides under it, so clouds pass instead of the camera moving.
    vec3 fw = normalize(CAM_TARGET - CAM_POS);
    vec3 rtb = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 upb = cross(fw, rtb);
    vec3 rd = normalize(uv.x * rtb + uv.y * upb + FOCAL * fw);
    vec3 ro = CAM_POS + vec3(WIND.x * u_time, 0.0, WIND.y * u_time);

    float ph = mix(hg(dot(rd, L), -0.2), hg(dot(rd, L), 0.6), 0.3);
    vec3 haze = skyCol(rd, L);
    vec3 sigT = SIGMA * (1.0 + ABSORB);
    vec3 albedo = 1.0 / (1.0 + ABSORB);
    float tEnd = 120.0;
    if (rd.y > 1e-4) tEnd = min(tEnd, (TOP - ro.y) / rd.y);
    if (rd.y < -1e-4) tEnd = min(tEnd, (BASE - ro.y) / rd.y);
    float t = 0.0;
    vec3 T = vec3(1.0), S = vec3(0.0);
    float jit = fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
    float px = 1.0 / (u_resolution.y * FOCAL);
    for (int i = 0; i < 500 && t < tEnd && T.r > 0.03; i++) {
        float dt = 0.03 + 0.003 * t;
        vec3 p = ro + rd * (t + jit * dt);
        float hd = heaps(p);
        if (hd > 2.0) {
            vec2 f = mod(p.xz, CELL);
            float edge = min(min(f.x, CELL - f.x), min(f.y, CELL - f.y));
            t += max(min(hd - 1.9, edge + CELL - 3.9), dt);
            continue;
        }
        float d2 = lobes(p, hd, 2.0);
        float dc = d2 - 0.25;
        if (dc > 0.0) {
            t += max(dc * 0.5, dt);
            continue;
        }
        float lod = clamp(log2(0.6 / (px * max(t, 0.1))) / 1.07 + 1.0, 2.0, MAX_OCT);
        float d = lobesTail(p, d2, lod);
        if (d > 0.45) {
            t += max((d - 0.45) * 0.5, dt);
            continue;
        }
        float foct = clamp(log2(0.33 / (2.0 * px * max(t, 0.1))) + 1.0, 1.0, 4.0);
        d -= bumps(p, foct);
        d = max(d, BASE - p.y);
        float dens = puff(d) * smoothstep(0.0, 0.08, t);
        float depthIn = smoothstep(SOFT, 0.7, -d);
        float lightK = 1.0;
        if (depthIn > 0.0) {
            float near = 1.0 - smoothstep(3.0, 4.0, t);
            float dmod = 0.096, lk = 1.23;
            if (near > 0.0) {
                float n0 = interiorNoise(p, t, px);
                float n1 = interiorNoise(p + L * 0.05, t, px);
                float f = smoothstep(0.48, 0.58, n0);
                float face = clamp(0.5 + (n0 - n1) * 12.0, 0.0, 1.0);
                dmod = mix(dmod, 0.03 + 0.97 * f, near);
                lk = mix(lk, (0.45 + 1.1 * face) * (1.3 - 0.5 * f), near);
            }
            dens *= mix(1.0, dmod, depthIn);
            lightK = mix(1.0, lk, depthIn);
        }
        if (dens <= 0.0) {
            t += dt;
            continue;
        }
        float od = sunDepth(p, L, lod);
        vec3 sigMS = SIGMA * (1.0 + 0.3 * ABSORB);
        vec3 sun = exp(-sigT * od) * ph
                 + MS * 1.4 * (0.5 * exp(-0.25 * sigMS * od) + 0.25 * exp(-0.06 * sigMS * od)) * mix(ph, 1.0, 0.6);
        float hy = smoothstep(-4.0, 8.0, p.y);
        vec3 amb = AMB * SKY_AMB * (0.1 + 0.25 * hy) * exp(-1.5 * skyDepth(p));
        vec3 lum = mix((SUNK * SUN_COL * sun + amb) * lightK, haze, 1.0 - exp(-FOG * max(t - 8.0, 0.0)));
        vec3 tr = exp(-sigT * dens * dt);
        S += T * albedo * (1.0 - tr) * lum;
        T *= tr;
        t += dt;
    }
    vec3 l = S + T * haze;
    float peak = HDR_PEAK;
    float m = max(max(l.r, l.g), max(l.b, 1e-6));
    vec3 Y = l * (peak * (1.0 - exp(-EXPOSURE * m / peak)) / m);
    fragColor = vec4(linearToSrgb(Y) + (jit - 0.5) / 255.0, 1.0);
}
