// src/app.ts
import express from "express";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import mime from "mime-types";
import restaurantsRoutes from "./routes/restaurants.routes";

const app = express();

// Hide framework header
app.disable("x-powered-by");

// SECURITY HEADER SHIM — runs first and re-applies headers right before send
app.use((req, res, next) => {
  const setSecurityHeaders = () => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
    );
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Debug-CSP", "on"); // for verification
  };

  // set once (for handlers that don't touch writeHead)
  setSecurityHeaders();

  // ensure we win even if something later overwrites CSP/XFO
  const origWriteHead = res.writeHead;
  res.writeHead = function (...args: any[]) {
    setSecurityHeaders(); // re-apply right before headers are committed
    // @ts-ignore
    return origWriteHead.apply(this, args);
  };

  next();
});

// Use Helmet for extras ONLY — disable CSP / frameguard so it doesn't fight us
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    hsts: process.env.NODE_ENV === "production" ? undefined : false, // avoid HSTS over HTTP in dev
  })
);

// CORS
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());

app.get("/robots.txt", (_req, res) =>
  res.type("text/plain").send("User-agent: *\nDisallow: /")
);
app.get("/sitemap.xml", (_req, res) =>
  res
    .type("application/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`
    )
);
app.get("/sitemap.txt", (_req, res) => res.type("text/plain").send(""));

// API routes
app.use("/api/restaurants", restaurantsRoutes);

// Static uploads — DO NOT set another CSP here (it would overwrite!)
app.use(
  "/uploads",
  (req, res, next) => {
    const ext = path.extname(req.path).toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".gif"];
    if (!allowed.includes(ext)) return res.status(403).send("Forbidden");
    res.setHeader(
      "Content-Type",
      mime.lookup(ext) || "application/octet-stream"
    );
    next();
  },
  express.static(path.join(__dirname, "../uploads"))
);

// Final 404 for all other paths (keeps headers consistent)
app.use((req, res) => res.status(404).type("text/plain").send("Not found"));

export default app;
