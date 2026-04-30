import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerRoutes } from "./routes.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("view engine", "ejs");
app.set("views", resolve(__dirname, "../templates"));
registerRoutes(app);
const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
    console.log(`Course planner running at http://localhost:${PORT}`);
});
