require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({
  apiKey: process.env.API_KEY
});

app.post('/analyze', upload.single('image'), async (req, res) => {
    try {
        const base64_image = req.file.buffer.toString('base64');
        const descriptionLength = req.body.descriptionLength;
        const descriptionSpeed = req.body.descriptionSpeed;

        let max_tokens;
        switch(descriptionLength) {
            case 'long':
                max_tokens = 200;
                break;
            case 'medium':
                max_tokens = 100;
                break;
            case 'short':
                max_tokens = 50;
                break;
        }

        const gptResponse = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: `You are an assistant providing detailed descriptions of images for visually impaired individuals. Please provide a ${descriptionSpeed} description with ${descriptionLength} detail.`,
                },
                {
                    role: "user",
                    content: "Describe the following image:",
                },
                {
                    role: "user",
                    content: `data:image/jpeg;base64,${base64_image}`
                }
            ],
            max_tokens: max_tokens
        });

        const analysisResult = gptResponse.choices[0].message.content;
        console.log('GPT Response: ', analysisResult);

        res.json({ description: analysisResult });
    } catch (error) {
        console.error('Error processing the image: ', error);
        res.status(500).send('Error processing the image');
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
