const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

/**
 * Rebuilds the vehicle PNGs from the pristine artwork (70630f4) WITHOUT
 * cropping.
 *
 * The artwork keeps its own aspect ratio; only the pixel dimensions are
 * scaled down. Display size is controlled in CSS (object-contain), never by
 * cutting the picture.
 *
 * Proof: the output is compared pixel-by-pixel against the source rescaled
 * to the exact same output box. If the output had been cropped, the diff
 * would be huge; a pure rescale gives a near-zero diff.
 */
const files = ["pro.png", "mini.png", "suv.png", "premium.png", "AC-go.png", "bike.png"];
const outDir = path.join(__dirname, "public");
const MAX = 600;

async function diffStats(aPath, bPath) {
    const a = await sharp(aPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(bPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
        return { avg: -1, max: -1 };
    }

    let total = 0;
    let max = 0;
    for (let i = 0; i < a.data.length; i++) {
        const d = Math.abs(a.data[i] - b.data[i]);
        total += d;
        if (d > max) max = d;
    }
    return { avg: total / a.data.length, max };
}

(async () => {
    for (const f of files) {
        const tmp = path.join(os.tmpdir(), `rb2_${f}`);
        fs.writeFileSync(
            tmp,
            execSync(`git show 70630f4:client/public/${f}`, { maxBuffer: 1024 * 1024 * 64 })
        );

        const srcMeta = await sharp(tmp).metadata();
        const target = path.join(outDir, f);

        // fit: "inside" scales the whole image down to fit the box.
        // It never crops and never changes the aspect ratio.
        await sharp(tmp)
            .resize({
                width: MAX,
                height: MAX,
                fit: "inside",
                withoutEnlargement: true,
            })
            .png({ compressionLevel: 9, effort: 10 })
            .toFile(target);

        const outMeta = await sharp(target).metadata();

        // Reference: the full source rescaled to the same box, no crop.
        const ref = path.join(os.tmpdir(), `ref_${f}`);
        await sharp(tmp)
            .resize({
                width: outMeta.width,
                height: outMeta.height,
                fit: "fill",
            })
            .png()
            .toFile(ref);

        const { avg, max } = await diffStats(ref, target);
        const verdict = avg >= 0 && avg < 6 ? "NO CROP" : avg < 0 ? "ERR" : "CROP!";

        console.log(
            `${verdict.padEnd(8)} ${f.padEnd(12)} ${srcMeta.width}x${srcMeta.height} -> ${outMeta.width}x${outMeta.height}  ` +
                `${Math.round(fs.statSync(target).size / 1024)}KB  avgDiff=${avg.toFixed(2)} maxDiff=${max}`
        );
    }
})();
