import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import modelsRouter from './routes/models.js';
import huggingfaceRouter from './routes/huggingface.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', modelsRouter);
app.use('/api/huggingface', huggingfaceRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`CivitAI API Key: ${process.env.CIVITAI_API_KEY ? 'Yes' : 'No'}`);
  console.log(`HuggingFace Token: ${process.env.HUGGINGFACE_TOKEN ? 'Yes' : 'No (optional)'}`);
});
