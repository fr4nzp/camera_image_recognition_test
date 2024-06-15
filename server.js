require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { createHash } = require('crypto');

const OpenAI_Api = process.env.API_KEY;

const openai = new OpenAI({
  apiKey: OpenAI_Api,
});

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const imageDir = path.join(__dirname, 'public', 'images');
const descriptionFile = path.join(__dirname, 'public', 'lastDescription.json');

if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

function getImageHash(imageBuffer) {
  return createHash('sha256').update(imageBuffer).digest('hex');
}

async function isSignificantlyDifferent(newDesc, oldDesc) {
  if (!oldDesc) return true;

  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: [newDesc, oldDesc],
  });

  const newDescEmbedding = response.data[0].embedding;
  const oldDescEmbedding = response.data[1].embedding;

  const dotProduct = newDescEmbedding.reduce((sum, value, i) => sum + value * oldDescEmbedding[i], 0);
  const newDescMagnitude = Math.sqrt(newDescEmbedding.reduce((sum, value) => sum + value * value, 0));
  const oldDescMagnitude = Math.sqrt(oldDescEmbedding.reduce((sum, value) => sum + value * value, 0));

  const similarity = dotProduct / (newDescMagnitude * oldDescMagnitude);

  return similarity <= 0.9;
}

function saveDescriptionData(newDescription, newImageHash) {
  const descriptionData = {
    description: newDescription,
    imageHash: newImageHash,
  };
  fs.writeFileSync(descriptionFile, JSON.stringify(descriptionData));
}

app.post('/upload', upload.single('image'), (req, res) => {
  const imagePath = path.join(imageDir, 'current.jpg');
  fs.writeFileSync(imagePath, req.file.buffer);
  console.log('Image received and saved at: ', imagePath);
  res.send('Image received and saved');
});

app.post('/analyze', upload.single('frame'), async (req, res) => {
  try {
    const imageBuffer = req.file.buffer;
    const base64_image = imageBuffer.toString('base64');

    const newImageHash = getImageHash(imageBuffer);

    let lastImageHash = '';
    let lastDescription = '';

    if (fs.existsSync(descriptionFile)) {
      const lastDescriptionData = JSON.parse(fs.readFileSync(descriptionFile, 'utf-8'));
      lastImageHash = lastDescriptionData.imageHash;
      lastDescription = lastDescriptionData.description;
    }

    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: newImageHash === lastImageHash
            ? `Das Bild ähnelt dem vorherigen. Gehe ins Detail und beschreibe spezifischere Unterschiede und Details, die im neuen Bild vorhanden sind.`
            : `Beschreibe die Objekte und Ereignisse im Bild klar und präzise in maximal 50-60 Wörtern. Vermeide Farben. Nutze Richtungsangaben wie 'links', 'rechts', 'vor dir' und 'hinter dir'. Gib Entfernungen und Größenverhältnisse verständlich an. Beschreibe die Mimik und Gestik von Personen und erwähne mögliche soziale Interaktionen. Beginne mit dem Vordergrund, gehe dann zum Hintergrund über und beschließe mit der Gesamtumgebung.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Erkläre dem Blinden, was auf dem Bild zu sehen ist, um ihm dabei zu helfen, sich die Umgebung, in der er sich befindet, besser vorzustellen.` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64_image}` } },
          ],
        },
      ],
    });

    let newDescription = gptResponse.choices[0].message.content;
    console.log('GPT Response: ', newDescription);

    if (newImageHash === lastImageHash) {
      newDescription = "Das Bild ähnelt dem vorherigen: " + newDescription;
    }

    saveDescriptionData(newDescription, newImageHash);

    res.json({ description: newDescription });

  } catch (error) {
    console.error('Error processing the image: ', error);
    res.status(500).send('Error processing the image');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
