import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@mediapipe", "pose");
const target = join(root, "public", "mediapipe");
const assets = [
  "pose.js",
  "pose_landmark_lite.tflite",
  "pose_solution_packed_assets.data",
  "pose_solution_packed_assets_loader.js",
  "pose_solution_simd_wasm_bin.js",
  "pose_solution_simd_wasm_bin.wasm",
  "pose_solution_wasm_bin.js",
  "pose_solution_wasm_bin.wasm",
  "pose_web.binarypb",
];

await mkdir(target, { recursive: true });
await Promise.all(assets.map((asset) => copyFile(join(source, asset), join(target, asset))));
