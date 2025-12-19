require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DeepTech Platform API',
      version: '1.0.0',
      description: 'API for projects and experts',
    },
    servers: [
      { url: `http://localhost:${PORT}` }
    ],
    tags: [
      { name: 'Contract Lifecycle', description: 'Hiring and status management' },
      { name: 'Hour Logging', description: 'Expert work tracking' },
      { name: 'Contract Review & Analytics', description: 'Buyer approvals and summaries' },
      { name: 'Projects', description: 'Project management' },
      { name: 'Experts', description: 'Expert discovery' },
      { name: 'Messages', description: 'Communication' }
    ],
  },
  apis: ['./routes/*.js'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use('/api/projects', require('./routes/projectRoutes'));
app.use('/api/experts', require('./routes/expertRoutes'));
app.use('/api/conversations', require('./routes/messageRoutes')); 
app.use('/api/contracts', require('./routes/contractRoutes'));

app.get('/', (req, res) => {
  res.json({ message: "DeepTech API Running" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Swagger Docs at http://localhost:${PORT}/api-docs`);
});