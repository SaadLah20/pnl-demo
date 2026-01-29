import express from "express";
import cors from "cors";
import { getPnls } from "./pnl.repo";

const app = express();

app.use(cors());
app.use(express.json());

// ✅ Route test (root)
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "pnl-creator-api" });
});

// ✅ Route test health
app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ✅ Exemple: récupérer les Pnls
app.get("/pnls", async (_req, res) => {
  try {
    const data = await getPnls();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(3001, () => {
  console.log("API running on http://localhost:3001");
});
