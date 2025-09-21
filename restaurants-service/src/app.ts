import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors'; 
import restaurantsRoutes from './routes/restaurants.routes';
import path from 'path';
import helmet from 'helmet';
import mime from "mime-types";

const app = express();
app.disable('x-powered-by');
app.use(helmet())

//Allow requests from your frontend
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
  }));

app.use(express.json());

app.use('/api/restaurants', restaurantsRoutes);
app.use("/uploads", (req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();

  // Allow only safe image extensions
  const allowed = [".jpg", ".jpeg", ".png", ".gif"];
  if (!allowed.includes(ext)) {
    return res.status(403).send("Forbidden");
  }

  // Set correct MIME type
  const type = mime.lookup(ext) || "application/octet-stream";
  res.setHeader("Content-Type", type);

  // Add CSP header for images
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:");

  next();
}, express.static(path.join(__dirname, "../uploads")));


export default app;
