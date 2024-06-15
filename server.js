require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { exec } = require('child_process');
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

// Verzeichnis für gespeicherte Bilder und Beschreibungen
const imageDir = path.join(__dirname, 'public', 'images');
const descriptionFile = path.join(__dirname, 'public', 'lastDescription.json');

if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

// Hilfsfunktion zum Berechnen eines Hash-Werts für das Bild
function getImageHash(imageBuffer) {
  return createHash('sha256').update(imageBuffer).digest('hex');
}

// Hilfsfunktion zum Vergleichen der neuen Beschreibung mit der vorherigen
async function isSignificantlyDifferent(newDesc, oldDesc) {
  if (!oldDesc) return true; // Falls keine alte Beschreibung vorhanden ist, neue Beschreibung verwenden

  // Verwende die OpenAI-API, um die Ähnlichkeit der Beschreibungen zu berechnen
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: [newDesc, oldDesc],
  });

  const newDescEmbedding = response.data[0].embedding;
  const oldDescEmbedding = response.data[1].embedding;

  // Berechne die Kosinusähnlichkeit der Embeddings
  const dotProduct = newDescEmbedding.reduce((sum, value, i) => sum + value * oldDescEmbedding[i], 0);
  const newDescMagnitude = Math.sqrt(newDescEmbedding.reduce((sum, value) => sum + value * value, 0));
  const oldDescMagnitude = Math.sqrt(oldDescEmbedding.reduce((sum, value) => sum + value * value, 0));

  const similarity = dotProduct / (newDescMagnitude * oldDescMagnitude);

  // Falls die Ähnlichkeit größer als 0.9 ist, als gleich behandeln
  return similarity <= 0.9;
}

// Warteschlange für Audio-Wiedergabe
let audioQueue = [];
let isPlaying = false;

function playAudioQueue() {
  if (audioQueue.length > 0 && !isPlaying) {
    isPlaying = true;
    const audioPath = audioQueue.shift();

    exec(`mpg321 ${audioPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error playing audio: ${error.message}`);
      } else {
        console.log('Audio played successfully');
      }
      isPlaying = false;
      playAudioQueue();
    });
  }
}

// Funktion zum Speichern der Beschreibung und des Bild-Hashes
function saveDescriptionData(newDescription, newImageHash) {
  const descriptionData = {
    description: newDescription,
    imageHash: newImageHash,
  };
  fs.writeFileSync(descriptionFile, JSON.stringify(descriptionData));
}

// Funktion zur Verarbeitung der TTS-Antwort
async function processTTSResponse(ttsResponse, res, newDescription, newImageHash) {
  /*
  if (ttsResponse && ttsResponse.body) {
    const audioPath = path.join(__dirname, 'public', 'speech.mp3');
    console.log('Audio Path:', audioPath);

    try {
      const stream = ttsResponse.body;
      const buffer = await new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });

      await fs.promises.writeFile(audioPath, buffer);
      console.log('Audio saved at:', audioPath);

      // Füge die Audiodatei zur Warteschlange hinzu und starte die Wiedergabe, falls noch nicht laufend
      audioQueue.push(audioPath);
      playAudioQueue();

      // Speichern der neuen Beschreibung und des Bild-Hashes
      saveDescriptionData(newDescription, newImageHash);

      res.json({ description: newDescription, audioPath: audioPath });
    } catch (err) {
      console.error('Error writing file:', err);
      res.status(500).send('Error writing audio file');
    }
  } else {
    console.error('TTS Response body is undefined or invalid');
    res.status(500).send('TTS Response body is undefined or invalid');
  }
  */
}

// Endpunkt zum Empfangen und Speichern von Bildern
app.post('/upload', upload.single('image'), (req, res) => {
  const imagePath = path.join(imageDir, 'current.jpg');
  fs.writeFileSync(imagePath, req.file.buffer);
  console.log('Image received and saved at: ', imagePath);
  res.send('Image received and saved');
});

// Endpunkt zur Bildanalyse
app.post('/analyze', upload.single('frame'), async (req, res) => {
  try {
    const imageBuffer = req.file.buffer;
    const base64_image = imageBuffer.toString('base64');

    // Berechne den Hash-Wert des aktuellen Bildes
    const newImageHash = getImageHash(imageBuffer);

    let lastImageHash = '';
    let lastDescription = '';

    if (fs.existsSync(descriptionFile)) {
      const lastDescriptionData = JSON.parse(fs.readFileSync(descriptionFile, 'utf-8'));
      lastImageHash = lastDescriptionData.imageHash;
      lastDescription = lastDescriptionData.description;
    }

    // Prüfe, ob das Bild signifikant anders ist als das vorherige Bild
    if (newImageHash === lastImageHash) {
      console.log('No significant changes detected');
      
      // Verfeinere die vorherige Beschreibung weiter
      const refinedResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Erweitere die folgende Beschreibung mit zusätzlichen Details, um eine genauere Vorstellung der Umgebung zu geben: "${lastDescription}".`
          },
          {
            role: 'user',
            content: `Erkläre dem Blinden mehr Details zu dem, was auf dem Bild zu sehen ist, basierend auf der vorherigen Beschreibung: "${lastDescription}".`
          }
        ],
      });

      const refinedDescription = refinedResponse.choices[0].message.content;
      console.log('Refined GPT Response: ', refinedDescription);

      /*
      // TTS-Anfrage für die verfeinerte Beschreibung
      const ttsResponse = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: refinedDescription,
      });

      console.log('TTS Response: ', ttsResponse);

      await processTTSResponse(ttsResponse, res, refinedDescription, newImageHash);
      */

      // Nur die Beschreibung zurückgeben
      saveDescriptionData(refinedDescription, newImageHash);
      res.json({ description: refinedDescription });
      return;
    }

    // Erstelle eine vollständige Beschreibung für das erste Bild
    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Beschreibe die Objekte und Ereignisse im Bild klar und präzise in maximal 50-60 Wörtern. Vermeide Farben. Nutze Richtungsangaben wie 'links', 'rechts', 'vor dir' und 'hinter dir'. Gib Entfernungen und Größenverhältnisse verständlich an. Beschreibe die Mimik und Gestik von Personen und erwähne mögliche soziale Interaktionen. Beginne mit dem Vordergrund, gehe dann zum Hintergrund über und beschließe mit der Gesamtumgebung.`,
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

    const newDescription = gptResponse.choices[0].message.content;
    console.log('GPT Response: ', newDescription);

    // Vergleich der neuen Beschreibung mit der alten Beschreibung
    const isDifferent = await isSignificantlyDifferent(newDescription, lastDescription);
    if (isDifferent) {
      console.log('Neuer Inhalt. Vorlesen der neuen Informationen.');
    } else {
      console.log('Inhalt ist gleich. Keine Audio-Datei wird vorgelesen.');
      return res.json({ description: 'No significant changes detected' });
    }

    if (isDifferent) {
      /*
      // TTS-Anfrage
      const ttsResponse = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: newDescription,
      });

      console.log('TTS Response: ', ttsResponse);

      await processTTSResponse(ttsResponse, res, newDescription, newImageHash);
      */

      // Nur die Beschreibung zurückgeben
      saveDescriptionData(newDescription, newImageHash);
      res.json({ description: newDescription });
    } else {
      res.json({ description: 'No significant changes detected' });
    }
  } catch (error) {
    console.error('Error processing the image: ', error);
    res.status(500).send('Error processing the image');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
