import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import orderRoutes from './routes/orders.routes';
import { errorHandler } from './middlewares/errorHandler';
import helmet from 'helmet';

const app = express();
app.disable('x-powered-by');
app.use(helmet())

//Allow requests from your frontend
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
  }));

app.use(express.json());

app.use('/api/orders', orderRoutes);

app.use(errorHandler);

export default app;
