import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/generate-image", async (req, res) => {
    const { prompt } = req.body;
    if (!process.env.FREEPIK_API_KEY) {
      console.error("FREEPIK_API_KEY is missing!");
      return res.status(500).json({ error: "API key is missing" });
    }
    try {
      const response = await fetch("https://api.freepik.com/v1/ai/text-to-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-freepik-api-key": process.env.FREEPIK_API_KEY!,
        },
        body: JSON.stringify({
          prompt,
          num_images: 1,
          image: {
            size: "1024x1024"
          }
        }),
      });
      const data = await response.json();
      console.log("Freepik API response:", JSON.stringify(data, null, 2));
      if (!response.ok) {
        res.status(response.status).json({ error: data.message || "Freepik API error" });
      } else {
        res.json(data);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
