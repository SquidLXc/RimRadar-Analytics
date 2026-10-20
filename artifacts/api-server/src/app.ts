import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Render terminates TLS in front of the service; trust its proxy header so the
// Discord OAuth redirect URI and secure cookies use https.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

// In Render's single-service deployment, the API process also serves the
// built Vite app so the browser and /api requests share one origin.
const nbaWebDir = path.resolve(process.cwd(), "artifacts/nba-snipes/dist/public");
if (existsSync(path.join(nbaWebDir, "index.html"))) {
  app.use(express.static(nbaWebDir, { index: false }));
  app.get("/{*splat}", (req, res) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      res.status(404).json({ error: "API endpoint not found" });
      return;
    }
    res.sendFile(path.join(nbaWebDir, "index.html"));
  });
}

export default app;
