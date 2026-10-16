import QRCode from 'qrcode';

export async function fakeCamera(page, qr, deny = false) {
  const dataUrl = await QRCode.toDataURL(qr, { width: 480, margin: 5 });
  await page.addInitScript(({ dataUrl, deny }) => {
    window.testDenyCamera = deny;
    navigator.mediaDevices.getUserMedia = async () => {
      if (window.testDenyCamera) throw new DOMException('Permission denied', 'NotAllowedError');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 960;
      const context = canvas.getContext('2d');
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      window.testSetQr = async (nextDataUrl) => { image.src = nextDataUrl; await image.decode(); };
      const draw = () => {
        context.fillStyle = 'white';
        context.fillRect(0, 0, 960, 960);
        context.drawImage(image, 240, 240);
        requestAnimationFrame(draw);
      };
      draw();
      const stream = canvas.captureStream(15);
      window.testStream = stream;
      return stream;
    };
  }, { dataUrl, deny });
}

