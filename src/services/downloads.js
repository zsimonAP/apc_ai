import { spawn } from "node:child_process";

const PY_CMD = process.env.PYTHON_CMD || "python3";

/**
 * Takes a CSV spec (object) and returns { filename, buffer } from Python.
 * Throws on non-zero exit or parse errors.
 */
export async function buildCsvWithPython(csvSpec, pythonCmd = PY_CMD) {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, ["scripts/make_csv.py"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks = [];
    const errChunks = [];

    proc.stdout.on("data", (d) => chunks.push(d));
    proc.stderr.on("data", (d) => errChunks.push(d));

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `make_csv.py exited with code ${code}: ${Buffer.concat(errChunks).toString()}`
          )
        );
      }
      const out = Buffer.concat(chunks);
      const nul = out.indexOf(0x00);
      if (nul < 0) return reject(new Error("Invalid CSV payload from Python."));
      const filename = out.slice(0, nul).toString("utf-8") || "export.csv";
      const buffer = out.slice(nul + 1);
      resolve({ filename, buffer });
    });

    // send JSON spec to stdin
    proc.stdin.write(JSON.stringify(csvSpec));
    proc.stdin.end();
  });
}

/**
 * Express handler: POST /api/csv/download
 * Body: { csvjson: {...} }
 * Responds with downloadable CSV.
 */
export async function createCsvDownload(req, res) {
  try {
    const csvSpec = req.body?.csvjson;
    if (!csvSpec || typeof csvSpec !== "object") {
      return res.status(400).json({ error: "Missing csvjson object" });
    }
    const { filename, buffer } = await buildCsvWithPython(csvSpec);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename.replace(/"/g, "")}"`
    );
    res.send(buffer);
  } catch (err) {
    console.error("CSV download error:", err);
    res.status(500).json({ error: "CSV generation failed" });
  }
}
