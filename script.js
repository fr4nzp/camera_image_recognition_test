const video = document.getElementById('video');
const analyzeButton = document.getElementById('analyzeButton');
const descriptionLength = document.getElementById('descriptionLength');
const descriptionSpeed = document.getElementById('descriptionSpeed');
const ttsSpeed = document.getElementById('descriptionSpeed');

async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
    } catch (err) {
        console.error('Error accessing the camera: ', err);
        if (err.name === 'NotFoundError') {
            alert('No camera device found. Please ensure your camera is connected and not being used by another application.');
        } else if (err.name === 'NotAllowedError') {
            alert('Permission to access camera was denied. Please allow camera access in your browser settings.');
        } else {
            alert(`An unexpected error occurred: ${err.message}`);
        }
    }
}

initCamera();

analyzeButton.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
        const formData = new FormData();
        const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' });
        formData.append('image', file);
        formData.append('descriptionLength', descriptionLength.value);
        formData.append('descriptionSpeed', descriptionSpeed.value);

        axios.post('/analyze', formData)
            .then(response => {
                const analysisResult = response.data.description;
                console.log('Analyseergebnis: ', analysisResult);
                alert('Analyseergebnis: ' + analysisResult);
                speakText(analysisResult, ttsSpeed.value);
            })
            .catch(error => {
                console.error('Fehler bei der Analyse des Frames: ', error);
            });
    }, 'image/jpeg');
});

function speakText(text, speed) {
    const speechSynthesis = window.speechSynthesis;
    if (speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'de-DE';

        switch (speed) {
            case 'very_fast':
                utterance.rate = 2;
                break;
            case 'fast':
                utterance.rate = 1.5;
                break;
            case 'medium':
                utterance.rate = 1;
                break;
            default:
                utterance.rate = 1;
        }

        speechSynthesis.speak(utterance);
    } else {
        console.error('Text-to-Speech wird in diesem Browser nicht unterstützt.');
    }
}
