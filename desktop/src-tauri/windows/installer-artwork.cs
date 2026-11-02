using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace SiloLink {
    // Reproduce the selected CSS perspective and layered shadow in the native bitmap.
    public static class InstallerArtwork {
        const int TextureSize = 512;
        static readonly double Z = 14 * Math.PI / 180;
        static readonly double Y = -23 * Math.PI / 180;

        static byte[] Read(Bitmap image) {
            BitmapData data = image.LockBits(new Rectangle(0, 0, image.Width, image.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try {
                byte[] bytes = new byte[image.Width * image.Height * 4];
                Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
                return bytes;
            } finally { image.UnlockBits(data); }
        }
        static Bitmap Write(byte[] bytes, int width, int height) {
            Bitmap image = new Bitmap(width, height, PixelFormat.Format32bppArgb);
            BitmapData data = image.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            try { Marshal.Copy(bytes, 0, data.Scan0, bytes.Length); }
            finally { image.UnlockBits(data); }
            return image;
        }
        static byte[] Front(Image original) {
            using (Bitmap normalized = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb)) {
                using (Graphics graphics = Graphics.FromImage(normalized)) { graphics.DrawImageUnscaled(original, 0, 0); }
                byte[] pixels = Read(normalized);
                int left = original.Width, top = original.Height, right = 0, bottom = 0;
                for (int y = 0; y < original.Height; y++) for (int x = 0; x < original.Width; x++) {
                    if (pixels[(y * original.Width + x) * 4 + 3] < 32) continue;
                    left = Math.Min(left, x); top = Math.Min(top, y);
                    right = Math.Max(right, x); bottom = Math.Max(bottom, y);
                }
                if (right <= left || bottom <= top) throw new InvalidOperationException("The app icon has no visible pixels.");
                using (Bitmap texture = new Bitmap(TextureSize, TextureSize, PixelFormat.Format32bppArgb)) {
                    using (Graphics graphics = Graphics.FromImage(texture)) {
                        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        graphics.DrawImage(normalized, new Rectangle(0, 0, TextureSize, TextureSize),
                            new Rectangle(left, top, right - left + 1, bottom - top + 1), GraphicsUnit.Pixel);
                    }
                    byte[] front = Read(texture);
                    byte[] alpha = new byte[TextureSize * TextureSize];
                    for (int i = 0; i < alpha.Length; i++) alpha[i] = front[i * 4 + 3];
                    // The highlight follows the original rounded silhouette, not the white S.
                    for (int y = 0; y < TextureSize; y++) for (int x = 0; x < TextureSize; x++) {
                        int i = y * TextureSize + x;
                        int neighbor = x < 2 || y < 2 ? 0 : alpha[(y - 2) * TextureSize + x - 2];
                        double rim = Math.Max(0, alpha[i] - neighbor) / 255.0 * .34;
                        for (int c = 0; c < 3; c++) front[i * 4 + c] = (byte)(front[i * 4 + c] * (1 - rim) + 225 * rim);
                    }
                    return front;
                }
            }
        }
        static double Sample(byte[] source, int x, int y, double tx, double ty, int channel) {
            int i = (y * TextureSize + x) * 4 + channel;
            double top = source[i] * (1 - tx) + source[i + 4] * tx;
            double bottom = source[i + TextureSize * 4] * (1 - tx) + source[i + TextureSize * 4 + 4] * tx;
            return top * (1 - ty) + bottom * ty;
        }
        static void Layer(byte[] output, int width, int height, byte[] texture, int scale, int depth) {
            double a = Math.Cos(Y) * Math.Cos(Z), b = -Math.Cos(Y) * Math.Sin(Z);
            double c = Math.Sin(Z), d = Math.Cos(Z);
            double e = -Math.Sin(Y) * Math.Cos(Z), f = Math.Sin(Y) * Math.Sin(Z);
            double shrink = 1 - depth * .0015;
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                double px = (x / (double)scale - 160 - depth * .6) / shrink;
                double py = (y / (double)scale - 150 - depth * .85) / shrink;
                double aa = a + px * e / 750, bb = b + px * f / 750;
                double cc = c + py * e / 750, dd = d + py * f / 750;
                double determinant = aa * dd - bb * cc;
                if (Math.Abs(determinant) < .00001) continue;
                double u = (px * dd - bb * py) / determinant;
                double v = (aa * py - px * cc) / determinant;
                double sx = (u / 210 + .5) * (TextureSize - 1);
                double sy = (v / 210 + .5) * (TextureSize - 1);
                if (sx < 0 || sy < 0 || sx >= TextureSize - 1 || sy >= TextureSize - 1) continue;
                int ix = (int)sx, iy = (int)sy;
                double tx = sx - ix, ty = sy - iy;
                double opacity = Sample(texture, ix, iy, tx, ty, 3) / 255.0;
                if (opacity < .001) continue;
                int i = (y * width + x) * 4;
                double previous = output[i + 3] / 255.0;
                double alpha = opacity + previous * (1 - opacity);
                for (int channel = 0; channel < 3; channel++) {
                    double value = depth == 0 ? Sample(texture, ix, iy, tx, ty, channel) : 12 + (16 - depth) * .65 + (channel == 0 ? 2 : 0);
                    output[i + channel] = (byte)((value * opacity + output[i + channel] * previous * (1 - opacity)) / alpha);
                }
                output[i + 3] = (byte)(alpha * 255);
            }
        }
        static byte[] Blur(byte[] source, int width, int height, int radius) {
            byte[] horizontal = new byte[source.Length], result = new byte[source.Length];
            int diameter = radius * 2 + 1;
            for (int y = 0; y < height; y++) {
                int sum = 0;
                for (int k = -radius; k <= radius; k++) if (k >= 0 && k < width) sum += source[y * width + k];
                for (int x = 0; x < width; x++) {
                    horizontal[y * width + x] = (byte)(sum / diameter);
                    if (x - radius >= 0) sum -= source[y * width + x - radius];
                    if (x + radius + 1 < width) sum += source[y * width + x + radius + 1];
                }
            }
            for (int x = 0; x < width; x++) {
                int sum = 0;
                for (int k = -radius; k <= radius; k++) if (k >= 0 && k < height) sum += horizontal[k * width + x];
                for (int y = 0; y < height; y++) {
                    result[y * width + x] = (byte)(sum / diameter);
                    if (y - radius >= 0) sum -= horizontal[(y - radius) * width + x];
                    if (y + radius + 1 < height) sum += horizontal[(y + radius + 1) * width + x];
                }
            }
            return result;
        }
        public static Bitmap Block(Image original, int scale) {
            int width = 320 * scale, height = 340 * scale;
            byte[] texture = Front(original);
            byte[] output = new byte[width * height * 4];
            for (int depth = 15; depth >= 0; depth--) Layer(output, width, height, texture, scale, depth);
            byte[] shadow = new byte[width * height];
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                int sx = x - 12 * scale, sy = y - 20 * scale;
                if (sx >= 0 && sy >= 0) shadow[y * width + x] = output[(sy * width + sx) * 4 + 3];
            }
            for (int pass = 0; pass < 3; pass++) shadow = Blur(shadow, width, height, 9 * scale);
            byte[] shadowRgba = new byte[output.Length];
            for (int i = 0; i < shadow.Length; i++) shadowRgba[i * 4 + 3] = (byte)(shadow[i] * .62);
            Bitmap result = Write(shadowRgba, width, height);
            using (Bitmap block = Write(output, width, height))
            using (Graphics graphics = Graphics.FromImage(result)) { graphics.DrawImageUnscaled(block, 0, 0); }
            return result;
        }
    }
}
