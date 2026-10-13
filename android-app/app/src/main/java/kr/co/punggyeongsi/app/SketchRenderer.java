package kr.co.punggyeongsi.app;

import java.util.concurrent.CancellationException;

/** Pixel-only renderer shared by the Android app and the desktop verification harness. */
public final class SketchRenderer {
    public enum Style { PENCIL, WATERCOLOR }

    private SketchRenderer() {}

    public static int[] render(int[] original, int width, int height, Style style, int colorPercent) {
        if (width < 1 || height < 1 || (long) width * height != original.length) {
            throw new IllegalArgumentException("Invalid image dimensions");
        }
        checkCancelled();
        if (style == null) throw new IllegalArgumentException("Sketch style is required");
        boolean pencil = style == Style.PENCIL || colorPercent <= 0;
        float colorStrength = clamp(colorPercent, 0, 100) / 100f;
        int[] colors = softenColors(flattenTransparency(original), width, height, pencil ? 2 : 4);
        int[] gray = new int[original.length];
        for (int i = 0; i < colors.length; i++) gray[i] = luminance(colors[i]);

        int[] horizontal = new int[gray.length];
        int[] blurred = new int[gray.length];
        boxBlur(gray, horizontal, blurred, width, height,
                Math.max(3, Math.min(14, Math.min(width, height) / 65)));
        int[] output = new int[original.length];
        float borderWidth = Math.max(1f, Math.min(width, height) * 0.035f);
        float strokeScale = Math.max(0.65f, Math.min(width, height) / 700f);
        int[] lifted = new int[256];
        for (int i = 0; i < lifted.length; i++) {
            lifted[i] = Math.round(255f * (float) Math.pow(i / 255f, 0.72));
        }

        for (int y = 0; y < height; y++) {
            if ((y & 31) == 0) checkCancelled();
            for (int x = 0; x < width; x++) {
                int i = y * width + x;
                int tone = gray[i];
                float shadow = 1f - tone / 255f;
                float dodge = Math.min(1f, tone / (float) Math.max(1, blurred[i]));
                float edge = contour(gray, x, y, width, height);
                float line = Math.min(0.75f, (1f - dodge) * 0.82f + edge * 0.26f);

                float grain = noise(x, y);
                float fibre = noise(x / 3, y / 2);
                float paper = grain * 1.8f + fibre * 0.8f;
                float hatch = hatch(x / strokeScale, y / strokeScale, shadow);
                float border = smoothstep(Math.min(
                        Math.min(x, width - 1 - x), Math.min(y, height - 1 - y)) / borderWidth);
                int red;
                int green;
                int blue;
                if (pencil) {
                    float graphite = Math.min(0.83f,
                            line * 0.90f + shadow * shadow * 0.35f + hatch * 0.10f);
                    int value = clamp255(Math.round(250f - graphite * 235f + paper));
                    value = clamp255(Math.round(250f + (value - 250f) * border));
                    red = value;
                    green = value;
                    blue = value;
                } else {
                    int rgb = colors[i];
                    int lr = lifted[red(rgb)];
                    int lg = lifted[green(rgb)];
                    int lb = lifted[blue(rgb)];
                    float neutral = (77 * lr + 150 * lg + 29 * lb) / 256f;
                    float wash = colorStrength * (0.82f + pigmentNoise(x, y) * 0.035f);
                    float graphite = Math.min(0.58f,
                            line * 0.74f + shadow * shadow * 0.045f + hatch * 0.028f);
                    red = watercolorChannel(lr, neutral, 251f, wash, graphite, paper, border);
                    green = watercolorChannel(lg, neutral, 249f, wash, graphite, paper, border);
                    blue = watercolorChannel(lb, neutral, 244f, wash, graphite, paper, border);
                }
                output[i] = 0xff000000 | (red << 16) | (green << 8) | blue;
            }
        }
        return output;
    }

    private static int watercolorChannel(int color, float neutral, float paper,
            float wash, float graphite, float texture, float border) {
        float pigment = neutral + (color - neutral) * 0.78f;
        // Slightly simplify color bands without making hard posterized boundaries.
        pigment = pigment * 0.80f + Math.round(pigment / 12f) * 12f * 0.20f;
        float value = (paper + (pigment - paper) * wash) * (1f - graphite) + texture;
        return clamp255(Math.round(paper + (value - paper) * border));
    }

    private static int[] softenColors(int[] input, int width, int height, int passes) {
        int[] first = new int[input.length];
        int[] second = new int[input.length];
        int[] previous = input;
        int[] next = first;
        float[] weights = new float[256];
        for (int i = 0; i < weights.length; i++) {
            float difference = i / 24f;
            weights[i] = 1f / (1f + difference * difference);
        }
        for (int pass = 0; pass < passes; pass++) {
            checkCancelled();
            for (int y = 0; y < height; y++) {
                if ((y & 31) == 0) checkCancelled();
                int up = Math.max(0, y - 1) * width;
                int down = Math.min(height - 1, y + 1) * width;
                for (int x = 0; x < width; x++) {
                    int i = y * width + x;
                    int center = previous[i];
                    int left = previous[y * width + Math.max(0, x - 1)];
                    int right = previous[y * width + Math.min(width - 1, x + 1)];
                    int top = previous[up + x];
                    int bottom = previous[down + x];
                    float wl = colorWeight(center, left, weights);
                    float wr = colorWeight(center, right, weights);
                    float wt = colorWeight(center, top, weights);
                    float wb = colorWeight(center, bottom, weights);
                    float total = 1f + wl + wr + wt + wb;
                    int r = Math.round((red(center) + red(left) * wl + red(right) * wr
                            + red(top) * wt + red(bottom) * wb) / total);
                    int g = Math.round((green(center) + green(left) * wl + green(right) * wr
                            + green(top) * wt + green(bottom) * wb) / total);
                    int b = Math.round((blue(center) + blue(left) * wl + blue(right) * wr
                            + blue(top) * wt + blue(bottom) * wb) / total);
                    next[i] = 0xff000000 | (r << 16) | (g << 8) | b;
                }
            }
            previous = next;
            next = next == first ? second : first;
        }
        return previous;
    }

    private static int[] flattenTransparency(int[] input) {
        boolean hasTransparency = false;
        for (int pixel : input) {
            if ((pixel >>> 24) != 255) {
                hasTransparency = true;
                break;
            }
        }
        if (!hasTransparency) return input;
        int[] flattened = new int[input.length];
        for (int i = 0; i < input.length; i++) {
            if ((i & 0xffff) == 0) checkCancelled();
            int pixel = input[i];
            int alpha = pixel >>> 24;
            int white = 255 * (255 - alpha);
            int r = (red(pixel) * alpha + white + 127) / 255;
            int g = (green(pixel) * alpha + white + 127) / 255;
            int b = (blue(pixel) * alpha + white + 127) / 255;
            flattened[i] = 0xff000000 | (r << 16) | (g << 8) | b;
        }
        return flattened;
    }

    private static float colorWeight(int a, int b, float[] weights) {
        int difference = (Math.abs(red(a) - red(b)) + Math.abs(green(a) - green(b))
                + Math.abs(blue(a) - blue(b))) / 3;
        return weights[difference];
    }

    private static float contour(int[] gray, int x, int y, int width, int height) {
        if (x == 0 || y == 0 || x == width - 1 || y == height - 1) return 0f;
        int i = y * width + x;
        int gx = -gray[i - width - 1] + gray[i - width + 1]
                - 2 * gray[i - 1] + 2 * gray[i + 1]
                - gray[i + width - 1] + gray[i + width + 1];
        int gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
                + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
        float magnitude = (Math.abs(gx) + Math.abs(gy)) / 8f;
        return Math.min(1f, Math.max(0f, magnitude - 5f) / 65f);
    }

    private static float hatch(float x, float y, float shadow) {
        float primary = Math.abs(((x + y + noise((int) x / 19, (int) y / 17)) % 6f) - 3f);
        float secondary = Math.abs(((x - y + 10000f) % 7f) - 3.5f);
        float result = primary < 0.70f ? Math.max(0f, shadow - 0.20f) : 0f;
        if (secondary < 0.55f) result += Math.max(0f, shadow - 0.65f);
        return result;
    }

    private static float pigmentNoise(int x, int y) {
        int cellX = x / 24;
        int cellY = y / 24;
        float tx = smoothstep((x % 24) / 24f);
        float ty = smoothstep((y % 24) / 24f);
        float upper = lerp(noise(cellX, cellY), noise(cellX + 1, cellY), tx);
        float lower = lerp(noise(cellX, cellY + 1), noise(cellX + 1, cellY + 1), tx);
        return lerp(upper, lower, ty);
    }

    private static float noise(int x, int y) {
        int hash = x * 374761393 + y * 668265263 + 1274126177;
        hash = (hash ^ (hash >>> 13)) * 1274126177;
        return ((hash ^ (hash >>> 16)) & 0xffff) / 32767.5f - 1f;
    }

    private static void boxBlur(int[] source, int[] horizontal, int[] output,
            int width, int height, int radius) {
        int window = radius * 2 + 1;
        for (int y = 0; y < height; y++) {
            if ((y & 31) == 0) checkCancelled();
            int row = y * width;
            int sum = 0;
            for (int offset = -radius; offset <= radius; offset++) {
                sum += source[row + clamp(offset, 0, width - 1)];
            }
            for (int x = 0; x < width; x++) {
                horizontal[row + x] = sum / window;
                sum += source[row + clamp(x + radius + 1, 0, width - 1)]
                        - source[row + clamp(x - radius, 0, width - 1)];
            }
        }
        for (int x = 0; x < width; x++) {
            if ((x & 31) == 0) checkCancelled();
            int sum = 0;
            for (int offset = -radius; offset <= radius; offset++) {
                sum += horizontal[clamp(offset, 0, height - 1) * width + x];
            }
            for (int y = 0; y < height; y++) {
                output[y * width + x] = sum / window;
                sum += horizontal[clamp(y + radius + 1, 0, height - 1) * width + x]
                        - horizontal[clamp(y - radius, 0, height - 1) * width + x];
            }
        }
    }

    private static void checkCancelled() {
        if (Thread.currentThread().isInterrupted()) throw new CancellationException();
    }

    private static float smoothstep(float value) {
        float t = Math.max(0f, Math.min(1f, value));
        return t * t * (3f - 2f * t);
    }

    private static float lerp(float a, float b, float t) { return a + (b - a) * t; }
    private static int luminance(int rgb) { return (77 * red(rgb) + 150 * green(rgb) + 29 * blue(rgb)) >> 8; }
    private static int red(int rgb) { return (rgb >> 16) & 255; }
    private static int green(int rgb) { return (rgb >> 8) & 255; }
    private static int blue(int rgb) { return rgb & 255; }
    private static int clamp255(int value) { return clamp(value, 0, 255); }
    private static int clamp(int value, int min, int max) { return Math.max(min, Math.min(max, value)); }
}
