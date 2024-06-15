const video = document.getElementById('video');
const analyzeButton = document.getElementById('analyzeButton');
const audioPlayer = document.createElement('audio');
document.body.appendChild(audioPlayer);

navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        video.srcObject = stream;
    })
    .catch(error => {
        console.error('Error accessing the camera: ', error);
    });

analyzeButton.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
        const formData = new FormData();
        formData.append('frame', blob, 'frame.png');

        axios.post('http://localhost:3000/analyze', formData)
            .then(response => {
                console.log('Analysis result: ', response.data);
                alert('Analysis result: ' + response.data.description);
                
                if (response.data.audioUrl) {
                    audioPlayer.src = response.data.audioUrl;
                    audioPlayer.play()
                        .then(() => console.log('Audio is playing'))
                        .catch(error => console.error('Error playing audio:', error));
                }
            })
            .catch(error => {
                console.error('Error analyzing the frame: ', error);
            });
    }, 'image/png');
});
