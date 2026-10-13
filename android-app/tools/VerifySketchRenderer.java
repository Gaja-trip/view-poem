import kr.co.punggyeongsi.app.SketchRenderer;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.Arrays;
import java.util.concurrent.CancellationException;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/** Run with the JDK, using the same renderer that is packaged in the APK. */
public final class VerifySketchRenderer {
    public static void main(String[] args) throws Exception {
        checkProperties();
        if (args.length == 2) renderExamples(args[0], args[1]);
        System.out.println("Sketch renderer verification passed.");
    }

    private static void checkProperties() {
        int width = 120;
        int height = 90;
        int[] input = new int[width * height];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                input[y * width + x] = x < 60 ? 0xff4089b8 : 0xff46753b;
            }
        }
        int[] untouched = input.clone();
        int[] pencil = SketchRenderer.render(input, width, height, SketchRenderer.Style.PENCIL, 70);
        int[] zero = SketchRenderer.render(input, width, height, SketchRenderer.Style.WATERCOLOR, 0);
        require(Arrays.equals(pencil, zero), "0% must produce the pencil image");
        for (int pixel : pencil) {
            require(((pixel >> 16) & 255) == ((pixel >> 8) & 255)
                    && ((pixel >> 8) & 255) == (pixel & 255), "Pencil pixels must be neutral");
        }
        int previousChroma = -1;
        for (int strength : new int[]{30, 70, 100}) {
            int[] result = SketchRenderer.render(input, width, height,
                    SketchRenderer.Style.WATERCOLOR, strength);
            require(result.length == input.length, "Dimensions must be preserved");
            require(!Arrays.equals(result, pencil), "Watercolor must contain color");
            int pixel = result[45 * width + 30];
            int max = Math.max((pixel >> 16) & 255, Math.max((pixel >> 8) & 255, pixel & 255));
            int min = Math.min((pixel >> 16) & 255, Math.min((pixel >> 8) & 255, pixel & 255));
            require(max - min > previousChroma, "Color slider must increase pigment");
            previousChroma = max - min;
            for (int value : result) require((value >>> 24) == 255, "Output must be opaque JPEG-ready pixels");
        }
        require(Arrays.equals(input, untouched), "Source pixels must never be modified");
        int[] transparent = new int[width * height];
        int[] transparentResult = SketchRenderer.render(transparent, width, height,
                SketchRenderer.Style.WATERCOLOR, 70);
        int transparentCenter = transparentResult[45 * width + 30];
        require(((transparentCenter >> 16) & 255) > 240,
                "Transparent gallery images must be composited on paper, not black");
        require(Arrays.equals(
                SketchRenderer.render(input, width, height, SketchRenderer.Style.WATERCOLOR, 70),
                SketchRenderer.render(input, width, height, SketchRenderer.Style.WATERCOLOR, 70)),
                "Texture must be stable across slider changes and restoration");
        for (int[] size : new int[][]{{1, 1}, {1, 100}, {100, 1}, {9, 17}}) {
            int[] small = new int[size[0] * size[1]];
            Arrays.fill(small, 0xffffffff);
            require(SketchRenderer.render(small, size[0], size[1], SketchRenderer.Style.WATERCOLOR, 70)
                    .length == small.length, "Tiny image must not fail");
        }
        boolean cancelled = false;
        Thread.currentThread().interrupt();
        try {
            SketchRenderer.render(input, width, height, SketchRenderer.Style.WATERCOLOR, 70);
        } catch (CancellationException expected) {
            cancelled = true;
        } finally {
            Thread.interrupted();
        }
        require(cancelled, "Activity cancellation must stop rendering");
    }

    private static void renderExamples(String inputPath, String outputPath) throws Exception {
        BufferedImage image;
        try (ImageInputStream stream = ImageIO.createImageInputStream(new File(inputPath))) {
            require(stream != null, "Example stream must open");
            ImageReader reader = ImageIO.getImageReaders(stream).next();
            try {
                reader.setInput(stream);
                int sample = Math.max(1, Math.max(reader.getWidth(0), reader.getHeight(0)) / 900);
                ImageReadParam parameters = reader.getDefaultReadParam();
                parameters.setSourceSubsampling(sample, sample, 0, 0);
                image = reader.read(0, parameters);
            } finally {
                reader.dispose();
            }
        }
        require(image != null, "Example image must decode");
        float scale = Math.min(1f, 900f / Math.max(image.getWidth(), image.getHeight()));
        int width = Math.max(1, Math.round(image.getWidth() * scale));
        int height = Math.max(1, Math.round(image.getHeight() * scale));
        BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = resized.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        graphics.drawImage(image, 0, 0, width, height, null);
        graphics.dispose();
        int[] original = resized.getRGB(0, 0, width, height, null, 0, width);
        File directory = new File(outputPath);
        require(directory.isDirectory() || directory.mkdirs(), "Example directory must exist");
        ImageIO.write(resized, "png", new File(directory, "original.png"));
        for (int strength : new int[]{0, 30, 70, 100}) {
            long start = System.nanoTime();
            int[] result = SketchRenderer.render(original, width, height,
                    SketchRenderer.Style.WATERCOLOR, strength);
            long elapsed = (System.nanoTime() - start) / 1_000_000;
            BufferedImage preview = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            preview.setRGB(0, 0, width, height, result, 0, width);
            ImageIO.write(preview, "png", new File(directory, "sketch-" + strength + ".png"));
            System.out.println(width + "x" + height + " strength=" + strength + " elapsed=" + elapsed + "ms");
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
