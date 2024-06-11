require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const { OpenAI } = require('openai');
const base64 = require('base64-js');

const client = new ImageAnnotatorClient();
const openai = new OpenAI({
    apiKey: process.env.API_KEY,
});
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.post('/analyze', upload.single('frame'), async (req, res) => {
    try {
        // const [visionResult] = await client.labelDetection({ image: { content: req.file.buffer } });
        // const labels = visionResult.labelAnnotations.map(label => label.description);
        // const prompt = `Describe the following scene with detailed sentences based on these elements: ${labels.join(', ')}.`;

        const base64_image = base64.fromByteArray(req.file.buffer);

        const gptResponse = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            "messages": [
                {
                  "role": "user",
                  "content": [
                    {
                      "type": "text",
                      "text": "What’s in this image?"
                    },
                    {
                      "type": "image_url",
                      "image_url": {
                        "url": `data:image/jpeg;base64,${base64_image}`
                      }
                    }
                  ]
                }
              ],
            max_tokens: 150
        });
        console.log('GPT Response: ', gptResponse.choices);
        res.json({ description: gptResponse.choices[0].message.content });
    } catch (error) {
        console.error('Error processing the image: ', error);
        res.status(500).send('Error processing the image');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});