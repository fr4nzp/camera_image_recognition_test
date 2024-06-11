const video = document.getElementById('video');
const analyzeButton = document.getElementById('analyzeButton');

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
            })
            .catch(error => {
                console.error('Error analyzing the frame: ', error);
            });
    }, 'image/png');
});