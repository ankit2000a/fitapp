const express = require('express');
const { VertexAI } = require('@google-cloud/vertexai');

const app = express();
app.use(express.json({ limit: '50mb' }));

// 1. Shared secret token security
const PROXY_TOKEN = process.env.PROXY_TOKEN;
if (!PROXY_TOKEN) {
  console.warn("WARNING: PROXY_TOKEN env variable is not set. The proxy is currently unsecured!");
}

// 2. Initialize Vertex AI
// It automatically reads the GCP Project ID and service account role (via ADC)
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || 'us-central1';

const vertexAIConfig = {
  project: PROJECT_ID,
  location: LOCATION
};

if (LOCATION === 'global') {
  vertexAIConfig.apiEndpoint = 'aiplatform.googleapis.com';
}

const vertexAI = new VertexAI(vertexAIConfig);

app.post('/generate', async (req, res) => {
  // Authentication check using the custom secret token
  const token = req.headers['x-proxy-token'];
  if (PROXY_TOKEN && token !== PROXY_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid proxy token.' });
  }

  try {
    let { contents, model = 'gemini-3.1-flash-lite' } = req.body;
    if (!contents) {
      return res.status(400).json({ error: 'Missing required field: contents' });
    }

    // Ensure every content block has a valid role (Vertex AI requires role to be user or model)
    if (Array.isArray(contents)) {
      contents = contents.map(item => {
        if (!item.role) {
          return { ...item, role: 'user' };
        }
        return item;
      });
    }

    // Resolve generative model
    const generativeModel = vertexAI.getGenerativeModel({ model });

    // Call Vertex AI Gemini API
    const result = await generativeModel.generateContent({ contents });
    
    // Send standard Gemini API response back
    res.json(result.response);
  } catch (error) {
    console.error("Vertex AI Error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Vertex proxy listening on port ${PORT}`);
});
