import express from 'express';
import cors from 'cors'; 
import authRoutes from './routes/users.routes';
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

// Your routes
app.use('/api/auth', authRoutes);

export default app;
